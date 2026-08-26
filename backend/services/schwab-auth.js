import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from backend/.env first, then cwd fallback
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config(); // fallback to cwd .env

// ─── Config ──────────────────────────────────────────────────────────────

const CLIENT_ID = process.env.SCHWAB_CLIENT_ID;
const CLIENT_SECRET = process.env.SCHWAB_CLIENT_SECRET;
const CALLBACK_URL = process.env.SCHWAB_CALLBACK_URL || "https://127.0.0.1:3000";

const AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const REFRESH_TOKEN_DAYS_MAX = 7;

/** In-memory PKCE code_verifier from the active or latest auth flow. */
let activeVerifier = null;

/**
 * Get the current or most recent PKCE verifier.
 * @returns {string | null}
 */
function getLastVerifier() {
  return activeVerifier;
}

/**
 * Set the active PKCE verifier.
 * @param {string | null} v
 */
function setLastVerifier(v) {
  activeVerifier = v;
}

/**
 * Resolve the token file path, anchored to backend/ if relative.
 * @returns {string}
 */
function getTokenPath() {
  const custom = process.env.SCHWAB_TOKEN_PATH;
  if (custom) {
    return path.isAbsolute(custom) ? custom : path.resolve(__dirname, "..", custom);
  }
  return path.join(__dirname, "..", ".schwab-token.json");
}

// ─── PKCE ────────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier and code_challenge (S256).
 * @returns {{ verifier: string, challenge: string }}
 */
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  activeVerifier = verifier;
  return { verifier, challenge };
}

// ─── Auth URL ────────────────────────────────────────────────────────────

/**
 * Build the Schwab OAuth2 authorization URL.
 * @param {string} challenge - PKCE code_challenge
 * @returns {string}
 */
