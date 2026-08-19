import React, { useState, useEffect } from "react";
import { 
  Calendar, Clock, UserPlus, Trash2, QrCode, Copy, Printer, Play, Square, RefreshCw, ChevronLeft, Eye, HelpCircle, Upload, FileSpreadsheet 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Group, Schedule, Participant } from "../types";

interface GroupDetailsProps {
  groupId: string;
  onBack: () => void;
  onViewReports: () => void;
}

export default function GroupDetails({ groupId, onBack, onViewReports }: GroupDetailsProps) {
  // Section-level loading so QR / session can appear before the roster does.
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [qrLoading, setQrLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
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

  // Bulk CSV import
  const [bulkPreview, setBulkPreview] = useState<Array<{ studentId: string; name: string; email: string }>>([]);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [schedLogs, setSchedLogs] = useState<string[]>([]);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Each endpoint is independent — update state as each response arrives so
  // the QR and session banner are not blocked by a slow participant list.
  const fetchDetails = async () => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/details`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setGroup(data.group as Group);
        setParticipants(data.participants as Participant[]);
        setErrorMsg(null);
      } else {
        setErrorMsg(data.error || "Group not found.");
        setGroup(null);
        setParticipants([]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to load group details: " + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const fetchQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/qrcode`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setQrCodeData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQrLoading(false);
    }
  };

  const fetchSession = async () => {
    setSessionLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/active-session`);
      const data = await res.json();
      if (res.ok && data.hasActiveSession) {
        setActiveSession(data.session);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSessionLoading(false);
    }
  };

  const fetchData = () => {
    // Fire all three in parallel; each updates its own section when done.
    fetchDetails();
    fetchQr();
    fetchSession();
  };

  useEffect(() => {
    fetchData();
  }, [groupId]);

  // Live countdown against the session's real expiresAt instant (not the
  // display-only start/end clock strings). Only re-check session status when
  // it expires — no need to reload QR or the full roster.
  useEffect(() => {
    if (!activeSession?.expiresAt) {
      setMsRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(activeSession.expiresAt).getTime() - Date.now();
      setMsRemaining(remaining);
      if (remaining <= 0) {
        fetchSession();
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

    // Overnight slots (end <= start) are allowed — the server rolls end to the next day.
    const currentSchedules = group.schedules || [];
    const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
      // Same-day only; overnight handled separately below
      if (aEnd <= aStart || bEnd <= bStart) return false;
      return aStart < bEnd && aEnd > bStart;
    };
    const duplicate = currentSchedules.some((s) => {
      if (s.dayOfWeek !== schedDay) return false;
      // Exact same start = duplicate
      if (s.startTime === schedStart && s.endTime === schedEnd) return true;
      return overlaps(schedStart, schedEnd, s.startTime, s.endTime);
    });

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

  /** Minimal CSV line splitter that respects double-quoted fields. */
  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const handleBulkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBulkResult(null);
    setErrorMsg(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      setErrorMsg("Please upload a .csv file.");
      return;
    }

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 2) {
        setErrorMsg("CSV must have a header row and at least one data row.");
        return;
      }

      const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const idIdx = headerCells.findIndex((h) =>
        ["student_id", "studentid", "id", "participant_id", "index_number", "index_no"].includes(h)
      );
      const nameIdx = headerCells.findIndex((h) =>
        ["name", "full_name", "fullname", "student_name"].includes(h)
      );
      const emailIdx = headerCells.findIndex((h) =>
        ["email", "e-mail", "mail"].includes(h)
      );

      if (idIdx < 0 || nameIdx < 0) {
        setErrorMsg(
          'CSV header must include a student ID column (e.g. student_id or id) and a name column (e.g. name or full_name).'
        );
        return;
      }

      const parsed: Array<{ studentId: string; name: string; email: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const studentId = (cells[idIdx] || "").trim().toUpperCase();
        const name = (cells[nameIdx] || "").trim();
        const email = emailIdx >= 0 ? (cells[emailIdx] || "").trim() : "";
        if (!studentId && !name) continue;
        parsed.push({ studentId, name, email });
      }

      if (parsed.length === 0) {
        setErrorMsg("No data rows found in the CSV.");
        return;
      }
      if (parsed.length > 500) {
        setErrorMsg("Maximum 500 rows per import. Split the file and try again.");
        return;
      }

      setBulkPreview(parsed);
      setBulkFileName(file.name);
    } catch (err: any) {
      setErrorMsg("Could not read CSV: " + (err.message || "unknown error"));
    }
  };

  const handleBulkImport = async () => {
    if (bulkPreview.length === 0) return;
    setBulkImporting(true);
    setBulkResult(null);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/participants/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participants: bulkPreview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk import failed.");

      if (Array.isArray(data.participants) && data.participants.length > 0) {
        setParticipants((prev) => [...prev, ...data.participants]);
      }

      const parts = [
        `Added ${data.added ?? 0}`,
        data.skipped ? `skipped ${data.skipped}` : null,
        data.errors ? `errors ${data.errors}` : null,
      ].filter(Boolean);
      setBulkResult(parts.join(", ") + ".");
      setBulkPreview([]);
      setBulkFileName(null);
    } catch (err: any) {
      setErrorMsg("Bulk import failed: " + err.message);
    } finally {
      setBulkImporting(false);
    }
  };

  const clearBulkPreview = () => {
    setBulkPreview([]);
    setBulkFileName(null);
    setBulkResult(null);
  };

  // 6. Manual override: Start manual session immediately
  const handleForceStartSession = async () => {
    setErrorMsg(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/sessions/force-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        credentials: "include",
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
      const res = await fetch("/api/scheduler/trigger", {
        method: "POST",
        credentials: "include",
      });
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

  // Permanently deletes this group and everything under it (roster,
  // schedule, sessions, check-ins, reports). Irreversible - confirmed via
  // the two-step UI below before this ever fires.
  const handleDeleteGroup = async () => {
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete group.");
      }
      onBack();
    } catch (err: any) {
      setErrorMsg(err.message);
      setDeleting(false);
      setConfirmingDelete(false);
      setDeleteConfirmText("");
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

  // Only block the whole page if details failed and we have nothing to show.
  // Otherwise render the shell immediately so QR / session can paint early.
  if (!detailsLoading && !group && errorMsg) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 text-left">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy transition-colors cursor-pointer mb-4"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <div className="p-4 bg-navy/8 border border-navy/15 text-sm text-navy rounded-2xl">
          {errorMsg}
        </div>
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
          {detailsLoading && !group ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-7 w-48 bg-slate-200 rounded-lg" />
              <div className="h-4 w-72 bg-slate-100 rounded-lg" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
                {group?.name}
              </h1>
              <p className="text-sm text-slate-500 font-sans max-w-2xl mt-1">
                {group?.description || "No description provided for this group."}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onViewReports}
            disabled={!group}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-navy/8 hover:bg-navy/12 text-navy font-semibold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Eye className="h-4 w-4" /> View Attendance & Reports
          </button>
          
          <button
            onClick={fetchData}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 cursor-pointer transition-colors"
            title="Refresh Group Info"
          >
            <RefreshCw className={`h-4 w-4 ${detailsLoading || qrLoading || sessionLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={!group}
            className="p-2 border border-red-200 hover:bg-red-50 rounded-xl text-red-500 cursor-pointer transition-colors disabled:opacity-50"
            title="Delete Group"
          >
            <Trash2 className="h-4 w-4" />
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
              Define recurring times when sessions should run. Overnight slots (end time earlier than start) are allowed and roll into the next day.
            </p>

            {/* Existing Schedules list */}
            <div className="space-y-2.5 mb-6">
              {detailsLoading && !group ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-12 bg-slate-100 rounded-2xl" />
                  <div className="h-12 bg-slate-50 rounded-2xl" />
                </div>
              ) : group?.schedules && group.schedules.length > 0 ? (
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
            <form onSubmit={handleAddSchedule} className={`grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-100 p-4 rounded-2xl ${!group ? "opacity-50 pointer-events-none" : ""}`}>
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
              Register Participants {detailsLoading && !group ? "" : `(${participants.length})`}
            </h2>
            <p className="text-xs text-slate-400 mb-5 max-w-lg leading-relaxed">
              Register students or members who are allowed to check in to this group. Anyone scanning the QR code must have their ID pre-registered here.
            </p>

            {/* Registration Form */}
            <form onSubmit={handleAddParticipant} className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-slate-50 border border-slate-100 p-4 rounded-2xl ${!group ? "opacity-50 pointer-events-none" : ""}`}>
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

            {/* Bulk CSV import */}
            <div className={`mb-6 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/50 ${!group ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-start gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-navy mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Bulk import from CSV</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Header required. Columns: <span className="font-mono text-slate-500">student_id</span> (or id),{" "}
                      <span className="font-mono text-slate-500">name</span> (or full_name), optional{" "}
                      <span className="font-mono text-slate-500">email</span>. Max 500 rows.
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-navy/30 hover:bg-navy/5 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer shrink-0">
                  <Upload className="h-3.5 w-3.5" />
                  Choose CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleBulkFile}
                  />
                </label>
              </div>

              {bulkFileName && bulkPreview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      <span className="font-semibold text-slate-700">{bulkFileName}</span>
                      {" — "}
                      {bulkPreview.length} row{bulkPreview.length === 1 ? "" : "s"} ready
                    </span>
                    <button
                      type="button"
                      onClick={clearBulkPreview}
                      className="text-slate-400 hover:text-navy font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 bg-white">
                    <table className="min-w-full text-[11px]">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left">
                          <th className="px-3 py-1.5">ID</th>
                          <th className="px-3 py-1.5">Name</th>
                          <th className="px-3 py-1.5">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-slate-700">
                        {bulkPreview.slice(0, 20).map((row, i) => (
                          <tr key={`${row.studentId}-${i}`}>
                            <td className="px-3 py-1.5 font-mono font-semibold text-navy">{row.studentId || "—"}</td>
                            <td className="px-3 py-1.5">{row.name || "—"}</td>
                            <td className="px-3 py-1.5 text-slate-500">{row.email || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkPreview.length > 20 && (
                      <p className="text-[10px] text-slate-400 px-3 py-1.5 border-t border-slate-50">
                        …and {bulkPreview.length - 20} more
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={bulkImporting}
                    onClick={handleBulkImport}
                    className="w-full bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {bulkImporting ? "Importing…" : `Import ${bulkPreview.length} participant${bulkPreview.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}

              {bulkResult && (
                <p className="mt-3 text-xs text-gold font-semibold bg-gold/10 border border-gold/20 rounded-xl px-3 py-2">
                  {bulkResult}
                </p>
              )}
            </div>

            {/* Participants list table */}
            <div className="overflow-x-auto">
              {detailsLoading && !group ? (
                <div className="space-y-2 animate-pulse py-2">
                  <div className="h-10 bg-slate-100 rounded-xl" />
                  <div className="h-10 bg-slate-50 rounded-xl" />
                  <div className="h-10 bg-slate-100 rounded-xl" />
                </div>
              ) : participants.length > 0 ? (
                <>
                  <div className="mb-3">
                    <input
                      type="search"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder="Search by ID, name, or email…"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-navy text-slate-800"
                    />
                  </div>
                  {(() => {
                    const q = rosterSearch.trim().toLowerCase();
                    const filtered = q
                      ? participants.filter(
                          (p) =>
                            p.studentId.toLowerCase().includes(q) ||
                            p.name.toLowerCase().includes(q) ||
                            (p.email || "").toLowerCase().includes(q)
                        )
                      : participants;
                    if (filtered.length === 0) {
                      return (
                        <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                          No participants match “{rosterSearch}”.
                        </div>
                      );
                    }
                    return (
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
                          {filtered.map((p) => (
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
                    );
                  })()}
                  {rosterSearch.trim() && (
                    <p className="mt-2 text-[10px] text-slate-400">
                      Showing filtered results of {participants.length} total
                    </p>
                  )}
                </>
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
              <div className="py-10 flex flex-col items-center gap-2 text-xs text-slate-400">
                {qrLoading ? (
                  <>
                    <RefreshCw className="h-6 w-6 text-navy animate-spin" />
                    <span>Generating QR code...</span>
                  </>
                ) : (
                  <span>QR code unavailable. Try refreshing.</span>
                )}
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

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => {
              if (!deleting) {
                setConfirmingDelete(false);
                setDeleteConfirmText("");
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 bg-red-50 rounded-xl">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Delete "{group?.name}"?</h3>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                This permanently deletes this group along with its entire roster, schedule, all past sessions, and all attendance records and reports. This cannot be undone.
              </p>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                Type <span className="font-bold text-slate-800">{group?.name}</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300"
                placeholder="Group name"
                autoFocus
              />
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteConfirmText("");
                  }}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGroup}
                  disabled={deleting || deleteConfirmText !== group?.name}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
