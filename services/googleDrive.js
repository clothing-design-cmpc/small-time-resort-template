/**
 * FILE: services/googleDrive.js
 * PURPOSE:
 * Uploads files to Google Drive using a Service Account (no user OAuth
 * flow needed). Currently used by scripts/runBackup.js as the SECOND,
 * independent backup destination alongside Cloudflare R2 — the whole
 * point of having two destinations is that neither is the single point
 * of failure for the other (the "3-2-1 backup rule" mentioned earlier).
 *
 * SETUP (one-time, not code):
 * 1. Create a Google Cloud service account + JSON key, enable the
 *    Drive API for that project.
 * 2. Open the target Drive folder (the "backup" folder) in the browser,
 *    click Share, and add the service account's email
 *    (GOOGLE_SERVICE_ACCOUNT_EMAIL) as an Editor — a service account
 *    has no Drive storage of its own, it can only write into folders
 *    explicitly shared with it.
 * 3. Copy that folder's id from its URL
 *    (drive.google.com/drive/folders/<THIS PART>) into
 *    GOOGLE_DRIVE_FOLDER_ID.
 */
import { google } from "googleapis";
import { Readable } from "stream";

/**
 * normalizePrivateKey
 * Takes the raw GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env var and returns
 * a real PEM string, defensively handling the most common ways this
 * value gets mangled when copy-pasted from the downloaded JSON key
 * file into a GitHub Secret or .env.local:
 *   1. Literal "\n" (two characters) instead of real newlines — the
 *      JSON file itself stores it this way, so this is expected and
 *      always converted back.
 *   2. Accidentally including the JSON field's surrounding double
 *      quotes (copying `"-----BEGIN...` instead of `-----BEGIN...`) —
 *      stripped if present.
 *   3. Leading/trailing whitespace from the paste — trimmed.
 *
 * Logs a specific, actionable warning (host names never included —
 * this never logs the key itself) if the result still doesn't look
 * like a real PEM key, instead of leaving the person to decode
 * googleapis/OpenSSL's opaque "error:1E08010C:DECODER
 * routines::unsupported" on their own.
 */
function normalizePrivateKey(rawValue) {
  if (!rawValue) {
    console.warn("[googleDrive] GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set.");
    return rawValue;
  }

  let key = rawValue.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, "\n");

  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    console.error(
      "[googleDrive] WARNING: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY doesn't look like a complete PEM key " +
        '(missing the "-----BEGIN PRIVATE KEY-----" / "-----END PRIVATE KEY-----" markers after normalizing). ' +
        "This is almost always a copy-paste issue — re-copy the full \"private_key\" value from the service " +
        "account's downloaded JSON file, including both BEGIN/END lines, into the GitHub secret."
    );
  }

  return key;
}

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * uploadToDrive
 * Uploads a file buffer into the pre-shared backup folder
 * (GOOGLE_DRIVE_FOLDER_ID) and returns its file id + shareable view link.
 *
 * @param {string} fileName - e.g. "villa-azure-backup-2026-07-09.sql.gz"
 * @param {Buffer} buffer
 * @param {string} mimeType - e.g. "application/gzip"
 */
export async function uploadToDrive(fileName, buffer, mimeType) {
  const drive = getDriveClient();

  const uploadResponse = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
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