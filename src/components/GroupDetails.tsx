import React, { useState, useEffect } from "react";
import { 
  Calendar, Clock, UserPlus, Trash2, QrCode, Copy, Printer, Play, Square, RefreshCw, ChevronLeft, Eye, HelpCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Group, Schedule, Participant } from "../types";

interface GroupDetailsProps {
  groupId: string;
  onBack: () => void;
  onViewReports: () => void;
}

export default function GroupDetails({ groupId, onBack, onViewReports }: GroupDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [qrCodeData, setQrCodeData] = useState<{ qrCodeUrl: string; checkinUrl: string } | null>(null);
  const [activeSession, setActiveSession] = useState<any | null>(null);

  // Forms
  const [schedDay, setSchedDay] = useState("Monday");
  const [schedStart, setSchedStart] = useState("09:00");
  const [schedEnd, setSchedEnd] = useState("10:00");

  const [partId, setPartId] = useState("");
  const [partName, setPartName] = useState("");
  const [partEmail, setPartEmail] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [schedLogs, setSchedLogs] = useState<string[]>([]);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);

  // 1. Fetch Group data, participants, QR code, and active session
  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // A) Fetch Group + Participants
      const detailsRes = await fetch(`/api/groups/${groupId}/details`, { credentials: "include" });
      const detailsData = await detailsRes.json();
      if (detailsRes.ok) {
        setGroup(detailsData.group as Group);
        setParticipants(detailsData.participants as Participant[]);
      } else {
        setErrorMsg(detailsData.error || "Group not found.");
        return;
      }

      // C) Fetch QR Code and absolute checkin link
      const qrRes = await fetch(`/api/groups/${groupId}/qrcode`);
      const qrData = await qrRes.json();
      if (qrRes.ok) {
        setQrCodeData(qrData);
      }

      // D) Fetch Active Session Status
      const sessRes = await fetch(`/api/groups/${groupId}/active-session`);
      const sessData = await sessRes.json();
      if (sessRes.ok && sessData.hasActiveSession) {
        setActiveSession(sessData.session);
      } else {
        setActiveSession(null);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to load group details: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  // Live countdown against the session's real expiresAt instant (not the
  // display-only start/end clock strings). Auto-refreshes group state the
  // moment it actually expires instead of waiting on a manual reload.
  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setMsRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(activeSession.expiresAt).getTime() - Date.now();
      setMsRemaining(remaining);
      if (remaining <= 0) {
        fetchData();
      }
    };
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [activeSession?.expiresAt]);

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  // 2. Add Schedule
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;
    setErrorMsg(null);

    // Validate times
    if (schedStart >= schedEnd) {
      setErrorMsg("Start time must be strictly earlier than End time.");
      return;
    }

    const currentSchedules = group.schedules || [];
    // Check for duplicate schedules on the same day
    const duplicate = currentSchedules.some(s => 
      s.dayOfWeek === schedDay && 
      ((schedStart >= s.startTime && schedStart < s.endTime) || 
       (schedEnd > s.startTime && schedEnd <= s.endTime))
    );

    if (duplicate) {
      setErrorMsg(`There is already a conflicting schedule slot on ${schedDay}.`);
      return;
    }

    const newSched: Schedule = {
      dayOfWeek: schedDay,
      startTime: schedStart,
      endTime: schedEnd
    };

    const updatedSchedules = [...currentSchedules, newSched];

    try {
      const res = await fetch(`/api/groups/${groupId}/schedules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schedules: updatedSchedules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add schedule.");
      setGroup({ ...group, schedules: updatedSchedules });
    } catch (err: any) {
      setErrorMsg("Failed to add schedule: " + err.message);
    }
  };

  // 3. Remove Schedule
  const handleRemoveSchedule = async (index: number) => {
    if (!group) return;
    setErrorMsg(null);

    const currentSchedules = group.schedules || [];
    const updatedSchedules = currentSchedules.filter((_, i) => i !== index);

    try {
      const res = await fetch(`/api/groups/${groupId}/schedules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schedules: updatedSchedules }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove schedule.");
      setGroup({ ...group, schedules: updatedSchedules });
    } catch (err: any) {
      setErrorMsg("Failed to remove schedule: " + err.message);
    }
  };

  // 4. Register Participant
  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const sId = partId.trim().toUpperCase();
    const name = partName.trim();
    const email = partEmail.trim();

    if (!sId || !name) {
      setErrorMsg("Student ID and Full Name are required.");
      return;
    }

    // Check client-side duplicates
    const isDup = participants.some(p => p.studentId === sId);
    if (isDup) {
      setErrorMsg(`Participant with Student ID "${sId}" is already registered.`);
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentId: sId, name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register participant.");

      setParticipants([...participants, data.participant]);

      // Reset form
      setPartId("");
      setPartName("");
      setPartEmail("");
    } catch (err: any) {
      setErrorMsg("Failed to register participant: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Remove Participant
  const handleRemoveParticipant = async (id: string, sId: string) => {
    if (!window.confirm(`Are you sure you want to remove participant "${sId}"?`)) return;
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/groups/${groupId}/participants/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove participant.");
      setParticipants(participants.filter(p => p.id !== id));
    } catch (err: any) {
      setErrorMsg("Failed to remove participant: " + err.message);
    }
  };

  // 6. Manual override: Start manual session immediately
  const handleForceStartSession = async () => {
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/sessions/force-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, durationMinutes: 30 })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSession(data.session);
      } else {
        setErrorMsg(data.error || "Failed to start session.");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server.");
    } finally {
      setActionLoading(false);
    }
  };

  // 7. Manual override: Force close active session
  const handleForceCloseSession = async () => {
    if (!activeSession) return;
    if (!window.confirm("Are you sure you want to close this session? Absentees will be marked and reports compiled immediately.")) return;

    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/sessions/force-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSession.id })
      });
      if (res.ok) {
        setActiveSession(null);
        alert("Session successfully closed and reports compiled!");
      } else {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to close session.");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server.");
    } finally {
      setActionLoading(false);
    }
  };

  // 8. Manual override: Trigger automatic background scheduler check
  const handleTriggerScheduler = async () => {
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/scheduler/trigger", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSchedLogs(data.log);
        // Refresh active session status in case scheduler triggered something for us!
        const sessRes = await fetch(`/api/groups/${groupId}/active-session`);
        const sessData = await sessRes.json();
        if (sessRes.ok && sessData.hasActiveSession) {
          setActiveSession(sessData.session);
        } else {
          setActiveSession(null);
        }
      } else {
        setErrorMsg(data.error || "Scheduler trigger failed.");
      }
    } catch (err) {
      setErrorMsg("Failed to contact scheduler backend.");
    } finally {
      setActionLoading(false);
    }
  };

  // Utility copy
  const handleCopyLink = () => {
    if (qrCodeData?.checkinUrl) {
      navigator.clipboard.writeText(qrCodeData.checkinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Print QR code directly
  const handlePrintQR = () => {
    if (!qrCodeData) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code - ${group?.name}</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: white; color: #1e293b; }
              .card { border: 2px solid #e2e8f0; border-radius: 24px; padding: 40px; text-align: center; max-width: 400px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
              img { width: 250px; height: 250px; margin-bottom: 20px; }
              h1 { font-size: 24px; margin: 0 0 10px 0; color: #0f172a; }
              p { font-size: 14px; margin: 0 0 20px 0; color: #64748b; line-height: 1.5; }
              .url { font-family: monospace; font-size: 11px; background-color: #f1f5f9; padding: 8px 12px; border-radius: 8px; word-break: break-all; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${group?.name}</h1>
              <p>${group?.description || "Scan to check-in your attendance"}</p>
              <img src="${qrCodeData.qrCodeUrl}" />
              <div class="url">${qrCodeData.checkinUrl}</div>
            </div>
            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
        <p className="text-sm text-slate-500 font-sans">Loading group configuration...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-left">
      {/* Navigation and Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-8">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy transition-colors cursor-pointer mb-2"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
            {group?.name}
          </h1>
          <p className="text-sm text-slate-500 font-sans max-w-2xl mt-1">
            {group?.description || "No description provided for this group."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onViewReports}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-navy/8 hover:bg-navy/12 text-navy font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            <Eye className="h-4 w-4" /> View Attendance & Reports
          </button>
          
          <button
            onClick={fetchData}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 cursor-pointer transition-colors"
            title="Refresh Group Info"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-navy/8 border border-navy/15 text-sm text-navy rounded-2xl flex items-start gap-3">
          <svg className="h-5 w-5 text-navy/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Active Session Warning Banner */}
      {activeSession && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-4 bg-gold/10 border border-gold/10 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm shadow-gold/10"
        >
          <div className="flex items-start gap-3">
            <div className="h-3 w-3 bg-gold rounded-full animate-ping mt-1.5" />
            <div>
              <h3 className="text-sm font-bold text-gold font-sans">Active Check-In Session is Live</h3>
              <p className="text-xs text-gold mt-0.5">
                Session is open today (<span className="font-semibold">{activeSession.date}</span>) from <span className="font-semibold">{activeSession.startTime}</span> to <span className="font-semibold">{activeSession.endTime}</span>.
                {msRemaining !== null && msRemaining > 0 && (
                  <> Closes in <span className="font-semibold font-mono">{formatCountdown(msRemaining)}</span>.</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={handleForceCloseSession}
            disabled={actionLoading}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-navy hover:bg-navy/90 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5" /> Close Session & Mark Absent
          </button>
        </motion.div>
      )}

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns - Configuration */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Schedules Section */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4 font-sans">
              <Calendar className="h-5 w-5 text-navy" />
              Configure Schedule Slots
            </h2>
            <p className="text-xs text-slate-400 mb-5 max-w-lg leading-relaxed">
              Define the recurring times when your attendance sessions should run. The background scheduler will automatically launch active check-in sessions at these times.
            </p>

            {/* Existing Schedules list */}
            <div className="space-y-2.5 mb-6">
              {group?.schedules && group.schedules.length > 0 ? (
                group.schedules.map((s, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-navy bg-navy/8 px-2.5 py-1 rounded-lg">
                        {s.dayOfWeek}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-slate-600 font-medium font-mono">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{s.startTime} - {s.endTime}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveSchedule(idx)}
                      className="p-1.5 hover:bg-navy/8 text-slate-400 hover:text-navy/80 rounded-lg transition-colors cursor-pointer"
                      title="Remove schedule slot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 font-sans">
                  No automatic schedules configured. This group will rely entirely on manual session activations below.
                </div>
              )}
            </div>

            {/* Add Schedule Form */}
            <form onSubmit={handleAddSchedule} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Day of Week</label>
                <select
                  value={schedDay}
                  onChange={(e) => setSchedDay(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy text-slate-800"
                >
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Time</label>
                <input
                  type="time"
                  value={schedStart}
                  onChange={(e) => setSchedStart(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy font-mono text-slate-800"
                />
              </div>

              <div className="flex items-end">
                <div className="w-full">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Time</label>
                  <input
                    type="time"
                    value={schedEnd}
                    onChange={(e) => setSchedEnd(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy font-mono text-slate-800"
                  />
                </div>
              </div>

              <div className="sm:col-span-4 mt-2">
                <button
                  type="submit"
                  className="w-full bg-navy hover:bg-navy/90 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Add Schedule Slot
                </button>
              </div>
            </form>
          </div>

          {/* Participants Registration Panel */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4 font-sans">
              <UserPlus className="h-5 w-5 text-navy" />
              Register Participants ({participants.length})
            </h2>
            <p className="text-xs text-slate-400 mb-5 max-w-lg leading-relaxed">
              Register students or members who are allowed to check in to this group. Anyone scanning the QR code must have their ID pre-registered here.
            </p>

            {/* Registration Form */}
            <form onSubmit={handleAddParticipant} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Student / Participant ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU1001"
                  value={partId}
                  onChange={(e) => setPartId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy uppercase font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="john@example.com"
                  value={partEmail}
                  onChange={(e) => setPartEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy text-slate-800"
                />
              </div>

              <div className="sm:col-span-3 mt-1.5">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Register Participant
                </button>
              </div>
            </form>

            {/* Participants list table */}
            <div className="overflow-x-auto">
              {participants.length > 0 ? (
                <table className="min-w-full divide-y divide-slate-100">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left bg-slate-50">
                      <th className="px-4 py-2.5 rounded-l-xl">ID</th>
                      <th className="px-4 py-2.5">Name</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5 rounded-r-xl text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                    {participants.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono font-semibold text-navy">{p.studentId}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                        <td className="px-4 py-3 text-slate-500">{p.email || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleRemoveParticipant(p.id!, p.studentId)}
                            className="p-1 text-slate-400 hover:text-navy/80 rounded-lg hover:bg-navy/8 transition-colors cursor-pointer"
                            title="Unregister participant"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  No participants registered yet. Use the form above to add members.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - QR Code and Overrides */}
        <div className="space-y-8">
          
          {/* QR Code Presentation */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-navy" />
            
            <h2 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5 mb-2 font-sans">
              <QrCode className="h-5 w-5 text-navy" />
              Permanent Group QR Code
            </h2>
            <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">
              This QR code remains permanent for this group. Students can scan it at any time to open the secure browser check-in page.
            </p>

            {qrCodeData ? (
              <div className="space-y-5">
                {/* QR Display */}
                <div className="inline-block p-3 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm">
                  <img 
                    src={qrCodeData.qrCodeUrl} 
                    alt="Group QR Code" 
                    className="w-44 h-44 object-contain mx-auto" 
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* URL Display */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[10px] text-slate-500 font-mono break-all text-center max-w-xs mx-auto">
                  {qrCodeData.checkinUrl}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied!" : "Copy Link"}
                  </button>
                  <button
                    onClick={handlePrintQR}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-xs text-slate-400">
                Generating QR code...
              </div>
            )}
          </div>

          {/* Test and Override Utilities */}
          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 font-sans border-b border-slate-50 pb-2.5">
              <HelpCircle className="h-4.5 w-4.5 text-slate-400" />
              Testing & Override Tools
            </h2>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Use these shortcuts to bypass waiting on automatic calendar triggers. Perfect for grading and real-time live demonstrations.
            </p>

            <div className="space-y-2.5">
              {/* Force Start */}
              <button
                onClick={handleForceStartSession}
                disabled={actionLoading || !!activeSession}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gold/10 hover:bg-gold/12 text-gold disabled:opacity-40 rounded-xl text-xs font-semibold border border-gold/50 transition-colors cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-gold" />
                  Force Start 30-Min Session
                </span>
                <span className="text-[9px] uppercase tracking-wider bg-gold/12 px-1.5 py-0.5 rounded text-gold">Go</span>
              </button>

              {/* Manual Scheduler Sync */}
              <button
                onClick={handleTriggerScheduler}
                disabled={actionLoading}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-navy/8 hover:bg-navy/12 text-navy rounded-xl text-xs font-semibold border border-navy/50 transition-colors cursor-pointer text-left"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-navy" />
                  Trigger Scheduler Sync Now
                </span>
                <span className="text-[9px] uppercase tracking-wider bg-navy/12 px-1.5 py-0.5 rounded text-navy">Sync</span>
              </button>
            </div>

            {/* Scheduler execution logs */}
            {schedLogs.length > 0 && (
              <div className="bg-slate-950 border border-slate-900 text-[10px] rounded-xl p-3 max-h-40 overflow-y-auto text-left font-mono">
                <p className="text-navy/60 font-bold border-b border-slate-800 pb-1 mb-1.5">Last Sync Audit Logs:</p>
                {schedLogs.map((log, lIdx) => (
                  <p key={lIdx} className="text-slate-300 leading-normal mb-1">
                    {log}
                  </p>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
