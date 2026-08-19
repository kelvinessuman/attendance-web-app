import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { AlertCircle, CheckCircle2, Copy, Key, UserX, UserCheck, RefreshCw } from "lucide-react";

interface AuthorizedUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  tempPassword: boolean;
  createdAt: string;
  passwordExpiresAt?: string | null;
}

/**
 * Admin-only panel.
 * Admin is a pure authorizer:
 * - Enter email → generate temporary password
 * - Deactivate / reactivate / regenerate password
 * - NO access to groups, attendance, reports, or any operational data
 */
export default function AdminPanel() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setGeneratedPassword(null);
    setAuthorizing(true);
    try {
      const res = await fetch("/api/admin/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() || email.split("@")[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authorization failed");
      setGeneratedPassword(data.temporaryPassword);
      setSuccess(`Account authorized for ${data.email}`);
      setEmail("");
      setFullName("");
      fetchUsers();
    } catch (err: any) {
      setError(err.message || "Authorization failed");
    } finally {
      setAuthorizing(false);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm("Deactivate this account? The user will no longer be able to log in.")) return;
    try {
      const res = await fetch(`/api/admin/deactivate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to deactivate");
      setSuccess("Account deactivated");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/reactivate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reactivate");
      setSuccess("Account reactivated");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRegenerate = async (userId: string) => {
    if (!confirm("Generate a new temporary password? The old one will stop working.")) return;
    try {
      const res = await fetch(`/api/admin/regenerate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate");
      setGeneratedPassword(data.temporaryPassword);
      setSuccess(`New temporary password generated for ${data.email}`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setSuccess("Password copied to clipboard");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-navy text-white px-6 py-4 flex justify-between items-center shadow">
        <div>
          <h1 className="font-bold text-lg">Admin — Authorization Only</h1>
          <p className="text-white/70 text-xs">You can authorize users. You cannot view attendance or any operational data.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">{user?.email}</span>
          <button
            onClick={() => logout()}
            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Authorize form */}
        <section className="bg-white rounded-2xl shadow border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Key className="h-5 w-5 text-navy" />
            Authorize New User
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            Enter the email of the person who should have access. The system will generate a temporary password.
          </p>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 border border-red-200 flex gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-xl bg-green-50 p-3 border border-green-200 flex gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              {success}
            </div>
          )}

          {generatedPassword && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-sm font-medium text-amber-900 mb-2">
                Temporary password (shown only once — copy and send it securely):
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 bg-white border border-amber-300 rounded-lg px-4 py-2.5 font-mono text-lg tracking-wide">
                  {generatedPassword}
                </code>
                <button
                  onClick={copyPassword}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm"
                >
                  <Copy className="h-4 w-4" /> Copy
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleAuthorize} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lecturer@example.com"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={authorizing}
                className="bg-navy hover:bg-navy/90 disabled:bg-slate-400 text-white font-semibold px-6 py-3 rounded-xl text-sm"
              >
                {authorizing ? "Generating..." : "Authorize & Generate Temporary Password"}
              </button>
            </div>
          </form>
        </section>

        {/* Users list */}
        <section className="bg-white rounded-2xl shadow border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-semibold text-slate-800">Authorized Users</h2>
            <button
              onClick={fetchUsers}
              className="text-sm text-navy hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-500 text-sm">No users authorized yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Authorized</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium text-slate-800">{u.email}</td>
                      <td className="py-3 pr-4 text-slate-600">{u.fullName}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            u.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {u.isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2 flex-wrap">
                          {u.isActive ? (
                            <button
                              onClick={() => handleDeactivate(u.id)}
                              className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                            >
                              <UserX className="h-3.5 w-3.5" /> Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(u.id)}
                              className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                            >
                              <UserCheck className="h-3.5 w-3.5" /> Reactivate
                            </button>
                          )}
                          <button
                            onClick={() => handleRegenerate(u.id)}
                            className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                          >
                            <Key className="h-3.5 w-3.5" /> New Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-center text-xs text-slate-400">
          Admin has no access to courses, attendance records, reports, or any operational data.
        </p>
      </div>
    </div>
  );
}
