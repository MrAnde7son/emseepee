import { vi } from "vitest";

vi.mock("@/lib/api", () => ({
  Api: {
    login: vi.fn().mockResolvedValue({
      token: "mock-token",
      user: { id: "1", email: "john@example.com" },
    }),
  },
}));

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import LoginPage from "@/app/login/page";

const renderLogin = () => render(<LoginPage />);

describe("LoginPage", () => {
  it("uses a top-aligned layout instead of centering content", () => {
    renderLogin();

    const container = screen.getByTestId("login-page-container");

    expect(container).toHaveClass("min-h-screen");
    expect(container).toHaveClass("bg-background");
    expect(container.className).not.toMatch(/items-center|justify-center/);
  });

  it("shows a validation message when required fields are missing", () => {
    renderLogin();

    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }));

    expect(
      screen.getByText(/email and password are required/i),
    ).toBeInTheDocument();
  });
});
