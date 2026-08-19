import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { createServer as createViteServer } from "vite";
import QRCode from "qrcode";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// // EXPRESS APP
// const app = express();
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

// General API rate limit: per IP. Higher so a lecture hall on shared campus NAT
// is not blocked while coordinators refresh reports / QR. Still bounds scraping.
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 900,
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

// Check-in is public (QR). Two layers:
// 1) Per IP — high enough for a class behind one campus Wi‑Fi NAT.
// 2) Per studentId — stops one person / bot hammering a single ID.
const checkinLimiterByIp = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many check-in attempts from this network. Please wait a few minutes and try again.",
  },
});

const checkinLimiterByStudent = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  // Body is already parsed (express.json runs before routes). Fall back to IP
  // only if studentId is missing — that request will fail validation anyway.
  keyGenerator: (req) => {
    const raw = req.body?.studentId;
    const id = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (id) return `student:${id}`;
    return `ip:${req.ip || "unknown"}`;
  },
  // Custom key is intentional; do not require IP-based keys.
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: "Too many check-in attempts for this student ID. Please wait a few minutes.",
  },
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
app.use(cookieParser());

// // POSTGRESQL CONNECTION
// 
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

// // CHECK-IN PHOTO STORAGE (filesystem, not DB)
// // Photos live under uploads/checkins/<sessionId>/<studentId>.<ext>.
// The DB only stores the relative path (photo_path). This keeps Postgres
// lean, makes retention a simple unlink, and lets us serve images via a
// protected route instead of stuffing base64 into every report payload.
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");
const CHECKINS_UPLOAD_DIR = path.join(UPLOADS_ROOT, "checkins");

async function ensureUploadDirs() {
  await fsp.mkdir(CHECKINS_UPLOAD_DIR, { recursive: true });
}

/** Map a data-URL mime to a safe file extension. */
function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg"; // jpeg / jpg / default
}

/**
 * Decode a data:image/...;base64,... payload and write it under
 * uploads/checkins/<sessionId>/. Returns the relative path stored in the DB
 * (posix-style, e.g. "checkins/<sessionId>/<studentId>.jpg").
 */
async function saveCheckinPhoto(
  sessionId: string,
  studentId: string,
  photoDataUrl: string
): Promise<string> {
  const match = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i.exec(photoDataUrl);
  if (!match) {
    throw new Error("Invalid photo data URL");
  }
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const b64 = match[3];
  const buf = Buffer.from(b64, "base64");
  // Soft size guard after decode (~750KB). Matches the pre-decode length check on the endpoint.
  if (buf.length > 750_000) {
    throw new Error("Photo is too large after decode");
  }

  // sessionId / studentId come from our own IDs or uppercased student IDs — still
  // sanitize so a malicious studentId cannot escape the uploads tree.
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeStudent = studentId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = extensionForMime(mime);
  const dir = path.join(CHECKINS_UPLOAD_DIR, safeSession);
  await fsp.mkdir(dir, { recursive: true });
  const filename = `${safeStudent}.${ext}`;
  const absPath = path.join(dir, filename);
  await fsp.writeFile(absPath, buf);
  // Relative path always uses forward slashes for portability in the DB.
  return `checkins/${safeSession}/${filename}`;
}

/** Resolve a stored relative photo_path to an absolute path under UPLOADS_ROOT. Rejects traversal. */
function resolvePhotoPath(relativePath: string): string | null {
  if (!relativePath || relativePath.includes("..") || path.isAbsolute(relativePath)) {
    return null;
  }
  const abs = path.resolve(UPLOADS_ROOT, relativePath);
  if (!abs.startsWith(path.resolve(UPLOADS_ROOT) + path.sep) && abs !== path.resolve(UPLOADS_ROOT)) {
    return null;
  }
  return abs;
}

async function deletePhotoFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const abs = resolvePhotoPath(relativePath);
  if (!abs) return;
  try {
    await fsp.unlink(abs);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.error("[Photo] Failed to delete", relativePath, err);
    }
  }
}

/** Build the authenticated URL a coordinator uses to view a check-in photo. */
function photoUrlFor(groupId: string, sessionId: string, studentId: string): string {
  return `/api/groups/${encodeURIComponent(groupId)}/photos/${encodeURIComponent(sessionId)}/${encodeURIComponent(studentId)}`;
}

