import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, Calendar, CheckCircle2, XCircle, ArrowLeft, RefreshCw, FileText, Download, Award, Search, X, FileDown
} from "lucide-react";
import { DailyReport, CumulativeReport } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { Alert, Button, EmptyState, Spinner } from "./ui";
import { useAuth } from "../lib/auth";
import {
  downloadDailyAttendancePdf,
  downloadCumulativeAttendancePdf,
} from "../lib/academicReportPdf";

interface ReportsPanelProps {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  onBack: () => void;
}

export default function ReportsPanel({
  groupId,
  groupName,
  groupDescription = "",
  onBack,
}: ReportsPanelProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [cumulativeReport, setCumulativeReport] = useState<CumulativeReport | null>(null);
  const [activeTab, setActiveTab] = useState<"daily" | "cumulative">("daily");
  const [selectedDailyReport, setSelectedDailyReport] = useState<DailyReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  /** Draft in the input; applied query filters the tables. */
  const [studentIdDraft, setStudentIdDraft] = useState("");
  const [studentIdQuery, setStudentIdQuery] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  const normalizeId = (id: string) => id.trim().toUpperCase();

  const facilitatorName = user?.fullName || user?.email || "Facilitator";

  const handleDownloadDailyPdf = async () => {
    if (!selectedDailyReport) return;
    setPdfLoading(true);
    setErrorMsg(null);
    try {
      const rows = studentIdQuery ? filteredDailyRecords : selectedDailyReport.records;
      await downloadDailyAttendancePdf({
        meta: {
          groupName: groupName || "Attendance Group",
          groupDescription,
          reportDate: selectedDailyReport.date,
          facilitatorName,
          facilitatorEmail: user?.email,
          generatedAt: new Date(),
        },
        stats: selectedDailyReport.stats,
        records: rows,
        sessionId: selectedDailyReport.sessionId,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Failed to generate PDF. Ensure jspdf is installed (npm install).");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadCumulativePdf = async () => {
    if (!cumulativeReport) return;
    setPdfLoading(true);
    setErrorMsg(null);
    try {
      const rows = studentIdQuery ? filteredCumulativeRecords : cumulativeReport.records;
      await downloadCumulativeAttendancePdf({
        meta: {
          groupName: groupName || "Attendance Group",
          groupDescription,
          reportDate: new Date().toISOString().slice(0, 10),
          facilitatorName,
          facilitatorEmail: user?.email,
          generatedAt: new Date(),
        },
        stats: cumulativeReport.stats,
        records: rows,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Failed to generate PDF. Ensure jspdf is installed (npm install).");
    } finally {
      setPdfLoading(false);
    }
  };

  const applyStudentSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setStudentIdQuery(normalizeId(studentIdDraft));
  };

  const clearStudentSearch = () => {
    setStudentIdDraft("");
    setStudentIdQuery("");
  };

  const filteredDailyRecords = useMemo(() => {
    if (!selectedDailyReport) return [];
    const q = studentIdQuery;
    if (!q) return selectedDailyReport.records;
    return selectedDailyReport.records.filter(
      (r) =>
        normalizeId(r.studentId).includes(q) ||
        (r.name || "").toLowerCase().includes(q.toLowerCase())
    );
  }, [selectedDailyReport, studentIdQuery]);

  const filteredCumulativeRecords = useMemo(() => {
    if (!cumulativeReport) return [];
    const q = studentIdQuery;
    if (!q) return cumulativeReport.records;
    return cumulativeReport.records.filter(
      (r) =>
        normalizeId(r.studentId).includes(q) ||
        (r.name || "").toLowerCase().includes(q.toLowerCase())
    );
  }, [cumulativeReport, studentIdQuery]);

  const fetchReports = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // photos=1 loads historical check-in images (heavier). Omit for a lighter payload.
      const res = await fetch(`/api/reports/${groupId}?photos=1`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        const daily = data.daily || [];
        setDailyReports(daily);
        setCumulativeReport(data.cumulative || null);
        
        // Auto-select latest daily report if none selected yet, or update selectedDailyReport if it's currently showing
        if (daily.length > 0) {
          if (!selectedDailyReport) {
            setSelectedDailyReport(daily[0]);
          } else {
            // Find and bind to the updated version of the current selected report
            const updated = daily.find((r: any) => r.id === selectedDailyReport.id);
            if (updated) {
              setSelectedDailyReport(updated);
            } else {
              setSelectedDailyReport(daily[0]);
            }
          }
        } else {
          setSelectedDailyReport(null);
        }
      } else {
        setErrorMsg(data.error || "Failed to load reports.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect to the backend reports server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [groupId]);

  const handleDownloadCSV = (report: DailyReport) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Student ID,Name,Email,Status,Check-in Time\n";
    
    report.records.forEach(r => {
      const timeStr = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "—";
      csvContent += `"${r.studentId}","${r.name}","${r.email || ""}","${r.status}","${timeStr}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${groupName.replace(/\s+/g, "_")}_${report.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCumulativeCSV = (report: CumulativeReport) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Student ID,Name,Email,Enrolled Sessions,Present,Absent,Attendance %\n";

    report.records.forEach((rec) => {
      const totalSess = rec.presentCount + rec.absentCount;
      csvContent += `"${rec.studentId}","${rec.name}","${rec.email || ""}","${totalSess}","${rec.presentCount}","${rec.absentCount}","${rec.percentage}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cumulative_report_${groupName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPercentageColor = (pct: number) => {
    if (pct >= 85) return "text-gold bg-gold/10 border-gold/20";
    if (pct >= 65) return "text-navy bg-navy/8 border-navy/15";
    return "text-navy bg-navy/12 border-navy/25";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-left">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-8">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy transition-colors cursor-pointer mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Group Setup
          </button>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
            {groupName} — Analytics Workspace
          </h1>
          <p className="text-sm text-slate-500 font-sans mt-1">
            Browse daily check-in histories, verify verification photos, and view cumulative stats.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchReports}
          className="self-start md:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh Reports
        </Button>
      </div>

      {errorMsg && (
        <Alert variant="error" className="mb-6" onDismiss={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Search student attendance by ID */}
      <form
        onSubmit={applyStudentSearch}
        className="mb-6 flex flex-col sm:flex-row gap-2 sm:items-center"
      >
        <label htmlFor="student-id-search" className="sr-only">
          Search by student ID
        </label>
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
            aria-hidden
          />
          <input
            id="student-id-search"
            type="search"
            value={studentIdDraft}
            onChange={(e) => setStudentIdDraft(e.target.value)}
            placeholder="Search by student ID (e.g. STU1004)"
            className="w-full border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-mono uppercase tracking-wide text-slate-800 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:border-navy"
            autoComplete="off"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="md">
            <Search className="h-4 w-4" aria-hidden />
            Search
          </Button>
          {studentIdQuery && (
            <Button type="button" variant="secondary" size="md" onClick={clearStudentSearch}>
              <X className="h-4 w-4" aria-hidden />
              Clear
            </Button>
          )}
        </div>
        {studentIdQuery && (
          <p className="text-xs text-slate-500 sm:ml-1">
            Showing matches for{" "}
            <span className="font-mono font-semibold text-navy">{studentIdQuery}</span>
          </p>
        )}
      </form>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-100 mb-6">
        <button
          onClick={() => setActiveTab("daily")}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === "daily" 
              ? "border-navy text-navy" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Daily Session Reports ({dailyReports.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab("cumulative")}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === "cumulative" 
              ? "border-navy text-navy" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Cumulative Metrics
          </span>
        </button>
      </div>

      {loading ? (
        <Spinner label="Compiling report analytics…" size="lg" />
      ) : (
        <AnimatePresence mode="wait">
          
          {/* TAB 1: DAILY REPORTS */}
          {activeTab === "daily" && (
            <motion.div
              key="daily"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Daily Reports Card Selector List */}
              <div className="lg:col-span-1 space-y-3.5 max-h-[600px] overflow-y-auto pr-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Session Dates</h3>
                {dailyReports.length > 0 ? (
                  dailyReports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => setSelectedDailyReport(report)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        selectedDailyReport?.id === report.id
                          ? "bg-navy/5 border-navy/20 shadow-sm"
                          : "bg-white border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800">{report.date}</span>
                          {report.isLive && (
                            <>
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold/60 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
                              </span>
                              <span className="text-[9px] font-extrabold text-gold bg-gold/10 px-1 py-0.5 rounded uppercase tracking-wider">Live</span>
                            </>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPercentageColor(report.stats.percentage)}`}>
                          {report.stats.percentage}% Present
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className={`flex items-center gap-1 font-medium ${report.isLive ? "text-navy animate-pulse font-bold" : ""}`}>
                          {report.isLive ? <RefreshCw className="h-3 w-3 animate-spin text-navy/80" /> : <FileText className="h-3 w-3" />}
                          {report.isLive ? "In-Progress Check-In" : `Session ${report.sessionId.endsWith("_manual") ? "Manual" : "Auto"}`}
                        </span>
                        <span>{report.stats.present}/{report.stats.total} Checked-In</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState
                    title="No session reports yet"
                    description="Expired or forced sessions populate reports automatically."
                    icon={<FileText className="h-6 w-6" aria-hidden />}
                    className="bg-white border border-dashed border-slate-200 rounded-3xl"
                  />
                )}
              </div>

              {/* Detailed View of Selected Daily Report */}
              <div className="lg:col-span-2 space-y-6">
                {selectedDailyReport ? (
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6">
                                      {/* Detail Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900 font-sans flex items-center gap-2">
                            Session Report: {selectedDailyReport.date}
                          </h3>
                          {selectedDailyReport.isLive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 border border-gold/20 text-gold rounded-full text-[10px] font-extrabold animate-pulse uppercase tracking-wider">
                              Live
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          ID: {selectedDailyReport.sessionId}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={handleDownloadDailyPdf}
                          disabled={pdfLoading}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-navy hover:bg-navy/90 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          {pdfLoading ? "Preparing PDF…" : "Download PDF"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCSV(selectedDailyReport)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" /> CSV
                        </button>
                      </div>
                    </div>

                    {/* Live indicator alert banner */}
                    {selectedDailyReport.isLive && (
                      <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex items-start gap-3 text-xs text-navy">
                        <RefreshCw className="h-4 w-4 text-navy/80 animate-spin shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-navy">Active Session In-Progress</p>
                          <p className="text-slate-500 mt-0.5">Students are checking in live right now using their device cameras. Click the "Refresh Reports" button above to pull the latest photos and check-in times.</p>
                        </div>
                      </div>
                    )}

                    {/* Stats Summary Bento Block */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Enrolled</p>
                        <p className="text-xl font-bold text-slate-950 mt-1">{selectedDailyReport.stats.total}</p>
                      </div>
                      <div className="bg-gold/5 border border-gold/40 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-gold uppercase">Present</p>
                        <p className="text-xl font-bold text-gold mt-1">{selectedDailyReport.stats.present}</p>
                      </div>
                      <div className="bg-navy/5 border border-navy/20 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-navy uppercase">Absent</p>
                        <p className="text-xl font-bold text-navy mt-1">{selectedDailyReport.stats.absent}</p>
                      </div>
                      <div className="bg-navy/5 border border-navy/8 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-bold text-navy uppercase">Ratio %</p>
                        <p className="text-xl font-bold text-navy mt-1">{selectedDailyReport.stats.percentage}%</p>
                      </div>
                    </div>

                    {/* Attendance Records Table */}
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Attendance Register Log
                        </h4>
                        {studentIdQuery && (
                          <p className="text-xs text-slate-500">
                            {filteredDailyRecords.length} of {selectedDailyReport.records.length} shown
                          </p>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                          <thead>
                            <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left bg-slate-50">
                              <th className="px-4 py-2 rounded-l-lg">ID</th>
                              <th className="px-4 py-2">Name</th>
                              <th className="px-4 py-2">Status</th>
                              <th className="px-4 py-2">Timestamp</th>
                              <th className="px-4 py-2 rounded-r-lg">Photo Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                            {filteredDailyRecords.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                                  {studentIdQuery
                                    ? `No records match “${studentIdQuery}” in this session.`
                                    : "No attendance records for this session."}
                                </td>
                              </tr>
                            ) : (
                              filteredDailyRecords.map((r) => (
                              <tr key={r.studentId} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-mono font-semibold text-navy">{r.studentId}</td>
                                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                                <td className="px-4 py-3">
                                  {r.status === "present" ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold rounded-full text-[10px] font-bold">
                                      <CheckCircle2 className="h-3 w-3" /> Present
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-navy/8 text-navy rounded-full text-[10px] font-bold">
                                      <XCircle className="h-3 w-3" /> Absent
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-slate-500 font-mono">
                                  {r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {(r.photoUrl || r.photoBase64) ? (
                                    <button 
                                      onClick={() => setSelectedPhoto(r.photoUrl || r.photoBase64 || null)}
                                      className="relative group block cursor-zoom-in"
                                    >
                                      <img 
                                        src={r.photoUrl || r.photoBase64 || undefined} 
                                        alt="Verify camera capture" 
                                        className="h-9 w-12 rounded-lg object-cover border border-slate-200 group-hover:opacity-85 transition-opacity"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                        <span className="text-[8px] text-white font-bold bg-slate-900/80 px-1 py-0.5 rounded">View</span>
                                      </div>
                                    </button>
                                  ) : r.status === "present" ? (
                                    <span className="text-slate-400 italic text-xs" title={`Photos are automatically cleared after 24 hours to save storage.`}>
                                      Photo expired
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">—</span>
                                  )}
                                </td>
                              </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="h-64 bg-white border border-slate-100 rounded-3xl flex items-center justify-center text-xs text-slate-400 font-sans shadow-sm">
                    Select a session date from the sidebar to view full logs.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 2: CUMULATIVE METRICS */}
          {activeTab === "cumulative" && (
            <motion.div
              key="cumulative"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-6"
            >
              {cumulativeReport ? (
                <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-8">
                  
                  {/* Summary row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 font-sans">
                        Cumulative Performance Register
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Overarching student track performance compiled from all daily sessions.
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex gap-4">
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Sessions Analyzed</p>
                          <p className="text-lg font-extrabold text-navy mt-0.5">{cumulativeReport.stats.totalSessions}</p>
                        </div>
                        <div className="border-l border-slate-200" />
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Group Average</p>
                          <p className="text-lg font-extrabold text-gold mt-0.5">{cumulativeReport.stats.averageAttendancePercentage}%</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadCumulativePdf}
                        disabled={pdfLoading}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-navy hover:bg-navy/90 disabled:opacity-50 px-3 py-2 rounded-xl transition-colors cursor-pointer shrink-0"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        {pdfLoading ? "PDF…" : "Download PDF"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCumulativeCSV(cumulativeReport)}
                        className="flex items-center gap-1.5 text-xs font-bold text-navy bg-slate-50 hover:bg-slate-100 border border-slate-200/70 px-3 py-2 rounded-xl transition-colors cursor-pointer shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" /> CSV
                      </button>
                    </div>
                  </div>

                  {/* Complete Cumulative Table */}
                  <div className="space-y-2">
                    {studentIdQuery && (
                      <p className="text-xs text-slate-500">
                        {filteredCumulativeRecords.length} of {cumulativeReport.records.length} students shown
                      </p>
                    )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead>
                        <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left bg-slate-50">
                          <th className="px-4 py-3 rounded-l-lg">ID</th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Enrolled Sessions</th>
                          <th className="px-4 py-3">Present</th>
                          <th className="px-4 py-3">Absent</th>
                          <th className="px-4 py-3">Score %</th>
                          <th className="px-4 py-3 rounded-r-lg">Attendance Grid (Chronological)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                        {filteredCumulativeRecords.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                              {studentIdQuery
                                ? `No students match “${studentIdQuery}”.`
                                : "No cumulative records yet."}
                            </td>
                          </tr>
                        ) : (
                        filteredCumulativeRecords.map((rec) => {
                          const totalSess = rec.presentCount + rec.absentCount;
                          return (
                            <tr key={rec.studentId} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-mono font-semibold text-navy">{rec.studentId}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{rec.name}</td>
                              <td className="px-4 py-3 text-slate-500 font-medium">{totalSess}</td>
                              <td className="px-4 py-3 text-gold font-bold">{rec.presentCount}</td>
                              <td className="px-4 py-3 text-navy font-bold">{rec.absentCount}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] border ${getPercentageColor(rec.percentage)}`}>
                                  {rec.percentage}%
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {/* Chronological Contribution Mini Dot Grid */}
                                <div className="flex items-center gap-1 max-w-[200px] overflow-x-auto py-1">
                                  {rec.history && rec.history.length > 0 ? (
                                    rec.history.map((hist, hIdx) => (
                                      <div
                                        key={hIdx}
                                        className={`h-4.5 w-4.5 rounded-md flex-shrink-0 border transition-all ${
                                          hist.status === "present"
                                            ? "bg-gold border-gold shadow-sm shadow-gold/10"
                                            : "bg-navy border-navy shadow-sm shadow-navy/10"
                                        }`}
                                        title={`Date: ${hist.date} - ${hist.status === "present" ? "Present" : "Absent"}`}
                                      />
                                    ))
                                  ) : (
                                    <span className="text-slate-400 italic text-[11px]">No session participation</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                        )}
                      </tbody>
                    </table>
                  </div>
                  </div>

                </div>
              ) : (
                <EmptyState
                  title="No cumulative statistics yet"
                  description="Complete at least one active attendance session to display group metrics."
                  icon={<Award className="h-6 w-6" aria-hidden />}
                  className="bg-white border border-dashed border-slate-200 rounded-3xl"
                />
              )}
            </motion.div>
          )}

        </AnimatePresence>
      )}

      {/* Photo Preview Lightbox Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 cursor-zoom-out"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 p-2.5 rounded-3xl max-w-lg w-full overflow-hidden border border-slate-800"
            >
              <img 
                src={selectedPhoto} 
                alt="Full Verification Proof" 
                className="w-full h-auto aspect-[4/3] rounded-2xl object-cover" 
                referrerPolicy="no-referrer"
              />
              <div className="p-3 text-center">
                <p className="text-xs text-slate-400 font-sans">Attendance Photo Verification Proof</p>
                <button 
                  onClick={() => setSelectedPhoto(null)}
                  className="mt-2 text-xs font-bold text-navy/60 hover:text-navy/50 transition-colors"
                >
                  Dismiss Proof
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
