"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!formData.email || !formData.password) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);

    try {
      const response = await Api.login({
        email: formData.email,
        password: formData.password,
      });

      // Store token in localStorage
      localStorage.setItem("auth_token", response.token);
      localStorage.setItem("user", JSON.stringify(response.user));

      // Redirect to dashboard after successful login
      router.push("/");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Invalid email or password. Please try again.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    setError("");
    setSocialLoading(provider);

    try {
      const { authorizationUrl } = await Api.startSocialLogin(provider);
      window.location.href = authorizationUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unable to start social login. Please try again.";
      setError(errorMessage);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input"
                defaultChecked
              />
              <span className="text-muted-foreground">Remember me</span>
            </label>
            <Link
              href="/forgot-password"
              className="text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="w-full"
            type="button"
            disabled={!!socialLoading}
            onClick={() => handleSocialLogin("github")}
          >
            <GithubIcon className="mr-2 h-4 w-4" />
            {socialLoading === "github" ? "Connecting..." : "Continue with GitHub"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            type="button"
            disabled={!!socialLoading}
            onClick={() => handleSocialLogin("google")}
          >
            <GoogleIcon className="mr-2 h-4 w-4" />
            {socialLoading === "google" ? "Connecting..." : "Continue with Google"}
          </Button>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      role="img"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M12 .5a12 12 0 0 0-3.794 23.4c.6.11.82-.26.82-.58 0-.29-.01-1.06-.02-2.09-3.338.73-4.042-1.61-4.042-1.61-.546-1.39-1.333-1.76-1.333-1.76-1.09-.74.083-.73.083-.73 1.204.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.494 1 .108-.77.42-1.31.763-1.61-2.665-.3-5.466-1.33-5.466-5.93 0-1.31.47-2.38 1.236-3.22-.124-.3-.535-1.52.117-3.17 0 0 1.006-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.295-1.23 3.295-1.23.654 1.65.243 2.87.12 3.17.77.84 1.234 1.91 1.234 3.22 0 4.61-2.805 5.63-5.48 5.93.43.37.824 1.1.824 2.22 0 1.6-.015 2.89-.015 3.28 0 .32.217.7.825.58A12 12 0 0 0 12 .5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6 1.54 7.38 2.84l5.4-5.26C33.98 3.64 29.38 1.5 24 1.5 14.82 1.5 6.92 6.98 3.44 14.58l6.68 5.19C11.6 14.16 17.25 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.64-.15-3.2-.43-4.7H24v9.1h12.7c-.55 2.9-2.2 5.35-4.7 7.04l7.2 5.6C43.66 37.84 46.5 31.7 46.5 24.5Z"
      />
      <path
        fill="#FBBC05"
        d="M10.12 28.77c-.48-1.45-.75-3-.75-4.77s.27-3.32.75-4.77l-6.68-5.19C1.93 16.84 1.5 20.37 1.5 24c0 3.63.43 7.16 1.94 10.96l6.68-5.19Z"
      />
      <path
        fill="#34A853"
        d="M24 46.5c5.38 0 9.9-1.77 13.2-4.82l-7.2-5.6c-2 1.35-4.6 2.14-6 2.14-5.74 0-10.58-3.88-12.33-9.23l-6.68 5.19C9 41.02 16.07 46.5 24 46.5Z"
      />
      <path fill="none" d="M1.5 1.5h45v45h-45Z" />
    </svg>
  );
}

