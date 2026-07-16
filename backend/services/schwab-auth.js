import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────

const CLIENT_ID = process.env.SCHWAB_CLIENT_ID;
const CLIENT_SECRET = process.env.SCHWAB_CLIENT_SECRET;
const CALLBACK_URL = process.env.SCHWAB_CALLBACK_URL || "https://127.0.0.1:3000";
const TOKEN_PATH = path.resolve(
  process.env.SCHWAB_TOKEN_PATH || path.join(__dirname, "..", ".schwab-token.json")
);

const AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const REFRESH_TOKEN_DAYS_MAX = 7;

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
  return { verifier, challenge };
}

// ─── Auth URL ────────────────────────────────────────────────────────────

/**
 * Build the Schwab OAuth2 authorization URL.
 * @param {string} challenge - PKCE code_challenge
 * @returns {string}
 */
function buildAuthURL(challenge) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: "code",
    scope: "readonly",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// ─── Token Exchange ──────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access/refresh tokens.
 * @param {string} code - The authorization code from callback
 * @param {string} verifier - PKCE code_verifier
 * @returns {Promise<object>} Parsed token response
 */
async function exchangeCodeForToken(code, verifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: CALLBACK_URL,
  });

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

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

// ─── Token Refresh ───────────────────────────────────────────────────────

/**
 * Refresh the access token using the stored refresh_token.
 * @returns {Promise<object>} Updated token data
 */
async function refreshAccessToken() {
  const tokens = loadTokens();

  if (!tokens.refresh_token) {
    throw new Error("No refresh_token available. Re-authenticate via the CLI.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

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

  saveTokens(data);
  return data;
}

// ─── Token File I/O ──────────────────────────────────────────────────────

/**
 * Load tokens from the token file.
 * @returns {{ access_token?: string, refresh_token?: string, obtained_at?: number }}
 */
function loadTokens() {
  try {
    const raw = fs.readFileSync(TOKEN_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save tokens to the token file.
 * @param {object} tokens
 */
function saveTokens(tokens) {
  const dir = path.dirname(TOKEN_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8");
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
  refreshAccessToken,
  loadTokens,
  saveTokens,
  getValidAccessToken,
  getTokenHealth,
  isRefreshTokenExpired,
  CALLBACK_URL,
};