function buildAuthURL(challenge) {
  const clientId = process.env.SCHWAB_CLIENT_ID || CLIENT_ID;
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL || CALLBACK_URL;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "readonly",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// ─── Auth Code Parsing ───────────────────────────────────────────────────

/**
 * Parse an authorization code from a raw string, query string, or callback URL.
 * @param {string} input - Raw code, query string, or full redirect URL
 * @returns {string} Clean authorization code
 */
function parseAuthCode(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("?code=") ||
    trimmed.includes("&code=")
  ) {
    try {
      let urlStr;
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        urlStr = trimmed;
      } else if (trimmed.startsWith("?") || trimmed.startsWith("&")) {
        urlStr = `https://127.0.0.1/?${trimmed.replace(/^[?&]+/, "")}`;
      } else {
        urlStr = `https://${trimmed.replace(/^\/+/, "")}`;
      }
      const url = new URL(urlStr);
      const codeParam = url.searchParams.get("code");
      if (codeParam) {
        return decodeURIComponent(codeParam);
      }
    } catch {
      // Fall through to regex
    }
    const match = trimmed.match(/[?&]code=([^&#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return decodeURIComponent(trimmed);
}

// ─── Token Exchange ──────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access/refresh tokens.
 * @param {string} code - The authorization code from callback
 * @param {string} verifier - PKCE code_verifier
 * @returns {Promise<object>} Parsed token response
 */
async function exchangeCodeForToken(code, verifier) {
  const clientId = process.env.SCHWAB_CLIENT_ID || CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET || CLIENT_SECRET;
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL || CALLBACK_URL;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl,
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  data.obtained_at = Date.now();
  data.refresh_obtained_at = Date.now();
  return data;
}

/**
 * Exchange an authorization code or callback URL for tokens.
 * @param {string} codeOrUrl - Authorization code or full callback URL
 * @param {string} [verifier] - PKCE verifier (defaults to getLastVerifier())
 * @returns {Promise<object>}
 */
async function exchangeAuthCode(codeOrUrl, verifier) {
  const code = parseAuthCode(codeOrUrl);
  if (!code) {
    throw new Error("Invalid or empty authorization code");
  }
  const pkceVerifier = verifier || getLastVerifier();
  if (!pkceVerifier) {
    throw new Error("No active PKCE verifier found. Start an auth flow first.");
  }
  return exchangeCodeForToken(code, pkceVerifier);
}

// ─── Token Refresh ───────────────────────────────────────────────────────

let refreshPromise = null;

/**
 * Refresh the access token using the stored refresh_token.
 * @returns {Promise<object>} Updated token data
 */
async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const tokens = loadTokens();

      if (!tokens.refresh_token) {
        throw new Error("No refresh_token available. Re-authenticate via the CLI.");
      }

      const clientId = process.env.SCHWAB_CLIENT_ID || CLIENT_ID;
      const clientSecret = process.env.SCHWAB_CLIENT_SECRET || CLIENT_SECRET;

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      });

      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token refresh failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      data.obtained_at = Date.now();

      // Preserve the original refresh_token if the response doesn't include a new one
      if (!data.refresh_token) {
        data.refresh_token = tokens.refresh_token;
      }

      if (data.refresh_token && data.refresh_token !== tokens.refresh_token) {
        data.refresh_obtained_at = Date.now();
      } else {
        data.refresh_obtained_at = tokens.refresh_obtained_at || tokens.obtained_at || Date.now();
      }

      await saveTokens(data);
      return data;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ─── Token File I/O ──────────────────────────────────────────────────────

/**
 * Load tokens from the token file.
 * @returns {{ access_token?: string, refresh_token?: string, obtained_at?: number }}
 */
function loadTokens() {
  try {
    const tokenPath = getTokenPath();
    const raw = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save tokens to the token file.
 * @param {object} tokens
 */
async function saveTokens(tokens) {
  const tokenPath = getTokenPath();
  const dir = path.dirname(tokenPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = tokenPath + ".tmp";
  await fs.promises.writeFile(tmpPath, JSON.stringify(tokens, null, 2), "utf-8");
  await fs.promises.rename(tmpPath, tokenPath);
}

// ─── Valid Access Token ──────────────────────────────────────────────────

/**
 * Returns a valid access token, auto-refreshing if the current one is expired.
 * Throws if the refresh token itself is expired (>7 days old).
 * @returns {Promise<string>} A valid access_token
 */
async function getValidAccessToken() {
  const tokens = loadTokens();

  if (!tokens.access_token) {
    throw new Error("No access token found. Run the auth CLI first: node backend/scripts/schwab-auth-cli.js");
  }

  if (isAccessTokenExpired(tokens)) {
    if (isRefreshTokenExpired(tokens)) {
      throw new Error(
        "Refresh token is expired (>7 days). Re-authenticate via: node backend/scripts/schwab-auth-cli.js"
      );
    }
    const refreshed = await refreshAccessToken();
    return refreshed.access_token;
  }

  return tokens.access_token;
}

// ─── Token Health ────────────────────────────────────────────────────────

/** Timestamp of the last failed refresh attempt, to avoid hammering Schwab's API. */
let lastRefreshFailureTime = 0;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get token health status. When the access token is expired, this attempts
 * a refresh to detect credential errors (e.g. invalid_client) early.
 * @returns {Promise<{ status: string, accessTokenExpired: boolean, refreshTokenAgeDays: number, error?: string }>}
 */
async function getTokenHealth() {
  const tokens = loadTokens();
  if (!tokens.refresh_token) {
    return { status: "expired", accessTokenExpired: true, refreshTokenAgeDays: Infinity };
  }

  const accessTokenExpired = isAccessTokenExpired(tokens);
  const refreshTokenAgeDays = getRefreshTokenAgeDays(tokens);
  const refreshExpired = refreshTokenAgeDays > REFRESH_TOKEN_DAYS_MAX;

  // Expiring soon if the refresh token is within 12 hours of expiring (i.e. age > 6.5 days)
  const isExpiringSoon = refreshTokenAgeDays > (REFRESH_TOKEN_DAYS_MAX - 0.5);

  let status = "healthy";
  let error;

  if (refreshExpired) {
    status = "expired";
  } else if (isExpiringSoon) {
    status = "expiring";
  } else if (accessTokenExpired) {
    // Access token is expired but refresh token should still be valid.
    // If we recently failed a refresh, don't retry yet (cooldown).
    const inCooldown = (Date.now() - lastRefreshFailureTime) < REFRESH_COOLDOWN_MS;
    if (!inCooldown) {
      try {
        await refreshAccessToken();
        status = "healthy";
      } catch (err) {
        // Refresh failed — credentials may be revoked or invalid.
        // Mark as expired so the UI shows the auth banner.
        status = "expired";
        error = err.message;
        lastRefreshFailureTime = Date.now();
      }
    } else {
      // In cooldown — report expired without retrying
      status = "expired";
      error = "Refresh temporarily disabled due to recent failure (cooldown)";
    }
  }

  return { status, accessTokenExpired, refreshTokenAgeDays, error };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isAccessTokenExpired(tokens) {
  if (!tokens.obtained_at || !tokens.expires_in) return true;
  const elapsed = (Date.now() - tokens.obtained_at) / 1000;
  return elapsed >= tokens.expires_in;
}

function isRefreshTokenExpired(tokens) {
  return getRefreshTokenAgeDays(tokens) > REFRESH_TOKEN_DAYS_MAX;
}

function getRefreshTokenAgeDays(tokens) {
  const obtained = tokens.refresh_obtained_at || tokens.obtained_at;
  if (!obtained) return Infinity;
  return (Date.now() - obtained) / (1000 * 60 * 60 * 24);
}

// ─── Exports ─────────────────────────────────────────────────────────────

export {
  generatePKCE,
  buildAuthURL,
  exchangeCodeForToken,
  exchangeAuthCode,
  parseAuthCode,
  getLastVerifier,
  setLastVerifier,
  getTokenPath,
  refreshAccessToken,
  loadTokens,
  saveTokens,
  getValidAccessToken,
  getTokenHealth,
  isRefreshTokenExpired,
  CALLBACK_URL,
};
