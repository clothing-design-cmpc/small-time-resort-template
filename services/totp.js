/**
 * FILE: services/totp.js
 * PURPOSE:
 * Generates and verifies TOTP codes for the owner vault system.
 * Used at two points: vault login (passphrase + TOTP together), and
 * step-up re-verification right before executing a device unban.
 *
 * DATA FLOW:
 * 1. generateTotpSecret() + generateTotpQrCode() are used ONCE during
 *    local setup (scripts/setupVault.js) — never from a deployed route.
 * 2. verifyTotpCode() is used on every vault login and every unban click.
 */
import { authenticator } from "otplib";
import QRCode from "qrcode";

/**
 * generateTotpSecret
 * Creates a new base32 TOTP secret. Only ever called from the local
 * setup script — regenerating this later invalidates the owner's
 * existing authenticator app entry.
 */
export function generateTotpSecret() {
  return authenticator.generateSecret();
}

/**
 * generateTotpQrCode
 * Produces a QR code data URL the owner scans once with an authenticator
 * app (Google Authenticator, Authy, etc.) during vault setup.
 */
export async function generateTotpQrCode(secret, ownerLabel = "your-private-resort Owner Vault") {
  const otpauthUrl = authenticator.keyuri(ownerLabel, "VillaAzureVault", secret);
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * verifyTotpCode
 * Checks a 6-digit code against the stored secret. Wrapped in try/catch
 * so a malformed code never throws — it just fails verification cleanly.
 */
export function verifyTotpCode(token, secret) {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
