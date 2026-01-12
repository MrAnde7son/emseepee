"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Lock, User, Palette, BarChart3 } from "lucide-react";
import { Api } from "@/lib/api";

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Parse name into first and last name
 */
function parseName(name: string | null): { firstName: string; lastName: string } {
  if (!name) {
    return { firstName: "", lastName: "" };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Load user from localStorage
 */
function loadUserFromStorage(): User | null {
  if (typeof window === "undefined") return null;

  const userStr = localStorage.getItem("user");
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

// Helper function to get user initials
function getInitials(firstName: string, lastName: string): string {
  const first = firstName.charAt(0) || "";
  const last = lastName.charAt(0) || "";
  if (!first && !last) return "U";
  return `${first}${last}`.toUpperCase();
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Initialize user data from localStorage
  useEffect(() => {
    const loadedUser = loadUserFromStorage();
    if (!loadedUser) {
      // Redirect to login if no user found
      router.push("/login");
      return;
    }
    setUser(loadedUser);
  }, [router]);

  // Parse user name into first and last name
  const nameParts = user ? parseName(user.name) : { firstName: "", lastName: "" };

  const [userData, setUserData] = useState({
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: user?.email || "",
    role: user?.role || "user",
    twoFactorEnabled: false,
  });

  // Update userData when user loads
  useEffect(() => {
    if (user) {
      const nameParts = parseName(user.name);
      setUserData({
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: user.email,
        role: user.role,
        twoFactorEnabled: false,
      });
    }
  }, [user]);

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleUserDataChange = (field: string, value: string) => {
    setUserData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        router.push("/login");
        return;
      }

      // Update user via API
      const fullName = userData.firstName.trim() + (userData.lastName.trim() ? ` ${userData.lastName.trim()}` : "");
      const updatedUser = await Api.updateUser(user.id, {
        name: fullName || null,
      });

      // Update localStorage with new user data
      localStorage.setItem("user", JSON.stringify({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      }));

      // Update local state
      setUser(updatedUser);
      const nameParts = parseName(updatedUser.name);
      setUserData((prev) => ({
        ...prev,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
      }));

      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save settings. Please try again.";
      alert(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert("New passwords do not match");
      return;
    }
    if (passwordData.newPassword.length < 8) {
      alert("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);
    try {
      // Update password via API
      await Api.updateUser(user.id, {
        password: passwordData.newPassword,
      });

      alert("Password changed successfully!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowChangePassword(false);
    } catch (error) {
      console.error("Failed to change password:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to change password. Please try again.";
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable2FA = () => {
    // In real implementation, this would initiate 2FA setup flow
    alert("2FA setup flow would start here");
  };

  // Show loading state while user data is being loaded
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Personal Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your personal information and preferences
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* User Profile Section */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Profile</h2>
            <p className="text-sm text-muted-foreground">
              Your profile information and account details
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-semibold">
                {userData.firstName} {userData.lastName}
              </div>
              <div className="text-sm text-muted-foreground">{userData.role}</div>
            </div>
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
              {getInitials(userData.firstName, userData.lastName)}
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Basic Information */}
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <User className="h-4 w-4" />
              Basic Information
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium">
                  First Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="firstName"
                  value={userData.firstName}
                  onChange={(e) => handleUserDataChange("firstName", e.target.value)}
                  placeholder="First name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium">
                  Last Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="lastName"
                  value={userData.lastName}
                  onChange={(e) => handleUserDataChange("lastName", e.target.value)}
                  placeholder="Last name"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  id="email"
                  type="email"
                  value={userData.email}
                  readOnly
                  disabled
                  className="bg-muted cursor-not-allowed"
                  placeholder="email@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Email address cannot be changed. Contact support if you need to update your email.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Security */}
          <div>
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Security
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Password</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Last changed 30 days ago
                  </div>
                </div>
                <Button
                  variant="link"
                  className="text-destructive h-auto p-0"
                  onClick={() => setShowChangePassword(!showChangePassword)}
                >
                  Change password
                </Button>
              </div>

              {showChangePassword && (
                <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/50">
                  <div className="space-y-2">
                    <label htmlFor="currentPassword" className="text-sm font-medium">
                      Current Password
                    </label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        handlePasswordChange("currentPassword", e.target.value)
                      }
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="newPassword" className="text-sm font-medium">
                      New Password
                    </label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        handlePasswordChange("newPassword", e.target.value)
                      }
                      placeholder="••••••••"
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium">
                      Confirm New Password
                    </label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        handlePasswordChange("confirmPassword", e.target.value)
                      }
                      placeholder="••••••••"
                      minLength={8}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleChangePassword}
                      disabled={isLoading}
                      size="sm"
                    >
                      {isLoading ? "Changing..." : "Update Password"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowChangePassword(false);
                        setPasswordData({
                          currentPassword: "",
                          newPassword: "",
                          confirmPassword: "",
                        });
                      }}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Two-factor authentication (2FA)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {userData.twoFactorEnabled
                      ? "Two-factor authentication is currently enabled."
                      : "Two-factor authentication is currently disabled."}{" "}
                    <Button
                      variant="link"
                      className="text-primary h-auto p-0 text-xs"
                      onClick={() => alert("Learn more about 2FA")}
                    >
                      Learn more
                    </Button>
                  </div>
                </div>
                {!userData.twoFactorEnabled && (
                  <Button variant="outline" onClick={handleEnable2FA} size="sm">
                    Enable 2FA
                  </Button>
                )}
                {userData.twoFactorEnabled && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUserData((prev) => ({ ...prev, twoFactorEnabled: false }));
                    }}
                    size="sm"
                  >
                    Disable 2FA
                  </Button>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Personalization */}
          <div>
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Personalization
            </h3>
            <div className="space-y-2">
              <label htmlFor="theme" className="text-sm font-medium">
                Theme
              </label>
              <Select value={theme || "system"} onValueChange={setTheme}>
                <SelectTrigger id="theme" className="w-full md:w-[200px]">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light theme</SelectItem>
                  <SelectItem value="dark">Dark theme</SelectItem>
                  <SelectItem value="system">System theme</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Choose your preferred color scheme
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Section */}
      <TelemetrySettings />
    </div>
  );
}