// // EMAIL (verification + password reset)
// // Uses Resend's plain HTTP API (https://resend.com) so no extra SDK/dependency
// is needed - just fetch. Set RESEND_API_KEY and EMAIL_FROM to enable actually
// sending mail. Any similar transactional-email provider's HTTP API would
// slot in here just as easily.
const EMAIL_ENABLED = !!process.env.RESEND_API_KEY;
if (!EMAIL_ENABLED) {
  console.warn(
    "\n[Email] RESEND_API_KEY is not set - email verification and password-reset emails are disabled.\n" +
    "  New accounts will be auto-verified and 'forgot password' will not be able to send reset links\n" +
    "  until this is configured. Set RESEND_API_KEY and EMAIL_FROM to enable both.\n"
  );
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!EMAIL_ENABLED) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[Email] Send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Send error:", err);
    return false;
  }
}

// Generates a long, cryptographically random, single-use token and stores it
// with an expiry. Used for both email verification and password reset links -
// this is what actually proves the requester controls the inbox, unlike just
// knowing the email address.
async function createAuthToken(userId: string, purpose: "verify_email" | "password_reset", ttlMinutes: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60000);
  await pool.query(
    "INSERT INTO auth_tokens (token, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4)",
    [token, userId, purpose, expiresAt.toISOString()]
  );
  return token;
}

/** Validates and consumes a token; returns the associated user_id or null. */
async function consumeAuthToken(token: string, purpose: "verify_email" | "password_reset"): Promise<string | null> {
  const result = await pool.query(
    `SELECT user_id, expires_at, used FROM auth_tokens WHERE token = $1 AND purpose = $2`,
    [token, purpose]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.used || new Date(row.expires_at).getTime() < Date.now()) return null;
  await pool.query("UPDATE auth_tokens SET used = true WHERE token = $1", [token]);
  return row.user_id;
}

function getAppUrl(req: express.Request): string {
  return process.env.APP_URL || `https://${req.get("host")}` || "http://localhost:3000";
}

// // AUTH HELPERS
// const INSECURE_DEFAULT_JWT_SECRET = "dev-only-insecure-secret-change-me";
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
  role: "admin" | "user";
}

// Short session for shared lab/office laptops. Change to 2 for a tighter window.
const SESSION_HOURS = 5;

function signToken(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
}

function setAuthCookie(res: express.Response, payload: AuthPayload) {
  const token = signToken(payload);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd, // requires HTTPS in production; disabled for local http:// dev
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
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


function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as AuthPayload | undefined;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only." });
  }
  next();
}

function generateTempPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "Tmp-";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
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

/**
 * Best-effort audit write. Never throws to callers — logging must not break
 * the primary action if the audit table is missing or the insert fails.
 */
async function writeAuditLog(opts: {
  actor?: AuthPayload | null;
  action: string;
  groupId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  detail?: Record<string, unknown>;
  req?: express.Request;
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (id, actor_user_id, actor_email, action, group_id, entity_type, entity_id, detail, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        genId(),
        opts.actor?.id ?? null,
        opts.actor?.email ?? null,
        opts.action,
        opts.groupId ?? null,
        opts.entityType ?? null,
        opts.entityId ?? null,
        JSON.stringify(opts.detail ?? {}),
        opts.req?.ip ?? null,
      ]
    );
  } catch (err) {
    console.error("[audit]", err);
  }
}

// University of Ghana emails by default. Override with ALLOWED_EMAIL_DOMAINS
// (comma-separated). Set to empty only if you intentionally want open registration.
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "ug.edu.gh,st.ug.edu.gh")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isAllowedEmailDomain(email: string): boolean {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true; // no restriction configured
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

// // AUTH ENDPOINTS
// 
// Register: email, full name, password, confirm password
app.post("/api/auth/register", authLimiter, async (_req, res) => {
  return res.status(403).json({
    error: "Self-registration is disabled. Contact your administrator to request access.",
  });
});

app.get("/api/auth/verify-email", async (req, res) => {
  const token = String(req.query.token || "");
  const appUrl = getAppUrl(req);
  if (!token) return res.redirect(`${appUrl}/?emailVerified=0`);
  try {
    const userId = await consumeAuthToken(token, "verify_email");
    if (!userId) return res.redirect(`${appUrl}/?emailVerified=0`);
    await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
    res.redirect(`${appUrl}/?emailVerified=1`);
  } catch (err) {
    console.error("[verify-email]", err);
    res.redirect(`${appUrl}/?emailVerified=0`);
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
      "SELECT id, email, full_name, password_hash, email_verified, role, is_active, temp_password, password_expires_at FROM users WHERE email = $1",
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

    if (!user.email_verified) {
      return res.status(403).json({
        error: "Please verify your email before logging in. Check your inbox for the verification link we sent when you registered.",
      });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: "This account has been deactivated. Contact your administrator." });
    }
    if (user.password_expires_at && new Date(user.password_expires_at) < new Date()) {
      return res.status(403).json({ error: "Your temporary password has expired. Contact your administrator for a new one." });
    }

    const payload: AuthPayload = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: (user.role === "admin" ? "admin" : "user") as "admin" | "user",
    };
    setAuthCookie(res, payload);
    res.json({ success: true, user: payload });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to log in." });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
  });
  res.json({ success: true });
});

