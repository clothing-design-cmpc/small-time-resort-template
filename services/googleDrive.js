/**
 * FILE: services/googleDrive.js
 * PURPOSE:
 * Uploads files to Google Drive using OAuth2 USER delegation (a long-lived
 * refresh token for a real Gmail account) — NOT a service account.
 *
 * WHY NOT A SERVICE ACCOUNT:
 * Service accounts have zero storage quota of their own. Sharing a folder
 * with a service account as "Editor" does not change this — Drive still
 * refuses the upload with "Service Accounts do not have storage quota."
 * The only ways around that are (a) target a Shared Drive, which requires
 * a paid Google Workspace plan, or (b) authenticate as a real human
 * account instead, which is what this file does. Files uploaded this way
 * count against that account's own free 15GB quota, exactly as if the
 * account holder had dragged the file into Drive themselves.
 *
 * Used by scripts/runBackup.js and services/activityArchive.js as an
 * offsite backup destination alongside Cloudflare R2.
 *
 * SETUP (one-time, not code) — see docs/google-drive-oauth-setup.md.
 * Short version:
 *   1. Google Cloud Console → Credentials → Create OAuth client ID →
 *      Application type: "Desktop app". Copy the Client ID + Secret.
 *   2. Run `node scripts/getGoogleDriveRefreshToken.mjs` locally, sign in
 *      as the Gmail account that should own the backups, approve access.
 *      It prints a refresh token.
 *   3. Save GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and
 *      GOOGLE_OAUTH_REFRESH_TOKEN as GitHub Actions secrets (and in
 *      .env.local for testing locally).
 *   4. Share the destination "backup" folder with that same Gmail account
 *      (it already owns it if it's the one that created it — nothing to
 *      do in that case) and copy its folder ID into GOOGLE_DRIVE_FOLDER_ID.
 *
 * GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are no
 * longer used by this file and can be removed from secrets once the new
 * OAuth vars are confirmed working.
 */
import { google } from "googleapis";
import { Readable } from "stream";

/**
 * normalizeFolderId
 * GOOGLE_DRIVE_FOLDER_ID is supposed to be just the bare ID from the
 * folder's URL (drive.google.com/drive/folders/<THIS PART>), but it's
 * easy to accidentally copy the WHOLE address-bar URL instead —
 * especially since Drive appends tracking query params like
 * "?dmr=1&ec=wgc-drive-...-goto" that aren't visually obvious as
 * "extra" text. If that happens, "files.create" gets a parents[] value
 * that isn't a real ID at all, and Drive returns a generic
 * "File not found" (a 404, not 403 — Drive deliberately doesn't reveal
 * whether an ID exists to someone without access to it).
 *
 * Handles both shapes:
 *   - A full URL -> extracts the ID between "/folders/" and the next
 *     "/", "?", or "#"
 *   - A bare ID with a stray "?...", "&...", or trailing slash still
 *     attached -> truncates at the first non-ID character
 */
function normalizeFolderId(rawValue) {
  if (!rawValue) {
    console.warn("[googleDrive] GOOGLE_DRIVE_FOLDER_ID is not set.");
    return rawValue;
  }

  const trimmed = rawValue.trim();
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  const bareIdMatch = trimmed.match(/^[a-zA-Z0-9_-]+/);
  const folderId = bareIdMatch ? bareIdMatch[0] : trimmed;

  if (folderId !== trimmed) {
    console.warn(
      `[googleDrive] GOOGLE_DRIVE_FOLDER_ID had extra characters after the ID (likely a full URL with ` +
        `query params was pasted instead of just the ID) — using "${folderId}" and ignoring the rest.`
    );
  }

  return folderId;
}

/**
 * getOAuthClient
 * Builds an OAuth2 client authenticated as the human Gmail account via a
 * stored refresh token — googleapis automatically exchanges it for a
 * fresh short-lived access token on each request, no manual renewal.
 */
function getOAuthClient() {
  const requiredVars = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REFRESH_TOKEN",
  ];
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[googleDrive] Missing required env var(s): ${missing.join(", ")}. ` +
        "Run scripts/getGoogleDriveRefreshToken.mjs to generate GOOGLE_OAUTH_REFRESH_TOKEN."
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return oauth2Client;
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getOAuthClient() });
}

/**
 * uploadToDrive
 * Uploads a file buffer into the pre-shared backup folder
 * (GOOGLE_DRIVE_FOLDER_ID) and returns its file id + shareable view link.
 * Runs as the delegated human account, so the upload counts against that
 * account's own storage quota — not against any service account quota.
 *
 * @param {string} fileName - e.g. "villa-azure-backup-2026-07-09.sql.gz"
 * @param {Buffer} buffer
 * @param {string} mimeType - e.g. "application/gzip"
 */
export async function uploadToDrive(fileName, buffer, mimeType) {
  const drive = getDriveClient();
  const folderId = normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

  const uploadResponse = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  return {
    fileId: uploadResponse.data.id,
    viewLink: uploadResponse.data.webViewLink,
  };
}
