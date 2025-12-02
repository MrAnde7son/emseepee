import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getUserInitials, loadUserFromStorage, navItems } from "../dashboard/src/lib/navigation";
import type { HumanUser } from "../dashboard/src/lib/types";

declare global {
  // eslint-disable-next-line no-var
  var window: Window | undefined;
}

describe("navigation helpers", () => {
  const mockUser: HumanUser = {
    id: 1,
    email: "user@example.com",
    name: "Test User",
    role: "admin",
  };

  beforeEach(() => {
    // Ensure a clean window between tests
    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  it("derives initials from full names and fallbacks", () => {
    expect(getUserInitials(mockUser)).toBe("TU");
    expect(
      getUserInitials({ ...mockUser, name: "Single" })
    ).toBe("SI");
    expect(
      getUserInitials({ ...mockUser, name: null as unknown as string })
    ).toBe("US");
    expect(getUserInitials(null)).toBe("U");
  });

  it("returns null when no window is available", () => {
    expect(loadUserFromStorage()).toBeNull();
  });

  it("loads stored user data when available", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(mockUser)),
      removeItem: vi.fn(),
    };

    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-explicit-any
    (globalThis as any).window = { localStorage: storage } as unknown as Window;

    expect(loadUserFromStorage()).toEqual(mockUser);
    expect(storage.getItem).toHaveBeenCalledWith("user");
  });

  it("clears invalid storage values", () => {
    const storage = {
      getItem: vi.fn(() => "not-json"),
      removeItem: vi.fn(),
    };

    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-explicit-any
    (globalThis as any).window = { localStorage: storage } as unknown as Window;

    expect(loadUserFromStorage()).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("user");
    expect(storage.removeItem).toHaveBeenCalledWith("auth_token");
  });

  it("exposes navigation entries for the dashboard", () => {
    const paths = navItems.map((item) => item.href);
    expect(paths).toEqual([
      "/providers",
      "/tools",
      "/policies",
      "/events",
      "/agents",
      "/users",
    ]);
  });
});
