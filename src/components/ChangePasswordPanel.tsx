import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { KeyRound } from "lucide-react";
import { Alert, Button, Input } from "./ui";

/**
 * Shown when the user must replace an admin-issued temporary password.
 */
export default function ChangePasswordPanel() {
  const { logout, clearMustChangePassword, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 10 characters and include a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }
      clearMustChangePassword();
      await refresh();
    } catch (err: any) {
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-navy/10 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-navy" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Set a new password</h1>
            <p className="text-xs text-slate-500">
              Your admin gave you a temporary password. You must change it before continuing.
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Current (temporary) password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 10 characters, with a letter and a number"
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            {loading ? "Saving…" : "Save new password"}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          fullWidth
          className="mt-4 text-slate-500"
          onClick={() => logout()}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
