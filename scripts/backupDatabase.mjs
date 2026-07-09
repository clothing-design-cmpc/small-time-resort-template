/**
 * FILE: scripts/backupDatabase.mjs
 * PURPOSE:
 * Standalone, scheduled database backup (Rule 40). Runs `pg_dump`
 * against the live Supabase Postgres DB, compresses it, and uploads
 * the archive to two independent offsite destinations — Cloudflare R2
 * and Google Drive — then records the result as an `admin_action`
 * SecurityLog row so it's visible on the super-admin Security Logs page.
 *
 * This script is intentionally self-contained (its own R2/Drive/pg
 * clients, not the "@/services/..." Next.js path-aliased versions) so
 * it can run with plain `node scripts/backupDatabase.mjs` on a GitHub
 * Actions runner, completely separate from the Next.js app process —
 * per Rule 40.1, backups must never share resources with the live app.
 *
 * DATA FLOW:
 * 1. GitHub Actions cron (see .github/workflows/database-backup.yml)
 *    triggers this script nightly on its own runner/schedule
 * 2. pg_dump streams the DB into a gzip-compressed file in /tmp,
 *    using DIRECT_URL (session pooler — same connection Prisma's own
 *    CLI commands use for schema-level operations)
 * 3. The compressed archive is uploaded to R2 (backups/ folder) and to
 *    Google Drive
 * 4. A row is inserted into security_logs (event_type: "admin_action",
 *    actor: "System (Scheduled Backup)") so admins see it on
 *    /superAdmin/security-logs without any new UI work
 * 5. Temp file is deleted; script exits 0 on success, 1 on failure so
 *    GitHub Actions surfaces failed runs
 */
import { execFileSync } from "child_process";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { google } from "googleapis";
import { Readable } from "stream";
import pg from "pg";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFileName = `backup-${timestamp}.sql.gz`;
const tempFilePath = `/tmp/${backupFileName}`;

/**
 * runPgDump
 * Runs pg_dump against DIRECT_URL and pipes the output through gzip,
 * writing the compressed archive to /tmp. Uses execFileSync with shell
 * piping so the raw dump is never held fully in Node memory at once.
 */
function runPgDump() {
  execFileSync("bash", ["-c", `pg_dump "${process.env.DIRECT_URL}" | gzip > ${tempFilePath}`], {
    stdio: "inherit",
  });
}

/**
 * uploadBackupToR2
 * Uploads the compressed backup buffer to the configured R2 bucket
 * under a dedicated "backups/" prefix — separate from the "rooms/",
 * "amenities/", etc. prefixes used for content-management images
 * (Rule 35.8 folder naming convention).
 */
async function uploadBackupToR2(buffer) {
  const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });

  const key = `backups/${backupFileName}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "application/gzip",
    })
  );

  return key;
}

/**
 * uploadBackupToDrive
 * Uploads the same compressed backup buffer to the Google Drive backup
 * folder using a service account (no user OAuth needed) — the second,
 * independent offsite copy per the "3-2-1" backup rule.
 */
async function uploadBackupToDrive(buffer) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  const uploadResponse = await drive.files.create({
    requestBody: { name: backupFileName, parents: [process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID] },
    media: { mimeType: "application/gzip", body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });

  return uploadResponse.data.id;
}

/**
 * logBackupResult
 * Writes a security_logs row directly via `pg` (not the Next.js Prisma
 * singleton, which this standalone script does not share) so the
 * outcome shows up on the super-admin Security Logs page. Best-effort —
 * a logging failure must never crash the script after the real backup
 * work is already done.
 */
async function logBackupResult({ success, details }) {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL });
  try {
    await client.connect();
    await client.query(
      `INSERT INTO security_logs (id, event_type, actor, ip_address, user_agent, details, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
      ["admin_action", "System (Scheduled Backup)", null, "github-actions-cron", details]
    );
  } catch (error) {
    console.error("[backupDatabase] Failed to write SecurityLog row:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * main
 * Orchestrates the full nightly backup: dump -> compress -> upload to
 * both destinations -> log result -> clean up temp file.
 */
async function main() {
  try {
    console.log(`[backupDatabase] Starting backup: ${backupFileName}`);
    runPgDump();

    const buffer = readFileSync(tempFilePath);
    console.log(`[backupDatabase] Dump complete, ${(buffer.length / 1024 / 1024).toFixed(2)} MB compressed.`);

    const r2Key = await uploadBackupToR2(buffer);
    console.log(`[backupDatabase] Uploaded to R2: ${r2Key}`);

    const driveFileId = await uploadBackupToDrive(buffer);
    console.log(`[backupDatabase] Uploaded to Google Drive: ${driveFileId}`);

    await logBackupResult({
      success: true,
      details: `Automated nightly backup completed successfully (R2 key: ${r2Key}, Drive file: ${driveFileId}).`,
    });

    console.log("[backupDatabase] Backup finished successfully.");
    process.exitCode = 0;
  } catch (error) {
    console.error("[backupDatabase] Backup FAILED:", error.message);
    await logBackupResult({
      success: false,
      details: `Automated nightly backup FAILED: ${error.message}`,
    });
    process.exitCode = 1;
  } finally {
    if (existsSync(tempFilePath)) unlinkSync(tempFilePath);
  }
}

main();
