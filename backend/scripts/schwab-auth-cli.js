import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import dotenv from "dotenv";
import { startAuthFlow, exchangeManualCode } from "../services/schwab-callback-server.js";
import { CALLBACK_URL, getTokenPath } from "../services/schwab-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from backend/.env first, fallback to cwd
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config();

// ─── Helpers ─────────────────────────────────────────────────────────────

function printSuccess(tokens) {
  console.log("\n✓ Authentication successful!");
  console.log(`  Access token:  ${tokens.access_token?.substring(0, 20)}...`);
  console.log(`  Refresh token: ${tokens.refresh_token?.substring(0, 20)}...`);
  console.log(`  Expires in:    ${tokens.expires_in} seconds`);
  console.log(`  Token saved to: ${getTokenPath()}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n============================================");
  console.log("  Schwab OAuth2 Authentication CLI");
  console.log("============================================\n");

  // Validate env vars
  if (!process.env.SCHWAB_CLIENT_ID || !process.env.SCHWAB_CLIENT_SECRET) {
    console.error("ERROR: SCHWAB_CLIENT_ID and SCHWAB_CLIENT_SECRET must be set in backend/.env");
    process.exit(1);
  }

  // Steps 1-3: Generate PKCE, build auth URL, start callback server
  console.log("[1/4] Generating PKCE challenge...");
  const { authUrl, promise } = startAuthFlow();

  console.log("\n[2/4] Open this URL in your browser to authorize:");
  console.log("\n  " + authUrl + "\n");
  console.log("The callback server will automatically capture the authorization code.");
  console.log("If the browser shows a privacy warning for the self-signed cert, proceed anyway.\n");

  console.log(`[3/4] Starting callback server on ${CALLBACK_URL} ...\n`);

  let completed = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input || completed) return;
    try {
      console.log("\n[4/4] Exchanging manual authorization code for tokens...");
      const tokens = await exchangeManualCode(input);
      completed = true;
      rl.close();
      printSuccess(tokens);
      process.exit(0);
    } catch (err) {
      console.error("\n✗ Manual exchange failed:", err.message);
      rl.prompt();
    }
  });

  promise
    .then((tokens) => {
      if (completed) return;
      completed = true;
      rl.close();
      console.log("[4/4] Exchanging authorization code for tokens...");
      printSuccess(tokens);
      process.exit(0);
    })
    .catch((err) => {
      if (completed) return;
      console.error("\n✗ Automatic callback error:", err.message);
    });

  rl.setPrompt("If your browser blocks the callback due to SSL warning, paste the full URL (https://127.0.0.1:.../?code=...) here: ");
  rl.prompt();
}

main().catch((err) => {
  console.error("\n✗ Authentication failed:", err.message);
  process.exit(1);
});
