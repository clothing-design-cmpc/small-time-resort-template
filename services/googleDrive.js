/**
 * FILE: services/googleDrive.js
 * PURPOSE:
 * Uploads and deletes files in Google Drive using a Service Account —
 * no user OAuth flow required. Used as the second, independent offsite
 * backup destination for scheduled database backups (Rule 40 / the
 * "3-2-1" backup rule: primary DB + Supabase PITR + this).
 *
 * SERVER-SIDE ONLY — never import this in a "use client" file. The
 * service account private key must never reach the browser bundle.
 *
 * DATA FLOW:
 * 1. Caller (e.g. scripts/backupDatabase.mjs, or a future super-admin
 *    "manual backup" API route) has a file buffer ready
 * 2. uploadToDrive() authenticates with the service account, uploads
 *    the buffer into GOOGLE_DRIVE_BACKUP_FOLDER_ID, and sets the file
 *    to "anyone with the link can view" so it's reachable without a
 *    Google sign-in
 * 3. Caller stores/logs the returned fileId + viewLink
 */
import { google } from "googleapis";
import { Readable } from "stream";

/**
 * getDriveClient
 * Authenticates with Google Drive using the service account credentials
 * and returns a ready-to-use Drive API client.
 */
async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // .env stores the private key with escaped \n — restore real newlines here.
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

/**
 * uploadToDrive
 * Uploads a file buffer into the configured Drive backup folder and
 * makes it viewable via link (no sign-in required to download).
 *
 * @param {string} fileName - display name in Drive, e.g. "backup-2026-07-09T020000.sql.gz"
 * @param {Buffer} buffer - file content
 * @param {string} mimeType - e.g. "application/gzip"
 * @returns {Promise<{fileId: string, viewLink: string}>}
 */
export async function uploadToDrive(fileName, buffer, mimeType) {
  const drive = await getDriveClient();

  const uploadResponse = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  const fileId = uploadResponse.data.id;
  const viewLink = uploadResponse.data.webViewLink;

  // Anyone with the link can view — so a download works without a Google sign-in.
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return { fileId, viewLink };
}

/**
 * deleteFromDrive
 * Permanently deletes a file from Drive by its file ID. Not used by the
 * nightly backup job itself (backups are kept, pruning is manual/future
 * work) — provided for completeness per protocol Rule 35.7.
 */
export async function deleteFromDrive(fileId) {
  if (!fileId) return;
  const drive = await getDriveClient();
  await drive.files.delete({ fileId });
}
