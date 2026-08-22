/**
 * Academic-style attendance PDF (client-side via jsPDF).
 * Layout: institutional header, group meta, register table, facilitator signature block.
 */

export type DailyPdfRow = {
  studentId: string;
  name: string;
  status: "present" | "absent" | string;
  timestamp: string | null;
};

export type CumulativePdfRow = {
  studentId: string;
  name: string;
  presentCount: number;
  absentCount: number;
  percentage: number;
};

export type AcademicPdfMeta = {
  groupName: string;
  groupDescription?: string;
  /** Session / report date label, e.g. 2026-08-22 */
  reportDate: string;
  /** Facilitator (coordinator) full name */
  facilitatorName: string;
  facilitatorEmail?: string;
  generatedAt?: Date;
};

function safeFilename(s: string): string {
  return s.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

async function loadJsPdf(): Promise<{
  jsPDF: new (opts?: object) => PdfDoc;
  autoTable: (doc: PdfDoc, opts: object) => void;
}> {
  const jspdfMod = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const jsPDF = jspdfMod.jsPDF;
  const autoTable =
    (autoTableMod as { default?: (doc: PdfDoc, opts: object) => void }).default ||
    (autoTableMod as { autoTable: (doc: PdfDoc, opts: object) => void }).autoTable;
  return { jsPDF, autoTable };
}

const NAVY: [number, number, number] = [21, 61, 112];
const GOLD: [number, number, number] = [186, 143, 74];
const SLATE: [number, number, number] = [51, 65, 85];
const LIGHT: [number, number, number] = [248, 250, 252];

function drawHeader(doc: PdfDoc, title: string, subtitle: string) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 32, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 32, pageW, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("QR Attendance System", 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Official Attendance Register", 14, 21);
  doc.setFontSize(8);
  doc.text(subtitle, pageW - 14, 18, { align: "right" });
}

function drawGroupBlock(doc: PdfDoc, meta: AcademicPdfMeta, yStart: number): number {
  let y = yStart;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(meta.groupName || "Attendance Group", 14, y);
  y += 7;

  if (meta.groupDescription?.trim()) {
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(meta.groupDescription.trim(), 180);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 2;
  }

  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.setFont("helvetica", "bold");
  doc.text("Report date:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(meta.reportDate, 42, y);

  doc.setFont("helvetica", "bold");
  doc.text("Facilitator:", 100, y);
  doc.setFont("helvetica", "normal");
  doc.text(meta.facilitatorName || "—", 128, y);
  y += 5;

  if (meta.facilitatorEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(meta.facilitatorEmail, 128, y);
    y += 4;
  }

  y += 3;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(14, y, 196, y);
  return y + 6;
}

function drawSignatureBlock(doc: PdfDoc, meta: AcademicPdfMeta) {
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  let y = pageH - 42;

  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Certification", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(
    "I certify that this register is a true record of attendance for the session(s) indicated.",
    14,
    y
  );
  y += 12;

  // Signature line
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.4);
  doc.line(14, y, 95, y);
  doc.line(110, y, 196, y);

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Facilitator signature", 14, y + 4);
  doc.text(`Name: ${meta.facilitatorName || "________________"}`, 14, y + 9);
  doc.text("Date", 110, y + 4);
  doc.text(meta.reportDate, 110, y + 9);

  const gen = meta.generatedAt || new Date();
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated ${gen.toLocaleString()} · QR Attendance System`,
    pageW / 2,
    pageH - 8,
    { align: "center" }
  );
}

function addPageNumbers(doc: PdfDoc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${n}`, pageW - 14, pageH - 8, { align: "right" });
  }
}

/** Daily session attendance PDF */
export async function downloadDailyAttendancePdf(opts: {
  meta: AcademicPdfMeta;
  stats: { total: number; present: number; absent: number; percentage: number };
  records: DailyPdfRow[];
  sessionId?: string;
}) {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { meta, stats, records } = opts;

  drawHeader(doc, "Daily Attendance Register", meta.reportDate);
  let y = drawGroupBlock(doc, meta, 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Session summary", 14, y);
  y += 6;

  const boxW = 44;
  const boxes: { label: string; value: string }[] = [
    { label: "Enrolled", value: String(stats.total) },
    { label: "Present", value: String(stats.present) },
    { label: "Absent", value: String(stats.absent) },
    { label: "Attendance %", value: `${stats.percentage}%` },
  ];
  boxes.forEach((b, i) => {
    const x = 14 + i * (boxW + 3);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, boxW, 14, 2, 2, "F");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text(b.label, x + 3, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(b.value, x + 3, y + 11);
  });
  y += 20;

  if (opts.sessionId) {
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.text(`Session ID: ${opts.sessionId}`, 14, y);
    y += 4;
  }

  autoTable(doc, {
    startY: y,
    head: [["Student ID", "Full Name", "Status", "Check-in Time"]],
    body: records.map((r) => [
      r.studentId,
      r.name,
      r.status === "present" ? "Present" : "Absent",
      r.timestamp
        ? new Date(r.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "—",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      textColor: SLATE,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14, bottom: 50 },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber === 1) {
        /* header already drawn */
      } else {
        drawHeader(doc, "Daily Attendance Register", meta.reportDate);
      }
    },
  });

  drawSignatureBlock(doc, meta);
  addPageNumbers(doc);

  const fname = `Attendance_${safeFilename(meta.groupName)}_${safeFilename(meta.reportDate)}.pdf`;
  doc.save(fname);
}

/** Cumulative attendance PDF */
export async function downloadCumulativeAttendancePdf(opts: {
  meta: AcademicPdfMeta;
  stats: { totalSessions: number; averageAttendancePercentage: number };
  records: CumulativePdfRow[];
}) {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { meta, stats, records } = opts;

  drawHeader(doc, "Cumulative Attendance Report", meta.reportDate);
  let y = drawGroupBlock(doc, meta, 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Cumulative summary", 14, y);
  y += 6;

  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, y, 90, 14, 2, 2, "F");
  doc.roundedRect(108, y, 84, 14, 2, 2, "F");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Sessions analysed", 17, y + 5);
  doc.text("Group average attendance", 111, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(String(stats.totalSessions), 17, y + 11);
  doc.setTextColor(...GOLD);
  doc.text(`${stats.averageAttendancePercentage}%`, 111, y + 11);
  y += 20;

  autoTable(doc, {
    startY: y,
    head: [["Student ID", "Full Name", "Present", "Absent", "Attendance %"]],
    body: records.map((r) => [
      r.studentId,
      r.name,
      String(r.presentCount),
      String(r.absentCount),
      `${r.percentage}%`,
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      textColor: SLATE,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 14, right: 14, bottom: 50 },
  });

  drawSignatureBlock(doc, meta);
  addPageNumbers(doc);

  const fname = `Cumulative_Attendance_${safeFilename(meta.groupName)}.pdf`;
  doc.save(fname);
}
