import { logger } from "../logger.js";

/**
 * Common public email provider domains.
 * For these domains, we use the full email as tenant ID to ensure data isolation.
 * For enterprise/private domains, we use just the domain as tenant ID.
 */
const PUBLIC_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "zoho.com",
  "fastmail.com",
]);

/**
 * Derives a tenant ID from an email address.
 * - For public email providers (Gmail, Yahoo, etc.), uses the full email to ensure data isolation
 * - For enterprise/private domains, uses just the domain
 * - Falls back to a generated tenant ID if email format is invalid
 */
export function deriveTenantIdFromEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) {
    logger.warn(`[Auth] Invalid email format: ${email}, generating tenant ID`);
    return `tenant-${Date.now()}`;
  }

  const domain = parts[1].toLowerCase();

  // If it's a public email provider, use the full email as tenant ID for isolation
  if (PUBLIC_EMAIL_PROVIDERS.has(domain)) {
    return email.toLowerCase();
  }

  // For enterprise/private domains, use just the domain
  return domain;
}
