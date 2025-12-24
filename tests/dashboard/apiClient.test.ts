import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ApiClient } from "@/lib/api";
import { AuthTokenManager } from "@/lib/auth-token-manager";

describe("ApiClient", () => {
  const baseUrl = "http://api.example.com";
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient(baseUrl);
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds authorization headers when authentication is required", async () => {
    vi.spyOn(AuthTokenManager, "getValidToken").mockReturnValue("test-token");
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await client.get<{ ok: boolean }>("/secure", { requireAuth: true });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("delegates token cleanup when the gateway returns unauthorized", async () => {
    vi.spyOn(AuthTokenManager, "getValidToken").mockReturnValue("expired-token");
    const handleInvalidToken = vi.spyOn(AuthTokenManager, "handleInvalidToken");
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(client.get("/secure", { requireAuth: true })).rejects.toThrow("Unauthorized");
    expect(handleInvalidToken).toHaveBeenCalledTimes(1);
  });

  it("throws when authentication is required but no token is present", async () => {
    vi.spyOn(AuthTokenManager, "getValidToken").mockReturnValue(null);

    await expect(client.get("/secure", { requireAuth: true })).rejects.toThrow("Authentication required");
  });
});
