"use client";

interface TokenPayload {
  exp?: number;
}

/**
 * Centralizes auth token access, validation, and cleanup behavior.
 */
export class AuthTokenManager {
  private static readonly TOKEN_STORAGE_KEY = "auth_token";

  static getToken(): string | null {
    if (typeof window === "undefined") {
      return null;
    }

    return localStorage.getItem(this.TOKEN_STORAGE_KEY);
  }

  static clearToken(): void {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.removeItem(this.TOKEN_STORAGE_KEY);
  }

  static getValidToken(onRedirect?: () => void): string | null {
    const token = this.getToken();
    if (!token) {
      this.redirectToLogin(onRedirect);
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.handleInvalidToken(onRedirect);
      return null;
    }

    return token;
  }

  static handleInvalidToken(onRedirect?: () => void): void {
    this.clearToken();
    this.redirectToLogin(onRedirect);
  }

  static redirectToLogin(onRedirect?: () => void): void {
    if (typeof window === "undefined") {
      return;
    }

    if (onRedirect) {
      onRedirect();
      return;
    }

    window.location.replace("/login");
  }

  static isTokenExpired(token: string): boolean {
    const payload = this.decodePayload(token);
    if (!payload?.exp) {
      return false;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return payload.exp < nowInSeconds;
  }

  private static decodePayload(token: string): TokenPayload | null {
    try {
      const [, payload] = token.split(".");
      if (!payload) {
        return null;
      }

      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const decoded = this.decodeBase64(padded);

      return JSON.parse(decoded) as TokenPayload;
    } catch {
      return null;
    }
  }

  private static decodeBase64(value: string): string {
    if (typeof atob === "function") {
      return atob(value);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf-8");
    }

    throw new Error("No base64 decoder available");
  }
}

