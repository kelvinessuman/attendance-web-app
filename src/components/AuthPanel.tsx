import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { motion } from "motion/react";
import ugLogo from "../assets/UG Logo.png";
import { AlertCircle } from "lucide-react";

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
          <img src={ugLogo} alt="Logo" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="text-white font-bold text-lg tracking-tight">QR Attendance</h1>
            <p className="text-white/70 text-xs">Authorized users only</p>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 mb-5">
            Accounts are created by an administrator. Contact your admin if you need access.
          </p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy hover:bg-navy/90 disabled:bg-slate-400 text-white font-semibold py-3 rounded-xl transition text-sm"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
