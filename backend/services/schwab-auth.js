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
    client_id: CLIENT_ID,
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
    client_id: CLIENT_ID,
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

/**
 * Get token health status.
 * @returns {{ status: string, accessTokenExpired: boolean, refreshTokenAgeDays: number }}
 */
function getTokenHealth() {
  const tokens = loadTokens();
  const accessTokenExpired = isAccessTokenExpired(tokens);
  const refreshTokenAgeDays = getRefreshTokenAgeDays(tokens);
  const refreshExpired = refreshTokenAgeDays > REFRESH_TOKEN_DAYS_MAX;

  let status = "healthy";
  if (accessTokenExpired && refreshExpired) {
    status = "expired";
  } else if (accessTokenExpired) {
    status = "expiring";
  }

  return { status, accessTokenExpired, refreshTokenAgeDays };
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
  if (!tokens.obtained_at) return Infinity;
  return (Date.now() - tokens.obtained_at) / (1000 * 60 * 60 * 24);
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
};