// Current session
// Public, non-sensitive client config - currently just whether registration
// is restricted to specific email domains, so the register form can show the
// requirement upfront instead of only after a rejected submission.
app.get("/api/config", (req, res) => {
  res.json({ allowedEmailDomains: ALLOWED_EMAIL_DOMAINS });
});

// Liveness / readiness for Render, load balancers, and uptime monitors.
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      db: "up",
      timezone: APP_TIMEZONE,
      time: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      db: "down",
      error: "Database unreachable",
      time: new Date().toISOString(),
    });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: (req as any).user });
});

// Forgot password - step 1: request a reset link. Always responds with the
// same generic message regardless of whether the email has an account, so
// this can't be used to enumerate registered emails either.
app.post("/api/auth/forgot-password/request", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const genericResponse = {
    success: true,
    message: "If an account exists for that email, we've sent a password reset link to it.",
  };

  try {
    const result = await pool.query("SELECT id, full_name FROM users WHERE email = $1", [normalizedEmail]);
    if (result.rows.length > 0 && EMAIL_ENABLED) {
      const { id, full_name } = result.rows[0];
      const token = await createAuthToken(id, "password_reset", 30);
      const resetUrl = `${getAppUrl(req)}/reset-password?token=${token}`;
      await sendEmail(
        normalizedEmail,
        "Reset your password — QR Attendance System",
        `<p>Hi ${full_name},</p>
         <p>Click below to choose a new password. This link expires in 30 minutes and can only be used once.</p>
         <p><a href="${resetUrl}">${resetUrl}</a></p>
         <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>`
      );
    }
    // Same response whether or not the account exists, or whether email is
    // even configured - the response itself must never reveal that.
    res.json(genericResponse);
  } catch (err: any) {
    console.error(err);
    // Still return the generic message - don't let an internal error leak
    // account-existence info via a different response shape either.
    res.json(genericResponse);
  }
});
// Forgot password - step 2: consume the emailed token and set a new password.
// The token is the proof of inbox ownership; knowing the email address alone
// is no longer sufficient to reset someone else's account.
app.post("/api/auth/forgot-password/reset", authLimiter, async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;
  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Reset link, new password, and confirm password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirm password do not match." });
  }

  try {
    const userId = await consumeAuthToken(token, "password_reset");
    if (!userId) {
      return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2", [passwordHash, userId]);
    // Invalidate any other outstanding reset tokens for this account.
    await pool.query("UPDATE auth_tokens SET used = true WHERE user_id = $1 AND purpose = 'password_reset'", [userId]);

    res.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password." });
  }
});



// ==========================================
// ADMIN AUTHORIZATION ENDPOINTS
// Admin is a pure authorizer — no operational data access
// ==========================================

app.post("/api/admin/authorize", requireAuth, requireAdmin, async (req, res) => {
  const admin = (req as any).user as AuthPayload;
  const { email, fullName } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: "Email is required." });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const existing = await pool.query("SELECT id, role FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const tempPassword = generateTempPassword(10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const id = genId();
    const name = (fullName && String(fullName).trim()) || normalizedEmail.split("@")[0];

    await pool.query(
      `INSERT INTO users (id, email, full_name, password_hash, role, is_active, temp_password, email_verified, created_by_admin)
       VALUES ($1, $2, $3, $4, 'user', true, true, true, $5)`,
      [id, normalizedEmail, name, passwordHash, admin.id]
    );

    await pool.query(
      `INSERT INTO admin_password_logs (id, user_id, generated_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [genId(), id, admin.id, "Initial authorization"]
    );

    res.json({
      success: true,
      email: normalizedEmail,
      temporaryPassword: tempPassword,
      message: "User authorized. Share the temporary password securely. It will not be shown again.",
    });
  } catch (err: any) {
    console.error("[admin/authorize]", err);
    res.status(500).json({ error: "Failed to authorize user." });
  }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, is_active, temp_password, created_at, password_expires_at
       FROM users
       WHERE role = 'user'
       ORDER BY created_at DESC`
    );
    const users = result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      isActive: r.is_active,
      tempPassword: r.temp_password,
      createdAt: r.created_at,
      passwordExpiresAt: r.password_expires_at,
    }));
    res.json({ users });
  } catch (err: any) {
    console.error("[admin/users]", err);
    res.status(500).json({ error: "Failed to load users." });
  }
});

