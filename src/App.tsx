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
import AdminPanel from "./components/AdminPanel";
import ChangePasswordPanel from "./components/ChangePasswordPanel";
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
  const { user, loading, mustChangePassword } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <AuthPanel />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (mustChangePassword) return <ChangePasswordPanel />;
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
            <Link to="/" className="flex items-center cursor-pointer">
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

  useEffect(() => {
    fetchCreatorGroups();
  }, [currentUser]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!newGroupName.trim()) {
      setCreateError("Group name is required.");
      return;
    }
    setCreateLoading(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create group");
      setShowCreateModal(false);
      setNewGroupName("");
