import React, { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  Link,
} from "react-router-dom";
import { useAuth } from "./lib/auth";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, FolderHeart, Sparkles, RefreshCw,
} from "lucide-react";
import AuthPanel from "./components/AuthPanel";
import CheckInPage from "./components/CheckInPage";
import GroupDetails from "./components/GroupDetails";
import ReportsPanel from "./components/ReportsPanel";
import AboutPage from "./components/AboutPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import AdminPanel from "./components/AdminPanel";
import { Group } from "./types";

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
      <p className="text-sm text-slate-500 font-sans">Connecting to system gateway...</p>
    </div>
  );
}

/** Require a logged-in user; otherwise show login.
 *  Admins are redirected to /admin and never see operational dashboards.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <AuthPanel />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/** Admin-only route guard — pure authorizer, no operational access. */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <AuthPanel />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function CreatorShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout().then(() => navigate("/", { replace: true }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-navy shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-12 items-center">
            <Link
              to="/"
              className="flex items-center cursor-pointer"
            >
              <span className="font-bold text-white tracking-tight font-sans text-sm">
                Welcome to the QR Attendance System
              </span>
            </Link>
            <div className="flex items-center gap-5">
              <Link
                to="/about"
                className="text-xs font-medium text-white/85 hover:text-white cursor-pointer transition-colors"
              >
                About
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs font-medium text-white/85 hover:text-white cursor-pointer transition-colors"
                title="Sign out of panel"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <div className="flex-grow">{children}</div>
    </div>
  );
}

function DashboardPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const fetchCreatorGroups = async () => {
    if (!currentUser) return;
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/groups", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setGroups(data.groups as Group[]);
      } else {
        console.error("Error loading groups:", data.error);
      }
    } catch (err) {
      console.error("Error loading groups:", err);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    setDeletingGroupId(groupId);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete group.");
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      console.error("Error deleting group:", err);
    } finally {
      setDeletingGroupId(null);
      setConfirmDeleteGroupId(null);
    }
  };

  useEffect(() => {
    if (currentUser) fetchCreatorGroups();
  }, [currentUser]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !currentUser) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create group.");
      }
      setGroups((prev) => [...prev, data.group]);
      setShowCreateModal(false);
      setNewGroupName("");
      setNewGroupDesc("");
    } catch (err: any) {
      console.error(err);
      setCreateError("Failed to create group: " + err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.main
          key="dashboard"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-left"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4 mb-6">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight font-sans">
                Attendance Groups
              </h1>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Rosters, schedules, QR codes, and attendance logs.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-1.5 bg-navy hover:bg-navy/90 text-white font-semibold py-2 px-3.5 rounded-xl text-xs transition-colors shadow-sm shadow-navy/10 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Group
            </button>
          </div>

          {groupsLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="h-7 w-7 text-navy animate-spin mb-3" />
              <p className="text-xs text-slate-500">Loading groups...</p>
            </div>
          ) : groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {groups.map((grp) => (
                <motion.div
                  whileHover={{ y: -2, transition: { duration: 0.12 } }}
                  key={grp.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-sm hover:shadow-md hover:border-navy/20 transition-all relative overflow-hidden flex flex-col gap-3"
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-navy" />
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight font-sans truncate">
                      {grp.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {grp.description || "No description"}
                    </p>
                  </div>

                  {confirmDeleteGroupId === grp.id ? (
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 truncate">Delete group?</span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => setConfirmDeleteGroupId(null)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(grp.id)}
                          disabled={deletingGroupId === grp.id}
                          className="text-[11px] font-bold text-red-500 hover:text-red-600 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {deletingGroupId === grp.id ? "..." : "Confirm"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => navigate(`/groups/${grp.id}`)}
                        className="flex-1 text-[11px] font-semibold text-navy hover:bg-navy/8 rounded-lg py-1.5 cursor-pointer transition-colors"
                      >
                        Configure
                      </button>
                      <button
                        onClick={() => navigate(`/groups/${grp.id}/reports`)}
                        className="flex-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 rounded-lg py-1.5 cursor-pointer transition-colors"
                      >
                        Reports
                      </button>
                      <button
                        onClick={() => setConfirmDeleteGroupId(grp.id)}
                        className="flex-1 text-[11px] font-semibold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg py-1.5 cursor-pointer transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 max-w-sm mx-auto">
              <div className="mx-auto w-12 h-12 bg-navy/8 border border-navy/10 rounded-2xl flex items-center justify-center mb-4">
                <FolderHeart className="h-6 w-6 text-navy" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 font-sans">No groups yet</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Create a group to register participants and schedule QR check-ins.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center gap-1 px-3.5 py-2 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs mt-4 cursor-pointer shadow-sm shadow-navy/10"
              >
                <Plus className="h-3.5 w-3.5" /> Create group
              </button>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="bg-white border border-slate-100 rounded-2xl max-w-md w-full p-5 shadow-2xl relative text-left"
            >
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-navy rounded-t-2xl" />
              <h2 className="text-base font-bold text-slate-950 flex items-center gap-2 mb-1 font-sans mt-0.5">
                <Sparkles className="h-4 w-4 text-navy" />
                Create group
              </h2>
              <p className="text-[11px] text-slate-400 mb-5 font-sans leading-relaxed">
                Groups represent classes or events. Add schedules and participants after creating.
              </p>

              <form onSubmit={handleCreateGroup} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Group title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Algorithms 301"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Optional class details..."
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800 resize-none"
                  />
                </div>

                {createError && (
                  <div className="p-2.5 bg-navy/8 border border-navy/15 text-navy text-xs rounded-xl font-medium">
                    {createError}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex-1 bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {createLoading ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function GroupDetailsRoute() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  if (!groupId) return <Navigate to="/" replace />;

  return (
    <motion.div
      key={`group-${groupId}`}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <GroupDetails
        groupId={groupId}
        onBack={() => navigate("/")}
        onViewReports={() => navigate(`/groups/${groupId}/reports`)}
      />
    </motion.div>
  );
}

function ReportsRoute() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}/details`, { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.group?.name) {
          setGroupName(data.group.name);
        }
      } catch {
        /* ignore — ReportsPanel still works without the name */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!groupId) return <Navigate to="/" replace />;

  return (
    <motion.div
      key={`reports-${groupId}`}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <ReportsPanel
        groupId={groupId}
        groupName={groupName}
        onBack={() => navigate(`/groups/${groupId}`)}
      />
    </motion.div>
  );
}

function CheckInRoute() {
  const { groupId } = useParams<{ groupId: string }>();
  if (!groupId) return <Navigate to="/" replace />;
  return <CheckInPage groupId={groupId} />;
}

function AboutRoute() {
  const navigate = useNavigate();
  return <AboutPage onBack={() => navigate(-1)} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/checkin/:groupId" element={<CheckInRoute />} />
      <Route path="/about" element={<AboutRoute />} />

      {/* Admin-only — pure authorizer, no operational data */}
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminPanel />
          </RequireAdmin>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <CreatorShell>
              <DashboardPage />
            </CreatorShell>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId"
        element={
          <RequireAuth>
            <CreatorShell>
              <GroupDetailsRoute />
            </CreatorShell>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/reports"
        element={
          <RequireAuth>
            <CreatorShell>
              <ReportsRoute />
            </CreatorShell>
          </RequireAuth>
        }
      />

      {/* Unknown paths → home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
