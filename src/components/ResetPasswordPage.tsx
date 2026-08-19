import React, { useState } from "react";
import { QrCode, CheckCircle2, AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password.");
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center p-3.5 bg-navy rounded-3xl shadow-xl shadow-navy/10 text-white mb-6">
          <QrCode className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold font-sans tracking-tight text-slate-900">Set a New Password</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-2xl sm:px-10 border border-slate-100">
          {!token ? (
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600">
                This reset link is missing its token. Please use the link from your email exactly as sent, or request a new one from the login page.
              </p>
              <a href="/" className="inline-block mt-4 text-xs font-semibold text-navy hover:underline">
                Back to login
              </a>
            </div>
          ) : done ? (
            <div className="text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Your password has been reset successfully.</p>
              <a href="/" className="inline-block mt-4 text-sm font-semibold text-navy hover:underline">
                Continue to login
              </a>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
                  placeholder="Re-enter new password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-navy text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
