import dotenv from "dotenv";
import { startAuthFlow } from "../services/schwab-callback-server.js";

dotenv.config();

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

  console.log("[3/4] Starting callback server on https://127.0.0.1:3000 ...\n");

  // Step 4: Wait for callback — exchange and save are handled internally
  const tokens = await promise;

  console.log("[4/4] Exchanging authorization code for tokens...");

  console.log("\n✓ Authentication successful!");
  console.log(`  Access token:  ${tokens.access_token?.substring(0, 20)}...`);
  console.log(`  Refresh token: ${tokens.refresh_token?.substring(0, 20)}...`);
  console.log(`  Expires in:    ${tokens.expires_in} seconds`);
  console.log(`  Token saved to: backend/.schwab-token.json\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Authentication failed:", err.message);
  process.exit(1);
});