app.post("/api/admin/deactivate/:userId", requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1 AND role = 'user' RETURNING email`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ success: true, email: result.rows[0].email });
  } catch (err: any) {
    console.error("[admin/deactivate]", err);
    res.status(500).json({ error: "Failed to deactivate user." });
  }
});

app.post("/api/admin/reactivate/:userId", requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = true WHERE id = $1 AND role = 'user' RETURNING email`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ success: true, email: result.rows[0].email });
  } catch (err: any) {
    console.error("[admin/reactivate]", err);
    res.status(500).json({ error: "Failed to reactivate user." });
  }
});

app.post("/api/admin/regenerate/:userId", requireAuth, requireAdmin, async (req, res) => {
  const admin = (req as any).user as AuthPayload;
  const { userId } = req.params;
  try {
    const existing = await pool.query(
      `SELECT id, email FROM users WHERE id = $1 AND role = 'user'`,
      [userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const tempPassword = generateTempPassword(10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await pool.query(
      `UPDATE users SET password_hash = $1, temp_password = true, is_active = true WHERE id = $2`,
      [passwordHash, userId]
    );
    await pool.query(
      `INSERT INTO admin_password_logs (id, user_id, generated_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [genId(), userId, admin.id, "Password regenerated"]
    );

    res.json({
      success: true,
      email: existing.rows[0].email,
      temporaryPassword: tempPassword,
    });
  } catch (err: any) {
    console.error("[admin/regenerate]", err);
    res.status(500).json({ error: "Failed to regenerate password." });
  }
});


// // // GROUP MANAGEMENT ENDPOINTS (require login)
// 
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
    console.error("[groups list]", err);
    res.status(500).json({ error: "Failed to load groups." });
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
    await writeAuditLog({
      actor: user,
      action: "group.create",
      groupId: id,
      entityType: "group",
      entityId: id,
      detail: { name: String(name).trim() },
      req,
    });

    res.json({
      success: true,
      group: { id, name: String(name).trim(), description: String(description || "").trim(), createdBy: user.id, createdAt, schedules: [] },
    });
  } catch (err: any) {
    console.error("[groups create]", err);
    res.status(500).json({ error: "Failed to create group." });
  }
});

// Delete a group and everything under it (participants, sessions, checkins,
// reports) via the schema's ON DELETE CASCADE foreign keys. Irreversible -
// the frontend is expected to confirm with the user before calling this.
app.delete("/api/groups/:groupId", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;

    // Remove photo files before rows are deleted.
    const photos = await pool.query(
      `SELECT photo_path FROM checkins WHERE group_id = $1 AND photo_path IS NOT NULL`,
      [groupId]
    );
    for (const row of photos.rows) {
      await deletePhotoFile(row.photo_path);
    }

    const groupName = groupRow.name;
    await pool.query("DELETE FROM daily_reports WHERE group_id = $1", [groupId]);
    await pool.query("DELETE FROM cumulative_reports WHERE group_id = $1", [groupId]);
    await pool.query("DELETE FROM groups WHERE id = $1", [groupId]);
    await writeAuditLog({
      actor: user,
      action: "group.delete",
      groupId,
      entityType: "group",
      entityId: groupId,
      detail: { name: groupName },
      req,
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[groups delete]", err);
    res.status(500).json({ error: "Failed to delete group." });
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

// Bulk-register participants from a JSON array (CSV is parsed on the client).
// Body: { participants: [{ studentId, name, email? }, ...] }
// Caps at 500 rows per request. Skips duplicates (existing or within the batch).
app.post("/api/groups/:groupId/participants/bulk", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  const rows = req.body?.participants;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty participants array." });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: "Maximum 500 participants per bulk import." });
  }

  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;

    const existing = await pool.query(
      "SELECT student_id FROM participants WHERE group_id = $1",
      [groupId]
    );
    const existingIds = new Set(existing.rows.map((r) => String(r.student_id).toUpperCase()));
    const seenInBatch = new Set<string>();

    const added: any[] = [];
    const skipped: Array<{ studentId: string; reason: string }> = [];
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const studentId = String(raw.studentId || raw.student_id || "").trim().toUpperCase();
      const name = String(raw.name || "").trim();
      const email = String(raw.email || "").trim();

      if (!studentId || !name) {
        errors.push({ row: i + 1, reason: "Student ID and Full Name are required." });
        continue;
      }
      if (existingIds.has(studentId) || seenInBatch.has(studentId)) {
        skipped.push({
          studentId,
          reason: existingIds.has(studentId)
            ? "Already registered in this group"
            : "Duplicate ID in this import file",
        });
        continue;
      }

      const id = genId();
      const registeredAt = new Date().toISOString();
      try {
        await pool.query(
          "INSERT INTO participants (id, group_id, student_id, name, email, registered_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [id, groupId, studentId, name, email, registeredAt]
        );
        existingIds.add(studentId);
        seenInBatch.add(studentId);
        added.push({ id, studentId, name, email, registeredAt });
      } catch (insertErr: any) {
        // Race / unique constraint — treat as skip
        if (insertErr?.code === "23505") {
          skipped.push({ studentId, reason: "Already registered in this group" });
        } else {
          errors.push({ row: i + 1, reason: "Database insert failed." });
          console.error("[bulk participants]", insertErr);
        }
      }
    }

    await writeAuditLog({
      actor: user,
      action: "participants.bulk_import",
      groupId,
      entityType: "group",
      entityId: groupId,
      detail: { added: added.length, skipped: skipped.length, errors: errors.length },
      req,
    });

    res.json({
      success: true,
      added: added.length,
      skipped: skipped.length,
      errors: errors.length,
      participants: added,
      skippedDetails: skipped.slice(0, 50),
      errorDetails: errors.slice(0, 50),
    });
  } catch (err: any) {
    console.error("[participants bulk]", err);
    res.status(500).json({ error: "Failed to bulk-register participants." });
  }
});

// // ROW MAPPERS
// ROW MAPPERS
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

// // TIME WINDOW HELPERS (APP_TIMEZONE-aware)
// // Schedules are interpreted in APP_TIMEZONE (default Africa/Accra for UG),
// not the host machine's local zone. starts_at / expires_at remain real UTC
// instants so expiry checks are unambiguous everywhere.

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Accra";

function getZonedParts(date: Date, timeZone: string = APP_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  // hour12:false can still yield "24" for midnight in some engines — normalize.
  let hour = map.hour || "00";
  if (hour === "24") hour = "00";
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute || "00",
    weekday: map.weekday || "Monday",
  };
}

/** Wall-clock date/time/day for `now` in APP_TIMEZONE. */
function nowInAppTimezone(now: Date = new Date()) {
  const p = getZonedParts(now);
  return {
    dateStr: `${p.year}-${p.month}-${p.day}`,
    timeStr: `${p.hour}:${p.minute}`,
    dayOfWeek: p.weekday,
  };
}

/**
 * Interprets YYYY-MM-DD + HH:MM as a wall time in APP_TIMEZONE and returns
 * the corresponding UTC Date. Uses iterative correction via Intl (no extra deps).
 */
function combineDateAndTime(dateStr: string, timeStr: string, timeZone: string = APP_TIMEZONE): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const y = year || 1970;
  const m = month || 1;
  const d = day || 1;
  const h = hour || 0;
  const min = minute || 0;

  // Initial guess: treat wall time as UTC, then correct toward the target zone.
  let guess = new Date(Date.UTC(y, m - 1, d, h, min, 0, 0));
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(guess, timeZone);
    const asUtcMs = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute)
    );
    const wantedMs = Date.UTC(y, m - 1, d, h, min);
    const delta = wantedMs - asUtcMs;
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

/**
 * Computes the real start/end instants for a schedule slot on a given date
 * in APP_TIMEZONE, rolling the end to the next calendar day if the slot
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

/** Display clock/date strings in APP_TIMEZONE (for session labels). */
const formatClock = (d: Date) => {
  const p = getZonedParts(d);
  return `${p.hour}:${p.minute}`;
};
const formatDateStr = (d: Date) => {
  const p = getZonedParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/**
 * Close every active session for a group (optionally except one id).
 * Used so a group never has more than one live QR window at a time — the
 * public active-session API and check-in flow assume a single live session.
 */
async function closeActiveSessionsForGroup(groupId: string, exceptSessionId?: string) {
  const result = exceptSessionId
    ? await pool.query(
        `SELECT id FROM sessions WHERE group_id = $1 AND status = 'active' AND id <> $2`,
        [groupId, exceptSessionId]
      )
    : await pool.query(
        `SELECT id FROM sessions WHERE group_id = $1 AND status = 'active'`,
        [groupId]
      );
  for (const row of result.rows) {
    await closeSessionAndGenerateReports(row.id);
  }
}

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

// // SCHEDULER IMPLEMENTATION
// 
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

  // Note: records intentionally do NOT embed photo data — photos live on disk
  // (photo_path on checkins). The reports endpoint builds photoUrl when a
  // report is viewed, so image bytes are never duplicated into report JSON.
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

interface SchedulerLogEntry {
  groupId: string | null; // null = system-level entry, not about a specific group
  message: string;
}

async function runSchedulerLogic(): Promise<SchedulerLogEntry[]> {
  const log: SchedulerLogEntry[] = [];
  const now = new Date();
  const { dateStr: currentDate, timeStr: currentTime, dayOfWeek: currentDay } = nowInAppTimezone(now);

  log.push({
    groupId: null,
    message: `Scheduler run: ${currentDate} ${currentTime} (${currentDay}, TZ=${APP_TIMEZONE})`,
  });

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
          // Wall times interpreted in APP_TIMEZONE; overnight slots supported.
          const { startsAt, endsAt } = computeSessionWindow(currentDate, startTime, endTime);
          const nowMs = now.getTime();
          if (nowMs >= startsAt.getTime() && nowMs < endsAt.getTime()) {
            const existing = await pool.query(
              "SELECT id FROM sessions WHERE group_id = $1 AND date = $2 AND start_time = $3",
              [groupId, currentDate, startTime]
            );

            if (existing.rows.length === 0) {
              // One live session per group: close any other active windows first.
              await closeActiveSessionsForGroup(groupId);
              const sessionId = genId();
              await pool.query(
                `INSERT INTO sessions (id, group_id, group_name, date, start_time, end_time, starts_at, expires_at, status, created_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)`,
                [sessionId, groupId, groupName, currentDate, startTime, endTime, startsAt.toISOString(), endsAt.toISOString(), groupData.createdBy, new Date().toISOString()]
              );
              log.push({ groupId, message: `Auto-started session for "${groupName}" (${startTime} - ${endTime}, expires ${endsAt.toISOString()})` });
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
        log.push({ groupId: sessData.groupId, message: `Auto-closed expired session ${sessData.id} for "${sessData.groupName}"` });
      }
    }
  } catch (err: any) {
    // Full detail server-side only - a raw error string is not safe to hand
    // back to whichever client happened to trigger this run.
    console.error("Scheduler run error:", err);
    log.push({ groupId: null, message: "An error occurred during this scheduler run. See server logs for details." });
  }

  return log;
}
// Background scheduler tick. For multi-instance production, set
// DISABLE_INTERNAL_SCHEDULER=1 and hit POST /api/scheduler/trigger from an
// external cron (one place only) so sessions are not double-opened.
const DISABLE_INTERNAL_SCHEDULER = process.env.DISABLE_INTERNAL_SCHEDULER === "1";
if (!DISABLE_INTERNAL_SCHEDULER) {
  setInterval(async () => {
    console.log("[Scheduler] Executing automatic check...");
    await runSchedulerLogic();
  }, 60000);
} else {
  console.warn(
    "[Scheduler] Internal timer disabled (DISABLE_INTERNAL_SCHEDULER=1). " +
      "Drive opens/closes via external cron → POST /api/scheduler/trigger."
  );
}

// // PHOTO RETENTION
// // Check-in photos are only needed briefly, to let a coordinator visually spot-
// check a live/recent session. Files live on disk; the DB only holds photo_path.
// After PHOTO_RETENTION_HOURS we unlink the file and null the path. Attendance
// status/timestamp/name are untouched — reports still work, they just stop
// showing a photo for older check-ins.
const PHOTO_RETENTION_HOURS = 24;

async function purgeOldPhotos() {
  try {
    const old = await pool.query(
      `SELECT id, photo_path FROM checkins
       WHERE photo_path IS NOT NULL AND "timestamp" < now() - interval '${PHOTO_RETENTION_HOURS} hours'`
    );
    if (old.rows.length === 0) return;

    for (const row of old.rows) {
      await deletePhotoFile(row.photo_path);
    }

    const ids = old.rows.map((r) => r.id);
    await pool.query(
      `UPDATE checkins SET photo_path = NULL WHERE id = ANY($1)`,
      [ids]
    );
    console.log(`[Photo retention] Cleared ${ids.length} check-in photo(s) older than ${PHOTO_RETENTION_HOURS}h.`);
  } catch (err) {
    console.error("[Photo retention] Failed to purge old photos:", err);
  }
}

// Runs once shortly after boot, then every 30 minutes. Hourly-ish granularity
// is plenty for a 24h retention window and avoids scanning the table every
// single scheduler tick.
setTimeout(purgeOldPhotos, 15000);
setInterval(purgeOldPhotos, 30 * 60 * 1000);

// // PUBLIC / ATTENDANCE API ENDPOINTS
// 
// 1. Trigger Scheduler manually
app.post("/api/scheduler/trigger", requireAuth, async (req, res) => {
  const user = (req as any).user as AuthPayload;
  try {
    const fullLog = await runSchedulerLogic();
    const myGroups = await pool.query("SELECT id FROM groups WHERE created_by = $1", [user.id]);
    const myGroupIds = new Set(myGroups.rows.map((r) => r.id));
    // The sweep itself must run globally (it's what opens/closes everyone's
    // sessions on schedule), but the response only ever shows entries the
    // caller is entitled to see - their own groups, plus non-group-specific
    // system lines. Other coordinators' group names never reach the client.
    const visibleLog = fullLog
      .filter((entry) => entry.groupId === null || myGroupIds.has(entry.groupId))
      .map((entry) => entry.message);
    res.json({ success: true, log: visibleLog });
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
    // Cap at 3 hours — long enough for a class block, short enough to limit open QR windows.
    const duration = Number.isFinite(parsedDuration) ? Math.min(Math.max(parsedDuration, 1), 180) : 30;
    const now = new Date();

    const currentDate = formatDateStr(now);
    const startTime = formatClock(now);

    // Real Date arithmetic — correctly rolls over to the next calendar day if the
    // session is started late at night (e.g. 23:50 + 30min = 00:20 the next day).
    // starts_at/expires_at (not the display strings below) are the source of truth.
    const startsAt = now;
    const endsAt = new Date(now.getTime() + duration * 60000);
    const endTime = formatClock(endsAt);

    // One live session per group. UUID id — not guessable from group/date/time.
    await closeActiveSessionsForGroup(groupId);
    const sessionId = genId();

    await pool.query(
      `INSERT INTO sessions (id, group_id, group_name, date, start_time, end_time, starts_at, expires_at, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)`,
      [sessionId, groupId, groupData.name, currentDate, startTime, endTime, startsAt.toISOString(), endsAt.toISOString(), groupData.createdBy, now.toISOString()]
    );

    await writeAuditLog({
      actor: user,
      action: "session.force_start",
      groupId,
      entityType: "session",
      entityId: sessionId,
      detail: { durationMinutes: duration, expiresAt: endsAt.toISOString() },
      req,
    });

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
    console.error("[force-start]", err);
    res.status(500).json({ error: "Failed to start session." });
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
    await writeAuditLog({
      actor: user,
      action: "session.force_close",
      groupId: sessResult.rows[0].group_id,
      entityType: "session",
      entityId: sessionId,
      req,
    });
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
    console.error("[active-session]", err);
    res.status(500).json({ error: "Failed to check session status." });
  }
});

// 5. Submit participant check-in (attendance check-in with photo capture)
app.post("/api/checkin", checkinLimiterByIp, checkinLimiterByStudent, async (req, res) => {
  const { groupId, sessionId, photoBase64 } = req.body;
  // Normalize the same way registration does so "stu1001" matches "STU1001".
  const studentId = typeof req.body.studentId === "string" ? req.body.studentId.trim().toUpperCase() : "";

  if (!groupId || !sessionId || !studentId || !photoBase64) {
    return res.status(400).json({ error: "All fields are required: groupId, sessionId, studentId, photoBase64" });
  }

  // Reject non-image payloads and oversized base64 (roughly > ~750KB decoded).
  if (typeof photoBase64 !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(photoBase64)) {
    return res.status(400).json({ error: "Photo must be a JPEG, PNG, or WebP data URL." });
  }
  if (photoBase64.length > 1_000_000) {
    return res.status(400).json({ error: "Photo is too large. Please retake with lower quality." });
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

    // Session must belong to the group the student is checking into.
    if (sessionData.groupId !== groupId) {
      return res.status(400).json({ error: "Session does not belong to this group." });
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

    let photoPath: string;
    try {
      photoPath = await saveCheckinPhoto(sessionId, studentId, photoBase64);
    } catch (photoErr: any) {
      console.error("[checkin] photo save failed:", photoErr);
      return res.status(400).json({
        error: photoErr?.message?.includes("too large")
          ? "Photo is too large. Please retake with lower quality."
          : "Could not process photo. Please retake and try again.",
      });
    }

    const checkinId = `${sessionId}_${studentId}`;
    const timestamp = new Date().toISOString();

    await pool.query(
      `INSERT INTO checkins (id, session_id, group_id, student_id, name, "timestamp", photo_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [checkinId, sessionId, groupId, studentId, participantData.name, timestamp, photoPath]
    );

    res.json({
      success: true,
      message: `Attendance marked successfully for ${participantData.name}!`,
      participant: { name: participantData.name, studentId },
    });
  } catch (err: any) {
    console.error("[checkin]", err);
    res.status(500).json({ error: "Failed to record check-in." });
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
// Pass ?photos=1 to include photo URLs for historical check-ins.
// Live active-session photos are always included when a session is open.
// Photos are served from disk via GET /api/groups/:groupId/photos/... (not embedded as base64).
app.get("/api/reports/:groupId", requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const user = (req as any).user as AuthPayload;
  const includeHistoricalPhotos = req.query.photos === "1";
  try {
    const groupRow = await requireGroupOwner(groupId, user, res);
    if (!groupRow) return;
    const dailyResult = await pool.query("SELECT * FROM daily_reports WHERE group_id = $1", [groupId]);

    // photo_path is stored on checkins. We only expose a URL when the file still exists
    // (path non-null). The browser then fetches the image via the protected photo route.
    const photoPathByKey = new Map<string, string | null>();
    if (includeHistoricalPhotos) {
      const reportSessionIds = dailyResult.rows.map((r) => r.session_id);
      if (reportSessionIds.length > 0) {
        const photoResult = await pool.query(
          "SELECT session_id, student_id, photo_path FROM checkins WHERE session_id = ANY($1)",
          [reportSessionIds]
        );
        photoResult.rows.forEach((c) => {
          photoPathByKey.set(`${c.session_id}::${c.student_id}`, c.photo_path);
        });
      }
    }

    const daily: any[] = dailyResult.rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      type: "daily",
      date: r.date,
      sessionId: r.session_id,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      stats: r.stats,
      records: (r.records || []).map((rec: any) => {
        const pPath = includeHistoricalPhotos
          ? photoPathByKey.get(`${r.session_id}::${rec.studentId}`) ?? null
          : null;
        return {
          ...rec,
          photoUrl: pPath ? photoUrlFor(groupId, r.session_id, rec.studentId) : null,
          // Legacy field kept null so older UI code that only looked at photoBase64
          // simply shows "Photo expired" rather than a broken data URL.
          photoBase64: null,
        };
      }),
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
          photoPath: c.photo_path,
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
            photoUrl: checkedIn.photoPath
              ? photoUrlFor(groupId, sessionId, p.studentId)
              : null,
            photoBase64: null,
          };
        } else {
          absentCount++;
          return {
            studentId: p.studentId,
            name: p.name,
            email: p.email,
            status: "absent",
            timestamp: null,
            photoUrl: null,
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

// 8. Serve a check-in photo from disk (owner only). Same-origin <img> tags send the auth cookie.
app.get(
  "/api/groups/:groupId/photos/:sessionId/:studentId",
  requireAuth,
  async (req, res) => {
    const { groupId, sessionId, studentId } = req.params;
    const user = (req as any).user as AuthPayload;
    try {
      const groupRow = await requireGroupOwner(groupId, user, res);
      if (!groupRow) return;

      const normalizedStudentId = String(studentId).trim().toUpperCase();
      const result = await pool.query(
        `SELECT photo_path FROM checkins
         WHERE group_id = $1 AND session_id = $2 AND student_id = $3`,
        [groupId, sessionId, normalizedStudentId]
      );
      if (result.rows.length === 0 || !result.rows[0].photo_path) {
        return res.status(404).json({ error: "Photo not found or has expired." });
      }

      const abs = resolvePhotoPath(result.rows[0].photo_path);
      if (!abs || !fs.existsSync(abs)) {
        return res.status(404).json({ error: "Photo file missing." });
      }

      const ext = path.extname(abs).toLowerCase();
      const contentType =
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      fs.createReadStream(abs).pipe(res);
    } catch (err: any) {
      console.error("[photo serve]", err);
      res.status(500).json({ error: "Failed to load photo." });
    }
  }
);

// // VITE DEV SERVER / STATIC ASSETS
// 
/**
 * Lightweight migration runner: applies migrations/*.sql in lexical order once.
 * Tracks applied files in schema_migrations. Safe to run on every boot.
 * For production multi-instance deploys, prefer a single migrate job before
 * scaling up — concurrent applies rely on IF NOT EXISTS / idempotent SQL.
 */
async function applyMigrations() {
  const migrationsDir = path.join(process.cwd(), "migrations");
  let files: string[] = [];
  try {
    files = (await fsp.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.warn("[Migrations] No migrations/ directory — skipping.");
      return;
    }
    throw err;
  }

  // Ensure bookkeeping table exists even before 001 runs (so we can record 001).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const already = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (already.rows.length > 0) continue;

    const sql = await fsp.readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[Migrations] Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[Migrations] Failed on ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

async function startServer() {
  await ensureUploadDirs();
  console.log(`[Photos] Storing check-in images under ${CHECKINS_UPLOAD_DIR}`);
  console.log(`[Timezone] Schedules use APP_TIMEZONE=${APP_TIMEZONE}`);

  try {
    await applyMigrations();
  } catch (err) {
    console.error("[Migrations] Startup migration failed — fix DB and restart.", err);
    // Continue serving in dev so local work isn't blocked; production should fail loud.
    if (isProd) process.exit(1);
  }

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
