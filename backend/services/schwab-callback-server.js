import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generatePKCE,
  buildAuthURL,
  exchangeCodeForToken,
  saveTokens,
} from "./schwab-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.resolve(__dirname, "..", "certs");
const PORT = 3000;
const HOST = "127.0.0.1";
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** @type {{ authUrl: string, promise: Promise<object> } | null} */
let activeFlow = null;

/**
 * Start the Schwab OAuth2 authorization flow:
 * generates PKCE, builds the auth URL, starts an HTTPS callback server on port 3000,
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
  const authUrl = buildAuthURL(challenge);

  const server = https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  });

  const promise = new Promise((resolve, reject) => {
    let settled = false;

    function settle() {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      server.close(() => {
        activeFlow = null;
      });
    }

    const timeoutId = setTimeout(() => {
      settle();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, TIMEOUT_MS);

    server.on("request", async (req, res) => {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization Failed</h1><p>Error: ${errorParam}</p><p>Description: ${url.searchParams.get("error_description") || "N/A"}</p>`
        );
        settle();
        reject(
          new Error(
            `Authorization error: ${errorParam} - ${url.searchParams.get("error_description") || ""}`
          )
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
        const tokens = await exchangeCodeForToken(authCode, verifier);
        saveTokens(tokens);
        settle();
        resolve(tokens);
      } catch (err) {
        settle();
        reject(err);
      }
    });

    server.on("error", (err) => {
      settle();
      reject(new Error(`Server error: ${err.message}`));
    });

    server.listen(PORT, HOST);
  });

  activeFlow = { authUrl, promise };
  return activeFlow;
}
