/**
 * FILE: scripts/getGoogleDriveRefreshToken.mjs
 * PURPOSE:
 * One-time, LOCAL-ONLY helper script. Run this once on your own machine
 * (never in GitHub Actions) to generate the GOOGLE_OAUTH_REFRESH_TOKEN
 * needed by services/googleDrive.js. It walks you through Google's OAuth
 * consent screen as the human Gmail account that should own the backup
 * uploads, then prints the refresh token to paste into GitHub Secrets.
 *
 * WHY THIS EXISTS:
 * The backup pipeline authenticates as a real Google account (not a
 * service account) because service accounts have no Drive storage quota
 * of their own — see services/googleDrive.js's file header for the full
 * explanation. A refresh token is how a script can act as that account
 * indefinitely without the account holder re-logging-in every run.
 *
 * BEFORE RUNNING:
 * 1. Google Cloud Console → APIs & Services → Credentials
 * 2. "Create Credentials" → "OAuth client ID" → Application type:
 *    "Desktop app" (this type auto-allows the http://localhost redirect
 *    this script uses, no manual redirect URI registration needed)
 * 3. Copy the generated Client ID and Client Secret into .env.local as:
 *      GOOGLE_OAUTH_CLIENT_ID=...
 *      GOOGLE_OAUTH_CLIENT_SECRET=...
 * 4. Make sure the "Google Drive API" is enabled on that Cloud project
 *    (APIs & Services → Library → search "Google Drive API" → Enable)
 *
 * USAGE:
 *   node scripts/getGoogleDriveRefreshToken.mjs
 *   → prints an authorization URL
 *   → open it in a browser, sign in as the Gmail account that owns the
 *     "backup" Drive folder, click Allow
 *   → the browser redirects to localhost, this script catches it and
 *     prints your refresh token
 *   → copy that value into the GOOGLE_OAUTH_REFRESH_TOKEN GitHub secret
 *     (and .env.local, if testing backups locally)
 */
import "./loadEnv.mjs";
import { google } from "googleapis";
import http from "node:http";

const PORT = 53789;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "[getRefreshToken] Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env.local. " +
      "Create a Desktop-app OAuth client in Google Cloud Console first — see this file's header comment."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

// Full "drive" scope is required (not the narrower "drive.file") because
// this script needs to write into an existing folder the account already
// owns — drive.file only grants access to files/folders the app itself
// created or that the user explicitly opened via a picker.
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to receive a refresh_token, not just a short-lived access token
  prompt: "consent", // forces Google to re-issue a refresh_token even if this account authorized before
  scope: ["https://www.googleapis.com/auth/drive"],
});

console.log("\n[getRefreshToken] Open this URL in your browser and sign in as the backup Gmail account:\n");
console.log(authUrl);
console.log("\n[getRefreshToken] Waiting for the redirect back to localhost...\n");

// Spins up a throwaway local server just long enough to catch Google's
// redirect (which carries the one-time authorization code as a query
// param), exchange it for tokens, print the refresh token, then exit.
const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, REDIRECT_URI);
  if (requestUrl.pathname !== "/oauth2callback") {
    response.writeHead(404);
    response.end();
    return;
  }

  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  if (error) {
    response.writeHead(400, { "Content-Type": "text/plain" });
    response.end(`Authorization was denied: ${error}. You can close this tab.`);
    console.error(`[getRefreshToken] Authorization denied: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("Authorization complete — you can close this tab and return to the terminal.");

    if (!tokens.refresh_token) {
      console.error(
        "\n[getRefreshToken] No refresh_token was returned. This usually means this account already " +
          "granted access before. Go to https://myaccount.google.com/permissions, remove access for " +
          "this app, and run this script again so Google issues a fresh refresh_token.\n"
      );
      server.close();
      process.exit(1);
    }

    console.log("\n[getRefreshToken] Success! Save this as the GOOGLE_OAUTH_REFRESH_TOKEN secret:\n");
    console.log(tokens.refresh_token);
    console.log("");
  } catch (exchangeError) {
    console.error("[getRefreshToken] Failed to exchange code for tokens:", exchangeError.message);
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end("Something went wrong — check the terminal for details.");
  } finally {
    server.close();
  }
});

server.listen(PORT);
