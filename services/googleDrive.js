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

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // .env files store the private key with literal "\n" — convert
      // back to real newlines or the key fails to parse.
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
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
