### QR Attendance App

This app now uses a **local PostgreSQL database** for all data storage and a
self-hosted **email/password authentication system** (no Firebase).

## Database name

**`attendance_db`**

## 1. Create the database

```bash
createdb -U postgres -p 5432 attendance_db
```

(If `createdb` isn't on your PATH, use `psql -U postgres -p 5432 -c "CREATE DATABASE attendance_db;"`)

## 2. Load the schema

```bash
psql -U postgres -p 5432 -d attendance_db -f schema.sql
```

This creates the `users`, `groups`, `participants`, `sessions`, `checkins`,
`daily_reports`, and `cumulative_reports` tables.

## 3. Configure connection settings

A `.env` file is already included, pre-filled with:

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=enter_your_password_here
PGDATABASE=attendance_db
JWT_SECRET="please-change-this-to-a-long-random-string"
```

Adjust `PGUSER`/`PGPASSWORD` if your local Postgres uses a different role.

## 4. Install dependencies and run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Auth flow

- **Login**: email + password.
- **Register**: email, full name, password, confirm password.
- **Forgot password**: enter your email → the server checks it exists in the
  database → you set and confirm a new password → the new password is
  hashed and saved against that email.

Sessions are stored as an httpOnly JWT cookie signed with `JWT_SECRET`.

Firebase can be re-added later; all Firebase Auth/Firestore code has been
removed from this project in the meantime.
<<<<<<< HEAD

## Admin-Only Authorization Mode

Self-registration and forgot-password are **disabled**.

### Create the first admin

After applying the schema / migration, promote one account:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your-admin@example.com';
```

Or insert a new admin with a known password (generate a bcrypt hash first):

```bash
node -e "require('bcryptjs').hash('YourStrongPassword', 10).then(console.log)"
```

Then:

```sql
INSERT INTO users (id, email, full_name, password_hash, role, is_active, email_verified)
VALUES ('admin-1', 'admin@example.com', 'System Admin', '<hash>', 'admin', true, true);
```

### Admin behaviour

- Admin logs in → redirected to `/admin` only
- Admin can authorize emails and generate temporary passwords
- Admin can deactivate / reactivate / regenerate passwords
- Admin **cannot** see groups, attendance, reports, or any operational data
=======
>>>>>>> 300b67c1fec30991abb41a87220478d235e06790
