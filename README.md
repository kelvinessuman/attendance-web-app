# QR Attendance App

University attendance system: coordinators run groups, schedules, and QR check-ins; students check in with a photo; admins only authorize accounts (no operational data access).

## Copyright

Copyright © 2026 [University of Ghana]. All rights reserved.

This project is proprietary software. The source code is not licensed for
public reuse, copying, or redistribution. See the `LICENSE` file for terms.

Unauthorized use or republication of this codebase is prohibited.

**Stack:** Express + React (Vite), PostgreSQL (Supabase), JWT httpOnly cookies, Supabase Storage for check-in photos.

---

## Features

- **Admin** — authorize users, issue temporary passwords, deactivate / reactivate accounts. Cannot see groups, attendance, or reports.
- **Coordinator** — create groups, rosters, schedules, open QR sessions, view reports and check-in photos.
- **Student check-in** — public QR link, student ID + camera photo, rate-limited.
- **Photos** — private Supabase Storage bucket; signed URLs; automatic deletion after 24 hours.
- **Auth** — self-registration and self-service password reset are **disabled**. Accounts are created only by an admin.

---

## Quick start (local)

### 1. Database

Create a Postgres database and load the schema:

```bash
createdb -U postgres attendance_db
psql -U postgres -d attendance_db -f schema.sql
