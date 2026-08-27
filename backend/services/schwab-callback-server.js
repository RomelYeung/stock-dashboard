import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generatePKCE,
  buildAuthURL,
  exchangeCodeForToken,
  saveTokens,
  parseAuthCode,
  getLastVerifier,
  setLastVerifier,
  CALLBACK_URL,
} from "./schwab-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.resolve(__dirname, "..", "certs");

let PORT = 3000;
let HOST = "127.0.0.1";
try {
  const parsedUrl = new URL(CALLBACK_URL);
  if (parsedUrl.port) {
    PORT = parseInt(parsedUrl.port, 10);
  } else {
    PORT = parsedUrl.protocol === "https:" ? 443 : 80;
  }
  if (parsedUrl.hostname) {
    HOST = parsedUrl.hostname;
  }
} catch (e) {
  console.warn("[schwab-callback-server] Failed to parse CALLBACK_URL, using defaults:", e.message);
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @type {{ authUrl: string, promise: Promise<object>, server?: import("node:https").Server, settle?: Function, resolve?: Function, reject?: Function } | null} */
let activeFlow = null;

/**
 * Reset any active authentication flow and shut down the callback server.
 */
export function resetAuthFlow() {
  if (activeFlow) {
    if (typeof activeFlow.settle === "function") {
      activeFlow.settle();
    } else if (activeFlow.server) {
      try {
        activeFlow.server.close(() => {});
      } catch {
        // ignore close error
      }
    }
    activeFlow = null;
  }
}

/**
 * Manually exchange an authorization code or callback URL for tokens.
 * @param {string} codeOrUrl - Raw code or full callback URL
 * @returns {Promise<object>} Token response
 */
export async function exchangeManualCode(codeOrUrl) {
  const code = parseAuthCode(codeOrUrl);
  if (!code) {
    throw new Error("No authorization code provided");
  }

  const verifier = getLastVerifier();
  if (!verifier) {
    throw new Error("No active PKCE verifier found. Start an auth flow first.");
  }

  const tokens = await exchangeCodeForToken(code, verifier);
  await saveTokens(tokens);

  if (activeFlow && typeof activeFlow.resolve === "function") {
    activeFlow.resolve(tokens);
  }

  return tokens;
}

/**
 * Start the Schwab OAuth2 authorization flow:
 * generates PKCE, sets active verifier, builds the auth URL, starts an HTTPS callback server,
 * and returns { authUrl, promise } where promise resolves to the tokens object.
 *
 * If a flow is already in progress, returns the existing one.
 *
 * @returns {{ authUrl: string, promise: Promise<object> }}
 */
export function startAuthFlow() {
  if (activeFlow) {
    return activeFlow;
  }

  // Validate SSL certs
  const certPath = path.join(CERT_DIR, "cert.pem");
  const keyPath = path.join(CERT_DIR, "key.pem");
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(
      "SSL certificates not found in backend/certs/. Generate them with:\n" +
      "  mkdir -p backend/certs && openssl req -x509 -newkey rsa:2048 -keyout backend/certs/key.pem -out backend/certs/cert.pem -days 365 -nodes -subj \"/CN=127.0.0.1\""
    );
  }

  const { verifier, challenge } = generatePKCE();
  setLastVerifier(verifier);
  const authUrl = buildAuthURL(challenge);

  const server = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  });

  let timeoutId = null;
  let settled = false;
  let flowResolve = null;
  let flowReject = null;

  function settle() {
    if (settled) return;
    settled = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    // Clear activeFlow immediately so retries can start a fresh flow
    activeFlow = null;
    try {
      server.close(() => {
        // Server fully closed
      });
    } catch {
      // ignore
    }
  }

  const promise = new Promise((resolve, reject) => {
    flowResolve = resolve;
    flowReject = reject;

    timeoutId = setTimeout(() => {
      settle();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, TIMEOUT_MS);

    server.on("request", async (req, res) => {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        const errorDesc = url.searchParams.get("error_description") || "N/A";
        console.error(`[schwab-callback] Auth error from Schwab: ${errorParam} — ${errorDesc}`);
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization Failed</h1><p>Error: ${escapeHtml(errorParam)}</p><p>Description: ${escapeHtml(errorDesc)}</p>`
        );
        settle();
        reject(
          new Error(`Authorization error: ${errorParam} — ${errorDesc}`)
        );
        return;
      }

      const authCode = url.searchParams.get("code");
      if (!authCode) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Bad Request</h1><p>No authorization code received.</p>`);
        settle();
        reject(new Error("No authorization code in callback URL"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h1>Authorization Successful!</h1><p>You can close this window now.</p>`);

      try {
        const parsedCode = parseAuthCode(authCode);
        const tokens = await exchangeCodeForToken(parsedCode, verifier);
        await saveTokens(tokens);
        settle();
        resolve(tokens);
      } catch (err) {
        console.error(`[schwab-callback] Token exchange failed:`, err.message);
        settle();
        reject(err);
      }
    });

    server.on("error", (err) => {
      console.error(`[schwab-callback] Server error:`, err.message);
      settle();
      reject(new Error(`Server error: ${err.message}`));
    });

    server.listen(PORT, HOST, () => {
      console.log(`[schwab-callback] Listening on ${HOST}:${PORT} for OAuth callback`);
    });
  });

  activeFlow = {
    authUrl,
    promise,
    server,
    settle,
    resolve: (tokens) => {
      settle();
      if (flowResolve) flowResolve(tokens);
    },
    reject: (err) => {
      settle();
      if (flowReject) flowReject(err);
    },
  };

  return activeFlow;
}
