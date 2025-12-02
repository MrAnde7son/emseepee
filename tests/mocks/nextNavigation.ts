import { vi } from "vitest";

export const useRouter = () => ({
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
});

export const usePathname = () => "/login";
export const useSearchParams = () => new URLSearchParams();
