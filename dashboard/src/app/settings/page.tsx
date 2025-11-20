"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Lock, User, Palette } from "lucide-react";

// Helper function to get user initials
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);

  // User data - in a real app, this would come from an API or context
  const [userData, setUserData] = useState({
    firstName: "Itamar",
    lastName: "Mizrahi",
    email: "mizrahi.itamar@gmail.com",
    role: "Owner",
    twoFactorEnabled: false,
  });

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
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // In real implementation, save to backend
      console.log("Saving user data:", userData);
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
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
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Changing password");
      alert("Password changed successfully!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowChangePassword(false);
    } catch (error) {
      console.error("Failed to change password:", error);
      alert("Failed to change password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable2FA = () => {
    setShow2FASetup(true);
    // In real implementation, this would initiate 2FA setup flow
    alert("2FA setup flow would start here");
  };

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
                  onChange={(e) => handleUserDataChange("email", e.target.value)}
                  placeholder="email@example.com"
                  required
                />
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

          {/* Personalisation */}
          <div>
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Personalisation
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
    </div>
  );
}

