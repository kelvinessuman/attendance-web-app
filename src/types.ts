export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  schedules?: Schedule[];
}

export interface Schedule {
  dayOfWeek: string; // "Monday", "Tuesday", etc.
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface Participant {
  id: string;
  studentId: string;
  name: string;
  email?: string;
  registeredAt?: string;
}

export interface Session {
  id: string;
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD (display only)
  startTime: string; // HH:MM (display only)
  endTime: string; // HH:MM (display only)
  startsAt: string; // ISO 8601 instant — source of truth for when the session opened
  expiresAt: string; // ISO 8601 instant — source of truth for when the session/QR code expires
  status: "active" | "closed";
  createdBy: string;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  sessionId: string;
  groupId: string;
  studentId: string;
  name: string;
  timestamp: string;
  photoBase64: string;
}

export interface DailyReport {
  id: string;
  groupId: string;
  type: "daily";
  date: string;
  sessionId: string;
  isLive?: boolean;
  createdAt: string;
  stats: {
    total: number;
    present: number;
    absent: number;
    percentage: number;
  };
  records: Array<{
    studentId: string;
    name: string;
    email?: string;
    status: "present" | "absent";
    timestamp: string | null;
    photoBase64: string | null;
  }>;
}

export interface CumulativeReport {
  id: string;
  groupId: string;
  type: "cumulative";
  createdAt: string;
  stats: {
    totalSessions: number;
    averageAttendancePercentage: number;
  };
  records: Array<{
    studentId: string;
    name: string;
    email: string;
    presentCount: number;
    absentCount: number;
    percentage: number;
    history: Array<{
      date: string;
      status: "present" | "absent";
      timestamp: string | null;
    }>;
  }>;
}
