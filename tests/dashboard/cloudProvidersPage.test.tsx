import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";

import CloudProvidersPage from "@/app/providers/cloud/page";

describe("CloudProvidersPage", () => {
  it("shows all cloud providers as coming soon", () => {
    render(<CloudProvidersPage />);

    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getByText(/Manage cloud integrations/i)).toBeInTheDocument();

    [
      { name: "Amazon AWS", type: "aws" },
      { name: "Google GCP", type: "gcp" },
      { name: "Microsoft Azure", type: "azure" },
      { name: "Oracle OCI", type: "oci" },
    ].forEach(({ name, type }) => {
      const providerCard = screen.getByTestId(`cloud-provider-${type}`);
      expect(providerCard).toBeInTheDocument();
      expect(providerCard.textContent).toContain(name);
      expect(providerCard.textContent).toMatch(new RegExp(`Type:\\s*${type}`, "i"));
      expect(within(providerCard).getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(1);
      expect(within(providerCard).getByAltText(`${name} icon`)).toBeInTheDocument();
    });

    // Header badge plus badges inside each card
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(5);
  });
});
