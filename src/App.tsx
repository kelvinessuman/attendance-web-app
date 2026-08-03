import React, { useState, useEffect } from "react";
import { useAuth } from "./lib/auth";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, Plus, LogOut, FolderHeart, Calendar, FileBarChart, Sparkles, RefreshCw, QrCode, Lock, ArrowRight, BookOpen 
} from "lucide-react";

import AuthPanel from "./components/AuthPanel";
import CheckInPage from "./components/CheckInPage";
import GroupDetails from "./components/GroupDetails";
import ReportsPanel from "./components/ReportsPanel";
import AboutPage from "./components/AboutPage";
import ResetPasswordPage from "./components/ResetPasswordPage";
import { Group } from "./types";

export default function App() {
  const { user: currentUser, loading: authLoading, logout } = useAuth();

  // Custom client router state
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [view, setView] = useState<"dashboard" | "group_details" | "reports">("dashboard");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>("");

  // Dashboard states
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // 1. Listen to custom URL changes & navigation
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Helper navigate function
  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  // 2. Fetch groups owned by currently authenticated creator
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
    if (currentUser) {
      fetchCreatorGroups();
    }
  }, [currentUser]);

  // 4. Create Group Handler
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

      setGroups([...groups, data.group]);
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

  // Sign out helper
  const handleSignOut = () => {
    logout().then(() => {
      setView("dashboard");
      setSelectedGroupId(null);
    });
  };

  // 5. Check if we are on a Student Check-In path (Public)
  // Path format: /checkin/:groupId
  const isCheckinRoute = currentPath.startsWith("/checkin/");
  const checkinGroupId = isCheckinRoute ? currentPath.split("/checkin/")[1] : null;

  // Route: Public "About" page
  const isAboutRoute = currentPath === "/about";

  // Route: Public password-reset landing page (from the emailed reset link)
  const isResetPasswordRoute = currentPath === "/reset-password";

  if (isResetPasswordRoute) {
    return <ResetPasswordPage />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
        <p className="text-sm text-slate-500 font-sans">Connecting to system gateway...</p>
      </div>
    );
  }

  // Route: Public camera-scan check-in page
  if (isCheckinRoute && checkinGroupId) {
    return <CheckInPage groupId={checkinGroupId} />;
  }

  if (isAboutRoute) {
    return <AboutPage onBack={() => navigate("/")} />;
  }

  // Route: Authenticated dashboard or auth screen
  if (!currentUser) {
    return <AuthPanel />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Creator Navigation Bar */}
      <nav className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo */}
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => { setView("dashboard"); setSelectedGroupId(null); }}>
              <div className="p-2 bg-navy rounded-xl text-white shadow-md shadow-navy/10">
                <QrCode className="h-5 w-5" />
              </div>
              <span className="font-extrabold text-slate-900 tracking-tight font-sans text-base">
                QR Attendance
              </span>
            </div>

            {/* Profile Info & Actions */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/about")}
                className="hidden sm:inline text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
              >
                About
              </button>
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900">Coordinator Portal</span>
                <span className="text-[10px] text-slate-400 font-medium font-mono">{currentUser.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl cursor-pointer transition-colors border border-slate-200/50"
                title="Sign out of panel"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Workspace Frame */}
      <div className="flex-grow">
        <AnimatePresence mode="wait">
          
          {/* VIEW: GROUPS DASHBOARD */}
          {view === "dashboard" && (
            <motion.main
              key="dashboard"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-left"
            >
              {/* Dashboard Intro */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-8">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
                    Attendance Groups
                  </h1>
                  <p className="text-sm text-slate-500 font-sans mt-1">
                    Manage your class rosters, setup calendars, print QR scanners, and explore logs.
                  </p>
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 bg-navy hover:bg-navy/90 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm shadow-navy/10 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> New Group
                </button>
              </div>

              {/* Groups grid */}
              {groupsLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <RefreshCw className="h-8 w-8 text-navy animate-spin mb-3" />
                  <p className="text-xs text-slate-500">Loading rosters...</p>
                </div>
              ) : groups.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groups.map((grp) => (
                    <motion.div
                      whileHover={{ y: -4, transition: { duration: 0.15 } }}
                      key={grp.id}
                      className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between h-[210px]"
                    >
                      {/* Top content */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans line-clamp-1">
                            {grp.name}
                          </h3>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-navy bg-navy/8 px-2.5 py-0.5 rounded-full">
                            <Calendar className="h-3.5 w-3.5" />
                            {grp.schedules?.length || 0} slots
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                          {grp.description || "No description provided."}
                        </p>
                      </div>

                      {/* Bottom actions row */}
                      <div className="grid grid-cols-2 gap-2.5 border-t border-slate-50 pt-4">
                        <button
                          onClick={() => {
                            setSelectedGroupId(grp.id);
                            setSelectedGroupName(grp.name);
                            setView("group_details");
                          }}
                          className="flex items-center justify-center gap-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer border border-slate-100"
                        >
                          Configure
                        </button>
                        <button
                          onClick={() => {
                            setSelectedGroupId(grp.id);
                            setSelectedGroupName(grp.name);
                            setView("reports");
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer shadow-sm shadow-navy/10"
                        >
                          <FileBarChart className="h-3.5 w-3.5" /> Reports
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 max-w-md mx-auto">
                  <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 mb-5">
                    <FolderHeart className="h-8 w-8 text-navy/80" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">No Groups Active</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                    Create your very first attendance tracking group to start registering participants and scheduling QR codes.
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs mt-5 cursor-pointer shadow-sm shadow-navy/10"
                  >
                    <Plus className="h-4 w-4" /> Create Now
                  </button>
                </div>
              )}
            </motion.main>
          )}

          {/* VIEW: GROUP SETUP & DETAILS */}
          {view === "group_details" && selectedGroupId && (
            <motion.div
              key="group_details"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              <GroupDetails 
                groupId={selectedGroupId} 
                onBack={() => { setView("dashboard"); setSelectedGroupId(null); }}
                onViewReports={() => setView("reports")}
              />
            </motion.div>
          )}

          {/* VIEW: ANALYTICS & REPORTS */}
          {view === "reports" && selectedGroupId && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              <ReportsPanel 
                groupId={selectedGroupId}
                groupName={selectedGroupName}
                onBack={() => setView("group_details")}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* MODAL: CREATE GROUP */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-slate-100 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-left"
            >
              <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2 mb-2 font-sans">
                <Sparkles className="h-5 w-5 text-navy animate-pulse" />
                Create Attendance Group
              </h2>
              <p className="text-xs text-slate-400 mb-6 font-sans leading-relaxed">
                Groups represent sections, events, or classes. Add schedules and participants once created.
              </p>

              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Group Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Algorithms & Complexity 301"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Provide simple instructions or class details here..."
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
                  />
                </div>

                {createError && (
                  <div className="p-3 bg-navy/8 border border-navy/15 text-navy text-xs rounded-xl font-medium">
                    {createError}
                  </div>
                )}

                <div className="flex gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex-1 bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-center"
                  >
                    {createLoading ? "Creating..." : "Create Group"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}



// import React, { useState, useEffect } from "react";
// import { useAuth } from "./lib/auth";
// import { motion, AnimatePresence } from "motion/react";
// import { 
//   Users, Plus, LogOut, FolderHeart, Calendar, FileBarChart, Sparkles, RefreshCw, QrCode, Lock, ArrowRight, BookOpen 
// } from "lucide-react";

// import AuthPanel from "./components/AuthPanel";
// import CheckInPage from "./components/CheckInPage";
// import GroupDetails from "./components/GroupDetails";
// import ReportsPanel from "./components/ReportsPanel";
// import AboutPage from "./components/AboutPage";
// import { Group } from "./types";

// export default function App() {
//   const { user: currentUser, loading: authLoading, logout } = useAuth();

//   // Custom client router state
//   const [currentPath, setCurrentPath] = useState(window.location.pathname);
//   const [view, setView] = useState<"dashboard" | "group_details" | "reports">("dashboard");
//   const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
//   const [selectedGroupName, setSelectedGroupName] = useState<string>("");

//   // Dashboard states
//   const [groups, setGroups] = useState<Group[]>([]);
//   const [groupsLoading, setGroupsLoading] = useState(false);
//   const [showCreateModal, setShowCreateModal] = useState(false);
//   const [newGroupName, setNewGroupName] = useState("");
//   const [newGroupDesc, setNewGroupDesc] = useState("");
//   const [createError, setCreateError] = useState<string | null>(null);
//   const [createLoading, setCreateLoading] = useState(false);

//   // 1. Listen to custom URL changes & navigation
//   useEffect(() => {
//     const handleLocationChange = () => {
//       setCurrentPath(window.location.pathname);
//     };

//     window.addEventListener("popstate", handleLocationChange);
//     return () => {
//       window.removeEventListener("popstate", handleLocationChange);
//     };
//   }, []);

//   // Helper navigate function
//   const navigate = (path: string) => {
//     window.history.pushState({}, "", path);
//     setCurrentPath(path);
//   };

//   // 2. Fetch groups owned by currently authenticated creator
//   const fetchCreatorGroups = async () => {
//     if (!currentUser) return;
//     setGroupsLoading(true);
//     try {
//       const res = await fetch("/api/groups", { credentials: "include" });
//       const data = await res.json();
//       if (res.ok) {
//         setGroups(data.groups as Group[]);
//       } else {
//         console.error("Error loading groups:", data.error);
//       }
//     } catch (err) {
//       console.error("Error loading groups:", err);
//     } finally {
//       setGroupsLoading(false);
//     }
//   };

//   useEffect(() => {
//     if (currentUser) {
//       fetchCreatorGroups();
//     }
//   }, [currentUser]);

//   // 4. Create Group Handler
//   const handleCreateGroup = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!newGroupName.trim() || !currentUser) return;

//     setCreateLoading(true);
//     setCreateError(null);

//     try {
//       const res = await fetch("/api/groups", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         credentials: "include",
//         body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() }),
//       });
//       const data = await res.json();
//       if (!res.ok) {
//         throw new Error(data.error || "Failed to create group.");
//       }

//       setGroups([...groups, data.group]);
//       setShowCreateModal(false);
//       setNewGroupName("");
//       setNewGroupDesc("");
//     } catch (err: any) {
//       console.error(err);
//       setCreateError("Failed to create group: " + err.message);
//     } finally {
//       setCreateLoading(false);
//     }
//   };

//   // Sign out helper
//   const handleSignOut = () => {
//     logout().then(() => {
//       setView("dashboard");
//       setSelectedGroupId(null);
//     });
//   };

//   // 5. Check if we are on a Student Check-In path (Public)
//   // Path format: /checkin/:groupId
//   const isCheckinRoute = currentPath.startsWith("/checkin/");
//   const checkinGroupId = isCheckinRoute ? currentPath.split("/checkin/")[1] : null;

//   // Route: Public "About" page
//   const isAboutRoute = currentPath === "/about";

//   if (authLoading) {
//     return (
//       <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
//         <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
//         <p className="text-sm text-slate-500 font-sans">Connecting to system gateway...</p>
//       </div>
//     );
//   }

//   // Route: Public camera-scan check-in page
//   if (isCheckinRoute && checkinGroupId) {
//     return <CheckInPage groupId={checkinGroupId} />;
//   }

//   if (isAboutRoute) {
//     return <AboutPage onBack={() => navigate("/")} />;
//   }

//   // Route: Authenticated dashboard or auth screen
//   if (!currentUser) {
//     return <AuthPanel />;
//   }

//   return (
//     <div className="min-h-screen bg-slate-50 flex flex-col">
//       {/* Creator Navigation Bar */}
//       <nav className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex justify-between h-16 items-center">
//             {/* Logo */}
//             <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => { setView("dashboard"); setSelectedGroupId(null); }}>
//               <div className="p-2 bg-navy rounded-xl text-white shadow-md shadow-navy/10">
//                 <QrCode className="h-5 w-5" />
//               </div>
//               <span className="font-extrabold text-slate-900 tracking-tight font-sans text-base">
//                 QR Attendance
//               </span>
//             </div>

//             {/* Profile Info & Actions */}
//             <div className="flex items-center gap-4">
//               <button
//                 onClick={() => navigate("/about")}
//                 className="hidden sm:inline text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
//               >
//                 About
//               </button>
//               <div className="hidden sm:flex flex-col text-right">
//                 <span className="text-xs font-bold text-slate-900">Coordinator Portal</span>
//                 <span className="text-[10px] text-slate-400 font-medium font-mono">{currentUser.email}</span>
//               </div>
//               <button
//                 onClick={handleSignOut}
//                 className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl cursor-pointer transition-colors border border-slate-200/50"
//                 title="Sign out of panel"
//               >
//                 <LogOut className="h-4 w-4" />
//               </button>
//             </div>
//           </div>
//         </div>
//       </nav>

//       {/* Main Workspace Frame */}
//       <div className="flex-grow">
//         <AnimatePresence mode="wait">
          
//           {/* VIEW: GROUPS DASHBOARD */}
//           {view === "dashboard" && (
//             <motion.main
//               key="dashboard"
//               initial={{ opacity: 0, y: 5 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -5 }}
//               className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-left"
//             >
//               {/* Dashboard Intro */}
//               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-8">
//                 <div>
//                   <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
//                     Attendance Groups
//                   </h1>
//                   <p className="text-sm text-slate-500 font-sans mt-1">
//                     Manage your class rosters, setup calendars, print QR scanners, and explore logs.
//                   </p>
//                 </div>

//                 <button
//                   onClick={() => setShowCreateModal(true)}
//                   className="inline-flex items-center justify-center gap-1.5 bg-navy hover:bg-navy/90 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm shadow-navy/10 cursor-pointer"
//                 >
//                   <Plus className="h-4 w-4" /> New Group
//                 </button>
//               </div>

//               {/* Groups grid */}
//               {groupsLoading ? (
//                 <div className="flex flex-col items-center justify-center py-20">
//                   <RefreshCw className="h-8 w-8 text-navy animate-spin mb-3" />
//                   <p className="text-xs text-slate-500">Loading rosters...</p>
//                 </div>
//               ) : groups.length > 0 ? (
//                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//                   {groups.map((grp) => (
//                     <motion.div
//                       whileHover={{ y: -4, transition: { duration: 0.15 } }}
//                       key={grp.id}
//                       className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between h-[210px]"
//                     >
//                       {/* Top content */}
//                       <div>
//                         <div className="flex items-start justify-between gap-2">
//                           <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans line-clamp-1">
//                             {grp.name}
//                           </h3>
//                           <span className="flex items-center gap-1 text-[10px] font-bold text-navy bg-navy/8 px-2.5 py-0.5 rounded-full">
//                             <Calendar className="h-3.5 w-3.5" />
//                             {grp.schedules?.length || 0} slots
//                           </span>
//                         </div>
//                         <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
//                           {grp.description || "No description provided."}
//                         </p>
//                       </div>

//                       {/* Bottom actions row */}
//                       <div className="grid grid-cols-2 gap-2.5 border-t border-slate-50 pt-4">
//                         <button
//                           onClick={() => {
//                             setSelectedGroupId(grp.id);
//                             setSelectedGroupName(grp.name);
//                             setView("group_details");
//                           }}
//                           className="flex items-center justify-center gap-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer border border-slate-100"
//                         >
//                           Configure
//                         </button>
//                         <button
//                           onClick={() => {
//                             setSelectedGroupId(grp.id);
//                             setSelectedGroupName(grp.name);
//                             setView("reports");
//                           }}
//                           className="flex items-center justify-center gap-1.5 px-3 py-2 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer shadow-sm shadow-navy/10"
//                         >
//                           <FileBarChart className="h-3.5 w-3.5" /> Reports
//                         </button>
//                       </div>
//                     </motion.div>
//                   ))}
//                 </div>
//               ) : (
//                 <div className="text-center py-20 max-w-md mx-auto">
//                   <div className="mx-auto w-16 h-16 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 mb-5">
//                     <FolderHeart className="h-8 w-8 text-navy/80" />
//                   </div>
//                   <h3 className="text-base font-bold text-slate-900 font-sans">No Groups Active</h3>
//                   <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
//                     Create your very first attendance tracking group to start registering participants and scheduling QR codes.
//                   </p>
//                   <button
//                     onClick={() => setShowCreateModal(true)}
//                     className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs mt-5 cursor-pointer shadow-sm shadow-navy/10"
//                   >
//                     <Plus className="h-4 w-4" /> Create Now
//                   </button>
//                 </div>
//               )}
//             </motion.main>
//           )}

//           {/* VIEW: GROUP SETUP & DETAILS */}
//           {view === "group_details" && selectedGroupId && (
//             <motion.div
//               key="group_details"
//               initial={{ opacity: 0, x: 10 }}
//               animate={{ opacity: 1, x: 0 }}
//               exit={{ opacity: 0, x: -10 }}
//             >
//               <GroupDetails 
//                 groupId={selectedGroupId} 
//                 onBack={() => { setView("dashboard"); setSelectedGroupId(null); }}
//                 onViewReports={() => setView("reports")}
//               />
//             </motion.div>
//           )}

//           {/* VIEW: ANALYTICS & REPORTS */}
//           {view === "reports" && selectedGroupId && (
//             <motion.div
//               key="reports"
//               initial={{ opacity: 0, x: 10 }}
//               animate={{ opacity: 1, x: 0 }}
//               exit={{ opacity: 0, x: -10 }}
//             >
//               <ReportsPanel 
//                 groupId={selectedGroupId}
//                 groupName={selectedGroupName}
//                 onBack={() => setView("group_details")}
//               />
//             </motion.div>
//           )}

//         </AnimatePresence>
//       </div>

//       {/* MODAL: CREATE GROUP */}
//       <AnimatePresence>
//         {showCreateModal && (
//           <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
//             <motion.div
//               initial={{ opacity: 0, scale: 0.95, y: 10 }}
//               animate={{ opacity: 1, scale: 1, y: 0 }}
//               exit={{ opacity: 0, scale: 0.95, y: 10 }}
//               className="bg-white border border-slate-100 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-left"
//             >
//               <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2 mb-2 font-sans">
//                 <Sparkles className="h-5 w-5 text-navy animate-pulse" />
//                 Create Attendance Group
//               </h2>
//               <p className="text-xs text-slate-400 mb-6 font-sans leading-relaxed">
//                 Groups represent sections, events, or classes. Add schedules and participants once created.
//               </p>

//               <form onSubmit={handleCreateGroup} className="space-y-4">
//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Group Title</label>
//                   <input
//                     type="text"
//                     required
//                     placeholder="e.g. Algorithms & Complexity 301"
//                     value={newGroupName}
//                     onChange={(e) => setNewGroupName(e.target.value)}
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>

//                 <div>
//                   <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
//                   <textarea
//                     rows={3}
//                     placeholder="Provide simple instructions or class details here..."
//                     value={newGroupDesc}
//                     onChange={(e) => setNewGroupDesc(e.target.value)}
//                     className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy text-slate-800"
//                   />
//                 </div>

//                 {createError && (
//                   <div className="p-3 bg-navy/8 border border-navy/15 text-navy text-xs rounded-xl font-medium">
//                     {createError}
//                   </div>
//                 )}

//                 <div className="flex gap-2.5 pt-4">
//                   <button
//                     type="button"
//                     onClick={() => setShowCreateModal(false)}
//                     className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-center"
//                   >
//                     Cancel
//                   </button>
//                   <button
//                     type="submit"
//                     disabled={createLoading}
//                     className="flex-1 bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer text-center"
//                   >
//                     {createLoading ? "Creating..." : "Create Group"}
//                   </button>
//                 </div>
//               </form>
//             </motion.div>
//           </div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }
