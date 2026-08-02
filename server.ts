import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { createServer as createViteServer } from "vite";
import QRCode from "qrcode";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// ==========================================
// EXPRESS APP
// ==========================================
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

const isProd = process.env.NODE_ENV === "production";

// Required when deployed behind a reverse proxy / load balancer (Render,
// Railway, Fly.io, Heroku, Nginx, etc.) so Express sees the real client IP
// (needed for rate limiting) and correctly detects HTTPS (needed for secure
// cookies) via the X-Forwarded-* headers the proxy sets.
if (isProd) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    // Disabled because Vite/React inline styles and the camera-capture canvas
    // flow don't fit a strict default CSP without a larger rework; the other
    // helmet protections (HSTS, no-sniff, frameguard, etc.) still apply.
    contentSecurityPolicy: false,
  })
);

// General API rate limit: generous enough for normal dashboard use, but
// blocks scripted abuse/scraping.
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Tighter limit on auth endpoints specifically, to slow down credential
// stuffing / brute-force login attempts and registration spam.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

// Separate limit for the public check-in endpoint: it's unauthenticated by
// design (students scan a QR code), so it needs its own abuse guard against
// someone scripting fake check-ins.
const checkinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many check-in attempts. Please wait a few minutes and try again." },
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
app.use(cookieParser());

// ==========================================
// POSTGRESQL CONNECTION
// ==========================================

// A real (non-empty) PGPASSWORD is required: Postgres's default SCRAM-SHA-256
// auth rejects an empty password outright, and pg's own config resolver
// treats an empty string as "unset" and falls through to `undefined` — which
// then surfaces as a cryptic "client password must be a string" crash deep in
// pg's SASL code. Fail fast here instead, with guidance on how to fix it.
if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
  console.error(
    "\n[Postgres] Neither DATABASE_URL nor PGPASSWORD is set.\n" +
    "  Local dev: copy .env.example to .env and set PGPASSWORD to your local Postgres password.\n" +
    "  Hosted (Render/Supabase/etc.): set DATABASE_URL to your provider's connection string.\n" +
    "  Restart the server after changing env vars — they're only loaded at startup.\n"
  );
}

const pool = new Pool({
  // If the host provides a single connection string (Render, Railway, Heroku,
  // Supabase, Neon, etc. all do this), prefer it — it already encodes
  // host/port/user/password/database/sslmode correctly.
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.PGHOST || "localhost",
  port: process.env.DATABASE_URL ? undefined : parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.DATABASE_URL ? undefined : process.env.PGUSER || "postgres",
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD, // intentionally left undefined (not "") when unset, so pg's own error messaging is consistent rather than masked by a falsy empty-string fallback
  database: process.env.DATABASE_URL ? undefined : process.env.PGDATABASE || "attendance_db",
  // Most managed Postgres providers require SSL. `rejectUnauthorized: false`
  // is the standard/expected setting for these providers' self-signed
  // certificate chains (Render, Railway, Heroku docs all recommend this).
  ssl: process.env.PGSSLMODE === "require" || (isProd && process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("[Postgres] Unexpected error on idle client", err);
});

function describeConnectionTarget(): string {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return `${u.username}@${u.hostname}:${u.port || "5432"}${u.pathname} (via DATABASE_URL)`;
    } catch {
      return "DATABASE_URL (unparsable — check it's a valid postgres:// URI)";
    }
  }
  return `${process.env.PGUSER || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "attendance_db"} (via PG* vars)`;
}

async function testDbConnection() {
  try {
    await pool.query("SELECT 1");
    console.log(`[Postgres] Connected as ${describeConnectionTarget()}`);
  } catch (err: any) {
    console.error(`[Postgres] Failed to connect to ${describeConnectionTarget()}`);
    if (err.message?.includes("must be a string") || err.message?.includes("SASL")) {
      console.error(
        "[Postgres] This usually means PGPASSWORD/DATABASE_URL is missing or empty. " +
        "Set a real password and restart the server."
      );
    } else if (err.message?.includes("password authentication failed")) {
      console.error(
        "[Postgres] The username/password above were rejected by the database. Check that:\n" +
        "  - DATABASE_URL has your REAL password substituted for any [YOUR-PASSWORD] placeholder\n" +
        "  - You copied the connection string fresh (a password reset invalidates the old one)\n" +
        "  - If on Supabase, prefer the pooler URI (username looks like postgres.xxxxxxx), not the raw Direct connection"
      );
    } else {
      console.error(err.message);
    }
  }
}
testDbConnection();

const genId = () => crypto.randomUUID();

// ==========================================
// AUTH HELPERS
// ==========================================
const INSECURE_DEFAULT_JWT_SECRET = "dev-only-insecure-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || INSECURE_DEFAULT_JWT_SECRET;
const COOKIE_NAME = "token";

if (isProd && JWT_SECRET === INSECURE_DEFAULT_JWT_SECRET) {
  console.error(
    "\n[FATAL] Refusing to start in production with the default JWT_SECRET.\n" +
    "  Set a long, random JWT_SECRET in your environment (e.g. `openssl rand -hex 32`) and restart.\n"
  );
  process.exit(1);
}

interface AuthPayload {
  id: string;
  email: string;
  fullName: string;
}

function signToken(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function setAuthCookie(res: express.Response, payload: AuthPayload) {
  const token = signToken(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd, // requires HTTPS in production; disabled for local http:// dev
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated. Please log in." });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    (req as any).user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

/**
 * Loads a group and verifies the current user owns it. Sends 404 (doesn't
 * exist) or 403 (belongs to someone else) and returns null if the caller
 * shouldn't proceed; otherwise returns the raw group row.
 *
 * This check matters specifically because a group's ID is NOT a secret: it's
 * embedded in the public check-in QR code/URL that gets posted or projected
 * for students to scan. Requiring login (requireAuth) alone is not enough —
 * without this, any other logged-in coordinator who has seen a group's QR
 * code could view its roster, edit its schedule, or pull its attendance
 * photos just by knowing that ID.
 */
async function requireGroupOwner(groupId: string, user: AuthPayload, res: express.Response) {
  const result = await pool.query("SELECT * FROM groups WHERE id = $1", [groupId]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  if (result.rows[0].created_by !== user.id) {
    res.status(403).json({ error: "You don't have access to this group." });
    return null;
  }
  return result.rows[0];
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// ==========================================
// AUTH ENDPOINTS
// ==========================================

// Register: email, full name, password, confirm password
app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { email, fullName, password, confirmPassword } = req.body;

  if (!email || !fullName || !password || !confirmPassword) {
    return res.status(400).json({ error: "Email, full name, password, and confirm password are all required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Password and confirm password do not match." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = genId();

    await pool.query(
      "INSERT INTO users (id, email, full_name, password_hash) VALUES ($1, $2, $3, $4)",
      [id, normalizedEmail, fullName.trim(), passwordHash]
    );

    const payload: AuthPayload = { id, email: normalizedEmail, fullName: fullName.trim() };
    setAuthCookie(res, payload);
    res.json({ success: true, user: payload });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to register: " + err.message });
  }
});

// Login: valid email and password
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query(
      "SELECT id, email, full_name, password_hash FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const payload: AuthPayload = { id: user.id, email: user.email, fullName: user.full_name };
    setAuthCookie(res, payload);
    res.json({ success: true, user: payload });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to log in: " + err.message });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// Current session
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: (req as any).user });
});

// Forgot password - step 1: check the email exists in the database
app.post("/api/auth/forgot-password/check-email", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No account was found for this email address.", exists: false });
    }
    res.json({ exists: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to check email: " + err.message });
  }
});

// Forgot password - step 2: set and confirm the new password for that email
app.post("/api/auth/forgot-password/reset", authLimiter, async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;
  if (!email || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Email, new password, and confirm password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirm password do not match." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No account was found for this email address." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [passwordHash, normalizedEmail]);

    res.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password: " + err.message });
  }
});

// ==========================================
// GROUP MANAGEMENT ENDPOINTS (require login)
// ==========================================

// List groups owned by the logged-in coordinator
app.get("/api/groups", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  try {
    const result = await pool.query(
      "SELECT id, name, description, created_by, schedules, created_at FROM groups WHERE created_by = $1 ORDER BY created_at DESC",
      [user.id]
    );
    const groups = result.rows.map(rowToGroup);
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new group
app.post("/api/groups", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  const { name, description } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Group name is required." });
  }

  try {
    const id = genId();
    const createdAt = new Date().toISOString();
    await pool.query(
      "INSERT INTO groups (id, name, description, created_by, schedules, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, String(name).trim(), String(description || "").trim(), user.id, JSON.stringify([]), createdAt]
    );
    res.json({
      success: true,
      group: { id, name: String(name).trim(), description: String(description || "").trim(), createdBy: user.id, createdAt, schedules: [] },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create group: " + err.message });
  }
});

// Get a single group + its participants
app.get("/api/groups/:groupId/details", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    const partResult = await pool.query(
      "SELECT id, student_id, name, email, registered_at FROM participants WHERE group_id = $1 ORDER BY registered_at ASC",
      [groupId]
    );
    const participants = partResult.rows.map(rowToParticipant);
    res.json({ group: rowToGroup(groupRow), participants });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load group details." });
  }
});

// Update a group's schedules
app.patch("/api/groups/:groupId/schedules", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  const { schedules } = req.body;
  if (!Array.isArray(schedules)) {
    return res.status(400).json({ error: "schedules must be an array." });
  }
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    await pool.query("UPDATE groups SET schedules = $1 WHERE id = $2", [JSON.stringify(schedules), groupId]);
    res.json({ success: true, schedules });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update schedules." });
  }
});

// Register a participant into a group
app.post("/api/groups/:groupId/participants", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  const { studentId, name, email } = req.body;
  if (!studentId || !name) {
    return res.status(400).json({ error: "Student ID and Full Name are required." });
  }

  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;

    const dup = await pool.query(
      "SELECT id FROM participants WHERE group_id = $1 AND student_id = $2",
      [groupId, String(studentId).trim().toUpperCase()]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `Participant with Student ID "${studentId}" is already registered.` });
    }

    const id = genId();
    const registeredAt = new Date().toISOString();
    await pool.query(
      "INSERT INTO participants (id, group_id, student_id, name, email, registered_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, groupId, String(studentId).trim().toUpperCase(), String(name).trim(), String(email || "").trim(), registeredAt]
    );

    res.json({
      success: true,
      participant: { id, studentId: String(studentId).trim().toUpperCase(), name: String(name).trim(), email: String(email || "").trim(), registeredAt },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to register participant." });
  }
});

// Remove a participant
app.delete("/api/groups/:groupId/participants/:participantId", requireAuth, async (req, res) => {
  const { groupId, participantId } = req.params;
  const user = (req as any).user as AuthPayload;
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    await pool.query("DELETE FROM participants WHERE id = $1 AND group_id = $2", [participantId, groupId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to remove participant." });
  }
});

// ==========================================
// ROW MAPPERS
// ==========================================
function rowToGroup(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    schedules: row.schedules || [],
  };
}

function rowToParticipant(row: any) {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    email: row.email,
    registeredAt: row.registered_at instanceof Date ? row.registered_at.toISOString() : row.registered_at,
  };
}

function rowToSession(row: any) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    // Real, unambiguous instants (ISO 8601, always UTC-backed). These — never the
    // display-only date/startTime/endTime strings above — are the source of truth
    // for whether a session/QR code is currently valid.
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// ==========================================
// TIME WINDOW HELPERS
// ==========================================
// Sessions are always anchored to real Date/timestamp math, never to string
// comparisons of "HH:MM" clock values. String comparison silently breaks the
// instant a window crosses midnight (e.g. a 23:50 -> 00:20 session), because
// "23:55" >= "00:20" is true lexicographically even though only 5 minutes have
// elapsed. Building an actual Date (with automatic day rollover) avoids this
// entirely and gives every session one unambiguous expiry instant.

/** Parses a "YYYY-MM-DD" + "HH:MM" pair (interpreted in server-local time) into a Date. */
function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
}

/**
 * Computes the real start/end instants for a schedule slot on a given date,
 * automatically rolling the end instant to the next calendar day if the slot
 * crosses midnight (endTime <= startTime).
 */
function computeSessionWindow(dateStr: string, startTime: string, endTime: string): { startsAt: Date; endsAt: Date } {
  const startsAt = combineDateAndTime(dateStr, startTime);
  let endsAt = combineDateAndTime(dateStr, endTime);
  if (endsAt.getTime() <= startsAt.getTime()) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }
  return { startsAt, endsAt };
}

const formatClock = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const formatDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** True expiry check: real Date comparison against the stored expires_at instant. */
function isSessionExpired(sessData: { expiresAt: string | Date }, now: Date = new Date()): boolean {
  const expiresAt = sessData.expiresAt instanceof Date ? sessData.expiresAt : new Date(sessData.expiresAt);
  return now.getTime() >= expiresAt.getTime();
}

/**
 * Lazily closes a session if it has passed its real expiry instant but hasn't
 * been swept by the background scheduler yet (the scheduler only ticks every
 * 60s, so without this a student could load the check-in page in the gap and
 * see a "live" session that is, in reality, already over). Called on every
 * read of an active session so expiry is felt immediately, not up to 59s late.
 */
async function closeIfExpired(sessData: ReturnType<typeof rowToSession>): Promise<boolean> {
  if (sessData.status === "active" && sessData.expiresAt && isSessionExpired(sessData)) {
    await closeSessionAndGenerateReports(sessData.id);
    return true;
  }
  return false;
}

// ==========================================
// SCHEDULER IMPLEMENTATION
// ==========================================

async function updateCumulativeReport(groupId: string) {
  try {
    const dailyResult = await pool.query(
      "SELECT * FROM daily_reports WHERE group_id = $1 ORDER BY date ASC",
      [groupId]
    );
    const dailyReports = dailyResult.rows.map((r) => ({
      date: r.date,
      records: r.records,
    }));
    const totalSessions = dailyReports.length;

    const partResult = await pool.query(
      "SELECT student_id, name, email FROM participants WHERE group_id = $1",
      [groupId]
    );
    const participantsList = partResult.rows.map((p) => ({
      studentId: p.student_id,
      name: p.name,
      email: p.email || "",
    }));

    const studentStatsMap = new Map<string, any>();
    participantsList.forEach((p) => {
      studentStatsMap.set(p.studentId, {
        studentId: p.studentId,
        name: p.name,
        email: p.email,
        presentCount: 0,
        absentCount: 0,
        history: [],
      });
    });

    for (const report of dailyReports) {
      const records = report.records || [];
      const date = report.date;

      for (const rec of records) {
        let stat = studentStatsMap.get(rec.studentId);

        if (!stat) {
          stat = {
            studentId: rec.studentId,
            name: rec.name,
            email: rec.email || "",
            presentCount: 0,
            absentCount: 0,
            history: [],
          };
          studentStatsMap.set(rec.studentId, stat);
        }

        if (rec.status === "present") {
          stat.presentCount++;
        } else {
          stat.absentCount++;
        }

        stat.history.push({
          date,
          status: rec.status,
          timestamp: rec.timestamp,
        });
      }
    }

    const finalRecords = Array.from(studentStatsMap.values()).map((stat) => {
      const totalParticipation = stat.presentCount + stat.absentCount;
      const percentage = totalParticipation > 0 ? (stat.presentCount / totalParticipation) * 100 : 100;
      return {
        ...stat,
        percentage: parseFloat(percentage.toFixed(1)),
      };
    });

    let groupPercentageSum = 0;
    finalRecords.forEach((r) => {
      groupPercentageSum += r.percentage;
    });
    const averageAttendancePercentage = finalRecords.length > 0 ? groupPercentageSum / finalRecords.length : 0;

    const stats = {
      totalSessions,
      averageAttendancePercentage: parseFloat(averageAttendancePercentage.toFixed(1)),
    };

    await pool.query(
      `INSERT INTO cumulative_reports (group_id, created_at, stats, records)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id) DO UPDATE SET created_at = $2, stats = $3, records = $4`,
      [groupId, new Date().toISOString(), JSON.stringify(stats), JSON.stringify(finalRecords)]
    );

    console.log(`Updated cumulative report for group ${groupId}`);
  } catch (err) {
    console.error(`Error updating cumulative report for group ${groupId}:`, err);
  }
}

async function closeSessionAndGenerateReports(sessionId: string) {
  const sessResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
  if (sessResult.rows.length === 0) return;
  const sessData = rowToSession(sessResult.rows[0]);

  if (sessData.status === "closed") return;

  await pool.query("UPDATE sessions SET status = 'closed' WHERE id = $1", [sessionId]);

  const groupId = sessData.groupId;

  const partResult = await pool.query(
    "SELECT id, student_id, name, email FROM participants WHERE group_id = $1",
    [groupId]
  );
  const participantsList = partResult.rows.map((p) => ({
    id: p.id,
    studentId: p.student_id,
    name: p.name,
    email: p.email || "",
  }));

  const checkinsResult = await pool.query("SELECT * FROM checkins WHERE session_id = $1", [sessionId]);
  const checkinsMap = new Map<string, any>();
  checkinsResult.rows.forEach((c) => {
    checkinsMap.set(c.student_id, {
      timestamp: c.timestamp instanceof Date ? c.timestamp.toISOString() : c.timestamp,
    });
  });

  let presentCount = 0;
  let absentCount = 0;

  // Note: records intentionally do NOT embed photoBase64 — `checkins` is the
  // single source of truth for photos. The reports endpoint joins it back in
  // live when a report is actually viewed, so a photo is only ever stored
  // once instead of duplicated into every report row.
  const records = participantsList.map((p) => {
    const checkedIn = checkinsMap.get(p.studentId);
    if (checkedIn) {
      presentCount++;
      return {
        studentId: p.studentId,
        name: p.name,
        email: p.email,
        status: "present",
        timestamp: checkedIn.timestamp,
      };
    } else {
      absentCount++;
      return {
        studentId: p.studentId,
        name: p.name,
        email: p.email,
        status: "absent",
        timestamp: null,
      };
    }
  });

  const total = participantsList.length;
  const percentage = total > 0 ? (presentCount / total) * 100 : 0;

  const reportId = `${sessionId}_daily`;
  const stats = {
    total,
    present: presentCount,
    absent: absentCount,
    percentage: parseFloat(percentage.toFixed(1)),
  };

  await pool.query(
    `INSERT INTO daily_reports (id, group_id, date, session_id, created_at, stats, records)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET stats = $6, records = $7`,
    [reportId, groupId, sessData.date, sessionId, new Date().toISOString(), JSON.stringify(stats), JSON.stringify(records)]
  );

  await updateCumulativeReport(groupId);
}

async function runSchedulerLogic() {
  const log: string[] = [];
  const now = new Date();

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = days[now.getDay()];

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const dateStr = String(now.getDate()).padStart(2, "0");
  const currentDate = `${year}-${month}-${dateStr}`;

  const currentHour = String(now.getHours()).padStart(2, "0");
  const currentMinute = String(now.getMinutes()).padStart(2, "0");
  const currentTime = `${currentHour}:${currentMinute}`;

  log.push(`Scheduler run: ${currentDate} ${currentTime} (${currentDay})`);

  try {
    const groupsResult = await pool.query("SELECT * FROM groups");

    for (const groupRow of groupsResult.rows) {
      const groupData = rowToGroup(groupRow);
      const groupId = groupData.id;
      const groupName = groupData.name || "Unnamed Group";
      const schedules = groupData.schedules || [];

      for (const sched of schedules) {
        if (sched.dayOfWeek === currentDay) {
          const { startTime, endTime } = sched;

          if (currentTime >= startTime && currentTime < endTime) {
            const existing = await pool.query(
              "SELECT id FROM sessions WHERE group_id = $1 AND date = $2 AND start_time = $3",
              [groupId, currentDate, startTime]
            );

            if (existing.rows.length === 0) {
              const { startsAt, endsAt } = computeSessionWindow(currentDate, startTime, endTime);
              const sessionId = `${groupId}_${currentDate}_${startTime.replace(":", "")}`;
              await pool.query(
                `INSERT INTO sessions (id, group_id, group_name, date, start_time, end_time, starts_at, expires_at, status, created_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)`,
                [sessionId, groupId, groupName, currentDate, startTime, endTime, startsAt.toISOString(), endsAt.toISOString(), groupData.createdBy, new Date().toISOString()]
              );
              log.push(`Auto-started session for "${groupName}" (${startTime} - ${endTime}, expires ${endsAt.toISOString()})`);
            }
          }
        }
      }
    }

    const activeResult = await pool.query("SELECT * FROM sessions WHERE status = 'active'");

    for (const sessRow of activeResult.rows) {
      const sessData = rowToSession(sessRow);

      if (isSessionExpired(sessData, now)) {
        await closeSessionAndGenerateReports(sessData.id);
        log.push(`Auto-closed expired session ${sessData.id} for "${sessData.groupName}"`);
      }
    }
  } catch (err: any) {
    log.push(`Error running scheduler: ${err.message}`);
    console.error("Scheduler run error:", err);
  }

  return log;
}

// Background Cron: Run scheduler logic every 60 seconds
setInterval(async () => {
  console.log("[Scheduler] Executing automatic check...");
  await runSchedulerLogic();
}, 60000);

// ==========================================
// PHOTO RETENTION
// ==========================================
// Check-in photos are only needed briefly, to let a coordinator visually spot-
// check a live/recent session. Keeping them forever is the single biggest
// driver of database storage usage (they're stored once now, not duplicated
// into reports — see closeSessionAndGenerateReports — but still add up over a
// semester). This job clears the photo bytes for anything older than 24
// hours; every other attendance field (status, timestamp, name) is untouched
// and reports keep working normally, they just stop showing a photo for
// older check-ins.
const PHOTO_RETENTION_HOURS = 24;

async function purgeOldPhotos() {
  try {
    const result = await pool.query(
      `UPDATE checkins SET photo_base64 = NULL
       WHERE photo_base64 IS NOT NULL AND "timestamp" < now() - interval '${PHOTO_RETENTION_HOURS} hours'`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`[Photo retention] Cleared ${result.rowCount} check-in photo(s) older than ${PHOTO_RETENTION_HOURS}h.`);
    }
  } catch (err) {
    console.error("[Photo retention] Failed to purge old photos:", err);
  }
}

// Runs once shortly after boot, then every 30 minutes. Hourly-ish granularity
// is plenty for a 24h retention window and avoids scanning the table every
// single scheduler tick.
setTimeout(purgeOldPhotos, 15000);
setInterval(purgeOldPhotos, 30 * 60 * 1000);

// ==========================================
// PUBLIC / ATTENDANCE API ENDPOINTS
// ==========================================

// 1. Trigger Scheduler manually
app.post("/api/scheduler/trigger", requireAuth, async (req, res) => {
  try {
    const log = await runSchedulerLogic();
    res.json({ success: true, log });
  } catch (err: any) {
    console.error("[scheduler/trigger]", err);
    res.status(500).json({ error: "Failed to run scheduler." });
  }
});

// 2. Force start an attendance session immediately for a group (manual override)
app.post("/api/sessions/force-start", requireAuth, async (req, res) => {
  const { groupId, durationMinutes } = req.body;
  const user = (req as any).user as AuthPayload;
  if (!groupId) {
    return res.status(400).json({ error: "groupId is required" });
  }

  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    const groupData = rowToGroup(groupRow);

    const parsedDuration = durationMinutes ? parseInt(durationMinutes, 10) : 30;
    const duration = Number.isFinite(parsedDuration) ? Math.min(Math.max(parsedDuration, 1), 24 * 60) : 30;
    const now = new Date();

    const currentDate = formatDateStr(now);
    const startTime = formatClock(now);

    // Real Date arithmetic — correctly rolls over to the next calendar day if the
    // session is started late at night (e.g. 23:50 + 30min = 00:20 the next day).
    // starts_at/expires_at (not the display strings below) are the source of truth.
    const startsAt = now;
    const endsAt = new Date(now.getTime() + duration * 60000);
    const endTime = formatClock(endsAt);

    const sessionId = `${groupId}_${currentDate}_${startTime.replace(":", "")}_manual`;

    await pool.query(
      `INSERT INTO sessions (id, group_id, group_name, date, start_time, end_time, starts_at, expires_at, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)`,
      [sessionId, groupId, groupData.name, currentDate, startTime, endTime, startsAt.toISOString(), endsAt.toISOString(), groupData.createdBy, now.toISOString()]
    );

    res.json({
      success: true,
      message: `Session started manually for ${groupData.name}`,
      session: {
        id: sessionId,
        date: currentDate,
        startTime,
        endTime,
        startsAt: startsAt.toISOString(),
        expiresAt: endsAt.toISOString(),
        status: "active",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Force close a session immediately
app.post("/api/sessions/force-close", requireAuth, async (req, res) => {
  const { sessionId } = req.body;
  const user = (req as any).user as AuthPayload;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const sessResult = await pool.query("SELECT group_id FROM sessions WHERE id = $1", [sessionId]);
    if (sessResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }
    const groupRow = await requireGroupOwner(sessResult.rows[0].group_id, user, res);
    if (!groupRow) return;

    await closeSessionAndGenerateReports(sessionId);
    res.json({ success: true, message: `Session ${sessionId} closed and reports compiled.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to close session." });
  }
});

// 4. Get active session details for a group (public - used by the student check-in page)
app.get("/api/groups/:groupId/active-session", async (req, res) => {
  const { groupId } = req.params;
  try {
    const groupResult = await pool.query("SELECT name, description FROM groups WHERE id = $1", [groupId]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }
    const groupData = groupResult.rows[0];

    const activeResult = await pool.query(
      "SELECT * FROM sessions WHERE group_id = $1 AND status = 'active' LIMIT 1",
      [groupId]
    );

    if (activeResult.rows.length === 0) {
      return res.json({
        hasActiveSession: false,
        group: { name: groupData.name, description: groupData.description },
      });
    }

    const activeSession = rowToSession(activeResult.rows[0]);
    const wasClosed = await closeIfExpired(activeSession);

    if (wasClosed) {
      return res.json({
        hasActiveSession: false,
        group: { name: groupData.name, description: groupData.description },
      });
    }

    res.json({
      hasActiveSession: true,
      session: activeSession,
      group: { name: groupData.name, description: groupData.description },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Submit participant check-in (attendance check-in with photo capture)
app.post("/api/checkin", checkinLimiter, async (req, res) => {
  const { groupId, sessionId, studentId, photoBase64 } = req.body;

  if (!groupId || !sessionId || !studentId || !photoBase64) {
    return res.status(400).json({ error: "All fields are required: groupId, sessionId, studentId, photoBase64" });
  }

  try {
    const sessResult = await pool.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
    if (sessResult.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }
    const sessionData = rowToSession(sessResult.rows[0]);
    if (sessionData.status !== "active" || (await closeIfExpired(sessionData))) {
      return res.status(400).json({ error: "This attendance session has expired. Ask your coordinator to start a new one." });
    }

    const partResult = await pool.query(
      "SELECT * FROM participants WHERE group_id = $1 AND student_id = $2",
      [groupId, studentId]
    );
    if (partResult.rows.length === 0) {
      return res.status(400).json({
        error: `Participant ID "${studentId}" is not registered in this group. Please contact your coordinator.`,
      });
    }
    const participantData = partResult.rows[0];

    const dupResult = await pool.query(
      "SELECT id FROM checkins WHERE session_id = $1 AND student_id = $2",
      [sessionId, studentId]
    );
    if (dupResult.rows.length > 0) {
      return res.status(400).json({ error: "You have already checked in for this session!" });
    }

    const checkinId = `${sessionId}_${studentId}`;
    const timestamp = new Date().toISOString();

    await pool.query(
      `INSERT INTO checkins (id, session_id, group_id, student_id, name, "timestamp", photo_base64)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [checkinId, sessionId, groupId, studentId, participantData.name, timestamp, photoBase64]
    );

    res.json({
      success: true,
      message: `Attendance marked successfully for ${participantData.name}!`,
      participant: { name: participantData.name, studentId },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get QR Code data URL and absolute check-in link for a group
app.get("/api/groups/:groupId/qrcode", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;

  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;

    const appUrl = process.env.APP_URL || `https://${req.get("host")}` || `http://localhost:3000`;
    const checkinUrl = `${appUrl}/checkin/${groupId}`;

    const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
      scale: 10,
      margin: 1,
      color: {
        dark: "#1e293b",
        light: "#ffffff",
      },
    });

    res.json({ qrCodeUrl: qrDataUrl, checkinUrl });
  } catch (err: any) {
    console.error("[qrcode]", err);
    res.status(500).json({ error: "Failed to generate QR code." });
  }
});

// 7. Fetch reports (both daily and cumulative) for a group
app.get("/api/reports/:groupId", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    const dailyResult = await pool.query("SELECT * FROM daily_reports WHERE group_id = $1", [groupId]);

    // Photos are stored once, in `checkins`, never duplicated into report
    // records. Batch-join them back in here for display so old reports still
    // show a photo whenever the underlying check-in still has one (it may
    // have been purged by the 24h photo retention job — see purgeOldPhotos).
    const reportSessionIds = dailyResult.rows.map((r) => r.session_id);
    const photoBySessionAndStudent = new Map<string, string | null>();
    if (reportSessionIds.length > 0) {
      const photoResult = await pool.query(
        "SELECT session_id, student_id, photo_base64 FROM checkins WHERE session_id = ANY($1)",
        [reportSessionIds]
      );
      photoResult.rows.forEach((c) => {
        photoBySessionAndStudent.set(`${c.session_id}::${c.student_id}`, c.photo_base64);
      });
    }

    const daily: any[] = dailyResult.rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      type: "daily",
      date: r.date,
      sessionId: r.session_id,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      stats: r.stats,
      records: (r.records || []).map((rec: any) => ({
        ...rec,
        photoBase64: photoBySessionAndStudent.get(`${r.session_id}::${rec.studentId}`) ?? null,
      })),
    }));

    const activeResult = await pool.query(
      "SELECT * FROM sessions WHERE group_id = $1 AND status = 'active' LIMIT 1",
      [groupId]
    );

    if (activeResult.rows.length > 0) {
      const activeSession = rowToSession(activeResult.rows[0]);
      const sessionId = activeSession.id;

      const partResult = await pool.query(
        "SELECT student_id, name, email FROM participants WHERE group_id = $1",
        [groupId]
      );
      const participantsList = partResult.rows.map((p) => ({
        studentId: p.student_id,
        name: p.name,
        email: p.email || "",
      }));

      const checkinsResult = await pool.query("SELECT * FROM checkins WHERE session_id = $1", [sessionId]);
      const checkinsMap = new Map<string, any>();
      checkinsResult.rows.forEach((c) => {
        checkinsMap.set(c.student_id, {
          timestamp: c.timestamp instanceof Date ? c.timestamp.toISOString() : c.timestamp,
          photoBase64: c.photo_base64,
        });
      });

      let presentCount = 0;
      let absentCount = 0;

      const records = participantsList.map((p) => {
        const checkedIn = checkinsMap.get(p.studentId);
        if (checkedIn) {
          presentCount++;
          return {
            studentId: p.studentId,
            name: p.name,
            email: p.email,
            status: "present",
            timestamp: checkedIn.timestamp,
            photoBase64: checkedIn.photoBase64,
          };
        } else {
          absentCount++;
          return {
            studentId: p.studentId,
            name: p.name,
            email: p.email,
            status: "absent",
            timestamp: null,
            photoBase64: null,
          };
        }
      });

      const total = participantsList.length;
      const percentage = total > 0 ? (presentCount / total) * 100 : 0;

      const liveReport = {
        id: `${sessionId}_daily_live`,
        groupId,
        type: "daily",
        date: activeSession.date,
        sessionId,
        isLive: true,
        createdAt: activeSession.createdAt,
        stats: {
          total,
          present: presentCount,
          absent: absentCount,
          percentage: parseFloat(percentage.toFixed(1)),
        },
        records,
      };

      daily.unshift(liveReport);
    }

    daily.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return b.date.localeCompare(a.date);
    });

    const cumResult = await pool.query("SELECT * FROM cumulative_reports WHERE group_id = $1", [groupId]);
    const cumulative =
      cumResult.rows.length > 0
        ? {
            id: `${groupId}_cumulative`,
            groupId,
            type: "cumulative",
            createdAt:
              cumResult.rows[0].created_at instanceof Date
                ? cumResult.rows[0].created_at.toISOString()
                : cumResult.rows[0].created_at,
            stats: cumResult.rows[0].stats,
            records: cumResult.rows[0].records,
          }
        : null;

    res.json({ daily, cumulative });
  } catch (err: any) {
    console.error("[reports]", err);
    res.status(500).json({ error: "Failed to load reports." });
  }
});

// ==========================================
// VITE DEV SERVER / STATIC ASSETS
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
    console.log("[Vite] Dev middleware integrated.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Express] Production static serving enabled.");
  }

  const host = isProd ? "0.0.0.0" : "localhost";
  app.listen(PORT, host, () => {
    console.log(`[Server] Running on http://${host}:${PORT}`);
  });
}

startServer();
