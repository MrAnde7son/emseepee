import { createHmac, randomBytes } from "crypto";
import { logger } from "../logger.js";

/**
 * Generate a JWT secret lazily at runtime.
 * This keeps secrets out of env/files and ensures a fresh key per process start.
 */
let JWT_SECRET: string | null = null;
function getJwtSecret(): string {
  if (!JWT_SECRET) {
    JWT_SECRET = randomBytes(64).toString("hex");
    logger.info("[Auth] Generated new in-memory JWT secret");
  }
  return JWT_SECRET;
}
const JWT_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  tenantId?: string | null;
  iat: number;
  exp: number;
}

/**
 * Generate a JWT token
 */
export function generateToken(userId: number, email: string, role: string, tenantId?: string | null): string {
  const now = Date.now();
  const secret = getJwtSecret();
  const payload: JWTPayload = {
    userId,
    email,
    role,
    tenantId,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + JWT_EXPIRY) / 1000),
  };

  // Base64URL encode header
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));

  // Base64URL encode payload
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const secret = getJwtSecret();
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Base64URL encode (without padding)
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
