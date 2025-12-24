import "@testing-library/jest-dom/vitest";

import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { AuthGuard } from "@/components/auth-guard";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/settings",
}));

const createTokenWithExpiry = (expSecondsFromNow: number) => {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { exp: Math.floor(Date.now() / 1000) + expSecondsFromNow };

  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  return `${encode(header)}.${encode(payload)}.signature`;
};

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replaceMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears expired tokens and redirects to login", async () => {
    const expiredToken = createTokenWithExpiry(-10);
    localStorage.setItem("auth_token", expiredToken);

    render(
      <AuthGuard>
        <div data-testid="protected">Protected</div>
      </AuthGuard>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("allows rendering when the token is valid", async () => {
    const validToken = createTokenWithExpiry(3600);
    localStorage.setItem("auth_token", validToken);

    render(
      <AuthGuard>
        <div data-testid="protected">Protected</div>
      </AuthGuard>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });
});

