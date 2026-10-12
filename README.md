# FITBOOK — Gym Slot Booking

FITBOOK is a members-only gym session booking app built with Next.js App Router, TypeScript, Tailwind CSS, Prisma 7, and PostgreSQL.

## Features

- Username/password authentication with bcrypt password hashes and an HTTP-only JWT cookie.
- Seed script for one administrator and 50 pre-provisioned member accounts.
- Admin-only hourly session creation (4 AM–11 PM IST), capacity fixed at 20.
- Member session browsing, booking, personal booking history, cancellation, and waitlist.
- PostgreSQL row locking in booking/cancellation flows to serialize changes for a session.
- FIFO waitlist promotion after a cancellation.
- One-time six-digit check-in code generation by an admin and member check-in during the scheduled hour.
- Fine schema for ₹20 no-show fines, including unpaid, paid, and waived statuses.

## Requirements

- Node.js compatible with the installed Next.js version
- PostgreSQL database (Supabase PostgreSQL works)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` in the project root. Do not commit this file.

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
   JWT_SECRET="replace-with-a-long-random-secret"
   SEED_ADMIN_PASSWORD="choose-a-strong-admin-password"
   SEED_MEMBER_PASSWORD="choose-a-temporary-member-password"
   ```

3. Apply migrations and generate Prisma Client:

   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. Seed the administrator and member accounts:

   ```bash
   npx tsx prisma/seed.ts
   ```

5. Start the development server:

   ```bash
   npm run dev
   ```

Open http://localhost:3000.

## Seed accounts

- Administrator username: `admin`
- Member usernames: `member001` through `member050`
- Passwords come from `SEED_ADMIN_PASSWORD` and `SEED_MEMBER_PASSWORD`.
- Seeded members are inactive by default. Activate a member through an authorized admin workflow before they can log in.

Do not put real passwords or database credentials in source control.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Login and set the auth cookie |
| GET | `/api/sessions` | List sessions |
| POST | `/api/admin/sessions` | Admin creates a session |
| GET | `/api/bookings` | Member's bookings and waitlist |
| POST | `/api/bookings` | Book a session or join its waitlist |
| DELETE | `/api/bookings/:bookingId` | Cancel a booking and promote the next waitlisted member |
| POST | `/api/admin/bookings/:bookingId/check-in` | Generate a check-in code during the session hour |
| POST | `/api/bookings/:bookingId/check-in` | Redeem the member's code and mark attendance |

## Quality checks

```bash
npm run lint
npm run build
```

## Current limitations / next steps

- Email OTP delivery and member activation/admin management UI need to be wired to a mail provider and admin workflow.
- Automatic no-show processing and fine waiver APIs still need implementation; the database model is present but the fine lifecycle is not complete.
- Waitlist promotion currently confirms the next member immediately. An email offer with accept/reject and expiry requires additional schema and notification work.
- Add integration tests for concurrent booking requests, ownership checks, capacity, cancellation, check-in and fine processing before production deployment.