/**
 * Telemetry Settings Component
 */
function TelemetrySettings() {
  const [telemetryConfig, setTelemetryConfig] = useState<{
    enabled: boolean;
    mode: "self-hosted" | "cloud";
    apiKey?: string;
    host?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadTelemetryConfig();
  }, []);

  const loadTelemetryConfig = async () => {
    try {
      setIsLoading(true);
      const config = await Api.getTelemetryConfig();
      setTelemetryConfig({
        enabled: config.enabled,
        mode: config.mode,
        apiKey: config.apiKey === "***" ? undefined : config.apiKey,
        host: config.host,
      });
    } catch (error) {
      console.error("Failed to load telemetry config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTelemetry = async () => {
    if (!telemetryConfig) return;

    try {
      setIsSaving(true);
      await Api.updateTelemetryConfig({
        enabled: telemetryConfig.enabled,
        mode: telemetryConfig.mode,
        apiKey: telemetryConfig.apiKey,
        host: telemetryConfig.host,
      });
      // Reload config to get updated values
      await loadTelemetryConfig();
    } catch (error) {
      console.error("Failed to save telemetry config:", error);
      alert("Failed to save telemetry settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border border-border rounded-xl p-6 bg-card">
        <p className="text-muted-foreground">Loading telemetry settings...</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl p-6 bg-card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Telemetry & Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Help improve EmSeePee by sharing anonymous usage data
          </p>
        </div>
        <Button onClick={handleSaveTelemetry} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      <Separator className="my-6" />

      <div className="space-y-6">
        {/* Deployment Mode */}
        <div>
          <label htmlFor="telemetry-mode" className="text-sm font-medium mb-2 block">
            Deployment Mode
          </label>
          <Select
            value={telemetryConfig?.mode || "self-hosted"}
            onValueChange={(value: "self-hosted" | "cloud") => {
              setTelemetryConfig((prev) => prev ? { ...prev, mode: value } : null);
            }}
          >
            <SelectTrigger id="telemetry-mode" className="w-full md:w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self-hosted">Self-Hosted (Opt-in)</SelectItem>
              <SelectItem value="cloud">Cloud-Managed (Opt-out)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {telemetryConfig?.mode === "self-hosted"
              ? "Telemetry is disabled by default. You must explicitly enable it."
              : "Telemetry is enabled by default. You can disable it if needed."}
          </p>
        </div>

        {/* Enable/Disable Telemetry */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="telemetry-enabled"
            checked={telemetryConfig?.enabled || false}
            onCheckedChange={(checked) => {
              setTelemetryConfig((prev) =>
                prev ? { ...prev, enabled: checked === true } : null
              );
            }}
          />
          <label
            htmlFor="telemetry-enabled"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Enable telemetry
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, anonymous usage data is sent to help improve EmSeePee. No personal
          information or sensitive data is collected.
        </p>

        {/* PostHog Configuration */}
        {telemetryConfig?.enabled && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="text-base font-semibold">PostHog Configuration</h3>

              <div className="space-y-2">
                <label htmlFor="posthog-api-key" className="text-sm font-medium">
                  API Key
                </label>
                <div className="flex gap-2">
                  <Input
                    id="posthog-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={telemetryConfig.apiKey || ""}
                    onChange={(e) => {
                      setTelemetryConfig((prev) =>
                        prev ? { ...prev, apiKey: e.target.value } : null
                      );
                    }}
                    placeholder="phc_..."
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your PostHog project API key. Leave empty to use environment variable.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="posthog-host" className="text-sm font-medium">
                  Host URL
                </label>
                <Input
                  id="posthog-host"
                  type="text"
                  value={telemetryConfig.host || ""}
                  onChange={(e) => {
                    setTelemetryConfig((prev) =>
                      prev ? { ...prev, host: e.target.value } : null
                    );
                  }}
                  placeholder="https://app.posthog.com or https://your-instance.com"
                />
                <p className="text-xs text-muted-foreground">
                  PostHog instance URL. Defaults to PostHog Cloud if empty.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

