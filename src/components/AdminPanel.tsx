import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { AlertCircle, CheckCircle2, Copy, Key, UserX, UserCheck, RefreshCw } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Spinner,
} from "./ui";

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
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || email.split("@")[0],
        }),
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
    if (
      !confirm(
        "Deactivate this account? The user will no longer be able to log in."
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/deactivate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to deactivate");
      setSuccess("Account deactivated");
      setError(null);
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
      setError(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRegenerate = async (userId: string) => {
    if (
      !confirm(
        "Generate a new temporary password? The old one will stop working."
      )
    )
      return;
    try {
      const res = await fetch(`/api/admin/regenerate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate");
      setGeneratedPassword(data.temporaryPassword);
      setSuccess(`New temporary password generated for ${data.email}`);
      setError(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyPassword = async () => {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setSuccess("Password copied to clipboard");
    } catch {
      setError("Could not copy — select the password and copy manually.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-navy text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 shadow">
        <div>
          <h1 className="font-bold text-lg tracking-tight">
            Admin — Authorization Only
          </h1>
          <p className="text-white/70 text-xs mt-0.5">
            You can authorize users. You cannot view attendance or operational
            data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/80 truncate max-w-[200px]">
            {user?.email}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => logout()}
            className="bg-white/10 text-white hover:bg-white/20 border-0"
          >
            Logout
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {(error || success) && (
          <div className="space-y-2">
            {error && (
              <Alert variant="error" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert variant="success" onDismiss={() => setSuccess(null)}>
                {success}
              </Alert>
            )}
          </div>
        )}

        <Card>
          <CardHeader
            title="Authorize new user"
            description="Enter the email of the person who should have access. A temporary password will be generated."
          />

          {generatedPassword && (
            <Alert variant="warning" className="mb-5">
              <p className="font-medium mb-2">
                Temporary password (shown only once — copy and send it
                securely):
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <code className="flex-1 bg-white border border-amber-300 rounded-lg px-4 py-2.5 font-mono text-base tracking-wide break-all">
                  {generatedPassword}
                </code>
                <Button variant="amber" size="md" onClick={copyPassword}>
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy
                </Button>
              </div>
            </Alert>
          )}

          <form
            onSubmit={handleAuthorize}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            noValidate
          >
            <Input
              label="Email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lecturer@example.com"
            />
            <Input
              label="Full name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              hint="Optional — defaults to the part before @"
            />
            <div className="sm:col-span-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={authorizing}
              >
                <Key className="h-4 w-4" aria-hidden />
                {authorizing
                  ? "Generating…"
                  : "Authorize & generate temporary password"}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Authorized users"
            description={
              loading
                ? undefined
                : `${users.length} coordinator${users.length === 1 ? "" : "s"}`
            }
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchUsers}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  aria-hidden
                />
                Refresh
              </Button>
            }
          />

          {loading ? (
            <Spinner label="Loading users…" />
          ) : users.length === 0 ? (
            <EmptyState
              title="No users authorized yet"
              description="Use the form above to authorize a coordinator. They will receive a temporary password to sign in."
              icon={<Users className="h-6 w-6" aria-hidden />}
            />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Email
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Authorized
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        {u.email}
                      </td>
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
                        {u.tempPassword && u.isActive && (
                          <span className="ml-1.5 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Temp password
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2 flex-wrap">
                          {u.isActive ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeactivate(u.id)}
                            >
                              <UserX className="h-3.5 w-3.5" aria-hidden />
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReactivate(u.id)}
                              className="bg-green-50 text-green-700 hover:bg-green-100"
                            >
                              <UserCheck className="h-3.5 w-3.5" aria-hidden />
                              Reactivate
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRegenerate(u.id)}
                          >
                            <Key className="h-3.5 w-3.5" aria-hidden />
                            New password
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-slate-400 pb-4">
          Admin has no access to courses, attendance records, reports, or any
          operational data.
        </p>
      </div>
    </div>
  );
}
