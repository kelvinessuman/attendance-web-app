import React, { useState, useEffect } from "react";
import { 
  BarChart3, Calendar, Clock, User, CheckCircle2, XCircle, ArrowLeft, RefreshCw, FileText, Download, Award 
} from "lucide-react";
import { DailyReport, CumulativeReport } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface ReportsPanelProps {
  groupId: string;
  groupName: string;
  onBack: () => void;
}

export default function ReportsPanel({ groupId, groupName, onBack }: ReportsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [cumulativeReport, setCumulativeReport] = useState<CumulativeReport | null>(null);
  const [activeTab, setActiveTab] = useState<"daily" | "cumulative">("daily");
  const [selectedDailyReport, setSelectedDailyReport] = useState<DailyReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/reports/${groupId}`);
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

        <button
          onClick={fetchReports}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Reports
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-navy/8 border border-navy/15 text-sm text-navy rounded-2xl flex items-start gap-3">
          <svg className="h-5 w-5 text-navy/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

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
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
          <p className="text-sm text-slate-500">Compiling report analytics...</p>
        </div>
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
                  <div className="p-8 bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400 rounded-3xl">
                    No session reports generated yet. Expired active sessions or forced sessions populate reports automatically.
                  </div>
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

                      <button
                        onClick={() => handleDownloadCSV(selectedDailyReport)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        <Download className="h-3.5 w-3.5" /> Download CSV
                      </button>
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
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance Register Log</h4>
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
                            {selectedDailyReport.records.map((r) => (
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
                                  {r.photoBase64 ? (
                                    <button 
                                      onClick={() => setSelectedPhoto(r.photoBase64)}
                                      className="relative group block cursor-zoom-in"
                                    >
                                      <img 
                                        src={r.photoBase64} 
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
                            ))}
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
                        onClick={() => handleDownloadCumulativeCSV(cumulativeReport)}
                        className="flex items-center gap-1.5 text-xs font-bold text-navy bg-slate-50 hover:bg-slate-100 border border-slate-200/70 px-3 py-2 rounded-xl transition-colors cursor-pointer shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" /> Download CSV
                      </button>
                    </div>
                  </div>

                  {/* Complete Cumulative Table */}
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
                        {cumulativeReport.records.map((rec) => {
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
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              ) : (
                <div className="p-12 bg-white border border-dashed border-slate-200 rounded-3xl text-center text-xs text-slate-400">
                  <Award className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  No cumulative statistics compiled yet. Complete at least one active attendance session to display group metrics.
                </div>
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



// import React, { useState, useEffect } from "react";
// import { 
//   BarChart3, Calendar, Clock, User, CheckCircle2, XCircle, ArrowLeft, RefreshCw, FileText, Download, Award 
// } from "lucide-react";
// import { DailyReport, CumulativeReport } from "../types";
// import { motion, AnimatePresence } from "motion/react";

// interface ReportsPanelProps {
//   groupId: string;
//   groupName: string;
//   onBack: () => void;
// }

// export default function ReportsPanel({ groupId, groupName, onBack }: ReportsPanelProps) {
//   const [loading, setLoading] = useState(true);
//   const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
//   const [cumulativeReport, setCumulativeReport] = useState<CumulativeReport | null>(null);
//   const [activeTab, setActiveTab] = useState<"daily" | "cumulative">("daily");
//   const [selectedDailyReport, setSelectedDailyReport] = useState<DailyReport | null>(null);
//   const [errorMsg, setErrorMsg] = useState<string | null>(null);
//   const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

//   const fetchReports = async () => {
//     setLoading(true);
//     setErrorMsg(null);
//     try {
//       const res = await fetch(`/api/reports/${groupId}`);
//       const data = await res.json();
//       if (res.ok) {
//         const daily = data.daily || [];
//         setDailyReports(daily);
//         setCumulativeReport(data.cumulative || null);
        
//         // Auto-select latest daily report if none selected yet, or update selectedDailyReport if it's currently showing
//         if (daily.length > 0) {
//           if (!selectedDailyReport) {
//             setSelectedDailyReport(daily[0]);
//           } else {
//             // Find and bind to the updated version of the current selected report
//             const updated = daily.find((r: any) => r.id === selectedDailyReport.id);
//             if (updated) {
//               setSelectedDailyReport(updated);
//             } else {
//               setSelectedDailyReport(daily[0]);
//             }
//           }
//         } else {
//           setSelectedDailyReport(null);
//         }
//       } else {
//         setErrorMsg(data.error || "Failed to load reports.");
//       }
//     } catch (err) {
//       console.error(err);
//       setErrorMsg("Failed to connect to the backend reports server.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchReports();
//   }, [groupId]);

//   const handleDownloadCSV = (report: DailyReport) => {
//     let csvContent = "data:text/csv;charset=utf-8,";
//     csvContent += "Student ID,Name,Email,Status,Check-in Time\n";
    
//     report.records.forEach(r => {
//       const timeStr = r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "—";
//       csvContent += `"${r.studentId}","${r.name}","${r.email || ""}","${r.status}","${timeStr}"\n`;
//     });
    
//     const encodedUri = encodeURI(csvContent);
//     const link = document.createElement("a");
//     link.setAttribute("href", encodedUri);
//     link.setAttribute("download", `attendance_report_${groupName.replace(/\s+/g, "_")}_${report.date}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   const getPercentageColor = (pct: number) => {
//     if (pct >= 85) return "text-gold bg-gold/10 border-gold/20";
//     if (pct >= 65) return "text-navy bg-navy/8 border-navy/15";
//     return "text-navy bg-navy/12 border-navy/25";
//   };

//   return (
//     <div className="max-w-6xl mx-auto px-4 py-6 text-left">
//       {/* Header */}
//       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-8">
//         <div>
//           <button
//             onClick={onBack}
//             className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy transition-colors cursor-pointer mb-2"
//           >
//             <ArrowLeft className="h-4 w-4" /> Back to Group Setup
//           </button>
//           <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
//             {groupName} — Analytics Workspace
//           </h1>
//           <p className="text-sm text-slate-500 font-sans mt-1">
//             Browse daily check-in histories, verify verification photos, and view cumulative stats.
//           </p>
//         </div>

//         <button
//           onClick={fetchReports}
//           className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer self-start md:self-auto"
//         >
//           <RefreshCw className="h-3.5 w-3.5" /> Refresh Reports
//         </button>
//       </div>

//       {errorMsg && (
//         <div className="mb-6 p-4 bg-navy/8 border border-navy/15 text-sm text-navy rounded-2xl flex items-start gap-3">
//           <svg className="h-5 w-5 text-navy/80 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
//           </svg>
//           <span>{errorMsg}</span>
//         </div>
//       )}

//       {/* Tabs Switcher */}
//       <div className="flex border-b border-slate-100 mb-6">
//         <button
//           onClick={() => setActiveTab("daily")}
//           className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
//             activeTab === "daily" 
//               ? "border-navy text-navy" 
//               : "border-transparent text-slate-400 hover:text-slate-600"
//           }`}
//         >
//           <span className="flex items-center gap-2">
//             <Calendar className="h-4 w-4" />
//             Daily Session Reports ({dailyReports.length})
//           </span>
//         </button>
//         <button
//           onClick={() => setActiveTab("cumulative")}
//           className={`px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
//             activeTab === "cumulative" 
//               ? "border-navy text-navy" 
//               : "border-transparent text-slate-400 hover:text-slate-600"
//           }`}
//         >
//           <span className="flex items-center gap-2">
//             <BarChart3 className="h-4 w-4" />
//             Cumulative Metrics
//           </span>
//         </button>
//       </div>

//       {loading ? (
//         <div className="flex flex-col items-center justify-center py-20">
//           <RefreshCw className="h-10 w-10 text-navy animate-spin mb-4" />
//           <p className="text-sm text-slate-500">Compiling report analytics...</p>
//         </div>
//       ) : (
//         <AnimatePresence mode="wait">
          
//           {/* TAB 1: DAILY REPORTS */}
//           {activeTab === "daily" && (
//             <motion.div
//               key="daily"
//               initial={{ opacity: 0, y: 5 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -5 }}
//               className="grid grid-cols-1 lg:grid-cols-3 gap-8"
//             >
//               {/* Daily Reports Card Selector List */}
//               <div className="lg:col-span-1 space-y-3.5 max-h-[600px] overflow-y-auto pr-2">
//                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Session Dates</h3>
//                 {dailyReports.length > 0 ? (
//                   dailyReports.map((report) => (
//                     <button
//                       key={report.id}
//                       onClick={() => setSelectedDailyReport(report)}
//                       className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
//                         selectedDailyReport?.id === report.id
//                           ? "bg-navy/5 border-navy/20 shadow-sm"
//                           : "bg-white border-slate-100 hover:border-slate-200"
//                       }`}
//                     >
//                       <div className="flex items-center justify-between">
//                         <div className="flex items-center gap-1.5">
//                           <span className="text-xs font-bold text-slate-800">{report.date}</span>
//                           {report.isLive && (
//                             <>
//                               <span className="relative flex h-2 w-2">
//                                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold/60 opacity-75"></span>
//                                 <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
//                               </span>
//                               <span className="text-[9px] font-extrabold text-gold bg-gold/10 px-1 py-0.5 rounded uppercase tracking-wider">Live</span>
//                             </>
//                           )}
//                         </div>
//                         <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPercentageColor(report.stats.percentage)}`}>
//                           {report.stats.percentage}% Present
//                         </span>
//                       </div>
                      
//                       <div className="flex items-center justify-between text-[11px] text-slate-500">
//                         <span className={`flex items-center gap-1 font-medium ${report.isLive ? "text-navy animate-pulse font-bold" : ""}`}>
//                           {report.isLive ? <RefreshCw className="h-3 w-3 animate-spin text-navy/80" /> : <FileText className="h-3 w-3" />}
//                           {report.isLive ? "In-Progress Check-In" : `Session ${report.sessionId.endsWith("_manual") ? "Manual" : "Auto"}`}
//                         </span>
//                         <span>{report.stats.present}/{report.stats.total} Checked-In</span>
//                       </div>
//                     </button>
//                   ))
//                 ) : (
//                   <div className="p-8 bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400 rounded-3xl">
//                     No session reports generated yet. Expired active sessions or forced sessions populate reports automatically.
//                   </div>
//                 )}
//               </div>

//               {/* Detailed View of Selected Daily Report */}
//               <div className="lg:col-span-2 space-y-6">
//                 {selectedDailyReport ? (
//                   <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6">
//                                       {/* Detail Card Header */}
//                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
//                       <div>
//                         <div className="flex items-center gap-2">
//                           <h3 className="text-lg font-bold text-slate-900 font-sans flex items-center gap-2">
//                             Session Report: {selectedDailyReport.date}
//                           </h3>
//                           {selectedDailyReport.isLive && (
//                             <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 border border-gold/20 text-gold rounded-full text-[10px] font-extrabold animate-pulse uppercase tracking-wider">
//                               Live
//                             </span>
//                           )}
//                         </div>
//                         <p className="text-xs text-slate-400 font-mono mt-1">
//                           ID: {selectedDailyReport.sessionId}
//                         </p>
//                       </div>

//                       <button
//                         onClick={() => handleDownloadCSV(selectedDailyReport)}
//                         className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer self-start sm:self-auto"
//                       >
//                         <Download className="h-3.5 w-3.5" /> Download CSV
//                       </button>
//                     </div>

//                     {/* Live indicator alert banner */}
//                     {selectedDailyReport.isLive && (
//                       <div className="bg-navy/5 border border-navy/10 rounded-2xl p-4 flex items-start gap-3 text-xs text-navy">
//                         <RefreshCw className="h-4 w-4 text-navy/80 animate-spin shrink-0 mt-0.5" />
//                         <div>
//                           <p className="font-bold text-navy">Active Session In-Progress</p>
//                           <p className="text-slate-500 mt-0.5">Students are checking in live right now using their device cameras. Click the "Refresh Reports" button above to pull the latest photos and check-in times.</p>
//                         </div>
//                       </div>
//                     )}

//                     {/* Stats Summary Bento Block */}
//                     <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//                       <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center">
//                         <p className="text-[10px] font-bold text-slate-400 uppercase">Enrolled</p>
//                         <p className="text-xl font-bold text-slate-950 mt-1">{selectedDailyReport.stats.total}</p>
//                       </div>
//                       <div className="bg-gold/5 border border-gold/40 p-4 rounded-2xl text-center">
//                         <p className="text-[10px] font-bold text-gold uppercase">Present</p>
//                         <p className="text-xl font-bold text-gold mt-1">{selectedDailyReport.stats.present}</p>
//                       </div>
//                       <div className="bg-navy/5 border border-navy/20 p-4 rounded-2xl text-center">
//                         <p className="text-[10px] font-bold text-navy uppercase">Absent</p>
//                         <p className="text-xl font-bold text-navy mt-1">{selectedDailyReport.stats.absent}</p>
//                       </div>
//                       <div className="bg-navy/5 border border-navy/8 p-4 rounded-2xl text-center">
//                         <p className="text-[10px] font-bold text-navy uppercase">Ratio %</p>
//                         <p className="text-xl font-bold text-navy mt-1">{selectedDailyReport.stats.percentage}%</p>
//                       </div>
//                     </div>

//                     {/* Attendance Records Table */}
//                     <div className="space-y-3.5">
//                       <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance Register Log</h4>
//                       <div className="overflow-x-auto">
//                         <table className="min-w-full divide-y divide-slate-100">
//                           <thead>
//                             <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left bg-slate-50">
//                               <th className="px-4 py-2 rounded-l-lg">ID</th>
//                               <th className="px-4 py-2">Name</th>
//                               <th className="px-4 py-2">Status</th>
//                               <th className="px-4 py-2">Timestamp</th>
//                               <th className="px-4 py-2 rounded-r-lg">Photo Verification</th>
//                             </tr>
//                           </thead>
//                           <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
//                             {selectedDailyReport.records.map((r) => (
//                               <tr key={r.studentId} className="hover:bg-slate-50/50">
//                                 <td className="px-4 py-3 font-mono font-semibold text-navy">{r.studentId}</td>
//                                 <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
//                                 <td className="px-4 py-3">
//                                   {r.status === "present" ? (
//                                     <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold rounded-full text-[10px] font-bold">
//                                       <CheckCircle2 className="h-3 w-3" /> Present
//                                     </span>
//                                   ) : (
//                                     <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-navy/8 text-navy rounded-full text-[10px] font-bold">
//                                       <XCircle className="h-3 w-3" /> Absent
//                                     </span>
//                                   )}
//                                 </td>
//                                 <td className="px-4 py-3 text-slate-500 font-mono">
//                                   {r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
//                                 </td>
//                                 <td className="px-4 py-3">
//                                   {r.photoBase64 ? (
//                                     <button 
//                                       onClick={() => setSelectedPhoto(r.photoBase64)}
//                                       className="relative group block cursor-zoom-in"
//                                     >
//                                       <img 
//                                         src={r.photoBase64} 
//                                         alt="Verify camera capture" 
//                                         className="h-9 w-12 rounded-lg object-cover border border-slate-200 group-hover:opacity-85 transition-opacity"
//                                         referrerPolicy="no-referrer"
//                                       />
//                                       <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
//                                         <span className="text-[8px] text-white font-bold bg-slate-900/80 px-1 py-0.5 rounded">View</span>
//                                       </div>
//                                     </button>
//                                   ) : r.status === "present" ? (
//                                     <span className="text-slate-400 italic text-xs" title={`Photos are automatically cleared after 24 hours to save storage.`}>
//                                       Photo expired
//                                     </span>
//                                   ) : (
//                                     <span className="text-slate-400 italic">—</span>
//                                   )}
//                                 </td>
//                               </tr>
//                             ))}
//                           </tbody>
//                         </table>
//                       </div>
//                     </div>

//                   </div>
//                 ) : (
//                   <div className="h-64 bg-white border border-slate-100 rounded-3xl flex items-center justify-center text-xs text-slate-400 font-sans shadow-sm">
//                     Select a session date from the sidebar to view full logs.
//                   </div>
//                 )}
//               </div>
//             </motion.div>
//           )}

//           {/* TAB 2: CUMULATIVE METRICS */}
//           {activeTab === "cumulative" && (
//             <motion.div
//               key="cumulative"
//               initial={{ opacity: 0, y: 5 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -5 }}
//               className="space-y-6"
//             >
//               {cumulativeReport ? (
//                 <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm space-y-8">
                  
//                   {/* Summary row */}
//                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-5">
//                     <div>
//                       <h3 className="text-lg font-bold text-slate-900 font-sans">
//                         Cumulative Performance Register
//                       </h3>
//                       <p className="text-xs text-slate-400 mt-0.5">
//                         Overarching student track performance compiled from all daily sessions.
//                       </p>
//                     </div>

//                     <div className="flex gap-4">
//                       <div className="text-right">
//                         <p className="text-[10px] font-bold text-slate-400 uppercase">Sessions Analyzed</p>
//                         <p className="text-lg font-extrabold text-navy mt-0.5">{cumulativeReport.stats.totalSessions}</p>
//                       </div>
//                       <div className="border-l border-slate-200" />
//                       <div className="text-right">
//                         <p className="text-[10px] font-bold text-slate-400 uppercase">Group Average</p>
//                         <p className="text-lg font-extrabold text-gold mt-0.5">{cumulativeReport.stats.averageAttendancePercentage}%</p>
//                       </div>
//                     </div>
//                   </div>

//                   {/* Complete Cumulative Table */}
//                   <div className="overflow-x-auto">
//                     <table className="min-w-full divide-y divide-slate-100">
//                       <thead>
//                         <tr className="text-[10px] text-slate-400 uppercase font-bold tracking-wider text-left bg-slate-50">
//                           <th className="px-4 py-3 rounded-l-lg">ID</th>
//                           <th className="px-4 py-3">Name</th>
//                           <th className="px-4 py-3">Enrolled Sessions</th>
//                           <th className="px-4 py-3">Present</th>
//                           <th className="px-4 py-3">Absent</th>
//                           <th className="px-4 py-3">Score %</th>
//                           <th className="px-4 py-3 rounded-r-lg">Attendance Grid (Chronological)</th>
//                         </tr>
//                       </thead>
//                       <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
//                         {cumulativeReport.records.map((rec) => {
//                           const totalSess = rec.presentCount + rec.absentCount;
//                           return (
//                             <tr key={rec.studentId} className="hover:bg-slate-50/50">
//                               <td className="px-4 py-3 font-mono font-semibold text-navy">{rec.studentId}</td>
//                               <td className="px-4 py-3 font-medium text-slate-900">{rec.name}</td>
//                               <td className="px-4 py-3 text-slate-500 font-medium">{totalSess}</td>
//                               <td className="px-4 py-3 text-gold font-bold">{rec.presentCount}</td>
//                               <td className="px-4 py-3 text-navy font-bold">{rec.absentCount}</td>
//                               <td className="px-4 py-3">
//                                 <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] border ${getPercentageColor(rec.percentage)}`}>
//                                   {rec.percentage}%
//                                 </span>
//                               </td>
//                               <td className="px-4 py-3">
//                                 {/* Chronological Contribution Mini Dot Grid */}
//                                 <div className="flex items-center gap-1 max-w-[200px] overflow-x-auto py-1">
//                                   {rec.history && rec.history.length > 0 ? (
//                                     rec.history.map((hist, hIdx) => (
//                                       <div
//                                         key={hIdx}
//                                         className={`h-4.5 w-4.5 rounded-md flex-shrink-0 border transition-all ${
//                                           hist.status === "present"
//                                             ? "bg-gold border-gold shadow-sm shadow-gold/10"
//                                             : "bg-navy border-navy shadow-sm shadow-navy/10"
//                                         }`}
//                                         title={`Date: ${hist.date} - ${hist.status === "present" ? "Present" : "Absent"}`}
//                                       />
//                                     ))
//                                   ) : (
//                                     <span className="text-slate-400 italic text-[11px]">No session participation</span>
//                                   )}
//                                 </div>
//                               </td>
//                             </tr>
//                           );
//                         })}
//                       </tbody>
//                     </table>
//                   </div>

//                 </div>
//               ) : (
//                 <div className="p-12 bg-white border border-dashed border-slate-200 rounded-3xl text-center text-xs text-slate-400">
//                   <Award className="h-10 w-10 text-slate-300 mx-auto mb-3" />
//                   No cumulative statistics compiled yet. Complete at least one active attendance session to display group metrics.
//                 </div>
//               )}
//             </motion.div>
//           )}

//         </AnimatePresence>
//       )}

//       {/* Photo Preview Lightbox Modal */}
//       <AnimatePresence>
//         {selectedPhoto && (
//           <motion.div 
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             onClick={() => setSelectedPhoto(null)}
//             className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 cursor-zoom-out"
//           >
//             <motion.div 
//               initial={{ scale: 0.95 }}
//               animate={{ scale: 1 }}
//               exit={{ scale: 0.95 }}
//               onClick={(e) => e.stopPropagation()}
//               className="bg-slate-900 p-2.5 rounded-3xl max-w-lg w-full overflow-hidden border border-slate-800"
//             >
//               <img 
//                 src={selectedPhoto} 
//                 alt="Full Verification Proof" 
//                 className="w-full h-auto aspect-[4/3] rounded-2xl object-cover" 
//                 referrerPolicy="no-referrer"
//               />
//               <div className="p-3 text-center">
//                 <p className="text-xs text-slate-400 font-sans">Attendance Photo Verification Proof</p>
//                 <button 
//                   onClick={() => setSelectedPhoto(null)}
//                   className="mt-2 text-xs font-bold text-navy/60 hover:text-navy/50 transition-colors"
//                 >
//                   Dismiss Proof
//                 </button>
//               </div>
//             </motion.div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//     </div>
//   );
// }
