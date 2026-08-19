import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { motion } from "motion/react";
import ugLogo from "../assets/UG Logo.png";
import { Alert, Button, Input } from "./ui";

/**
 * Login-only panel.
 * Self-registration and "Forgot password" have been removed.
 * Only an Admin can authorize users by generating temporary passwords.
 */
export default function AuthPanel() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(loginEmail.trim(), loginPassword);
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
      >
        <div className="bg-navy px-6 py-5 flex items-center gap-3">
          <img
            src={ugLogo}
            alt="University logo"
            className="h-10 w-10 object-contain"
          />
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight">
              QR Attendance System
            </h1>
            <p className="text-white/70 text-xs">Authorized users only</p>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 mb-5">
            Contact the admin if you need access.
          </p>

          {error && (
            <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
