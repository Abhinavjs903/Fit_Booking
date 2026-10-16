# FitBooking Phase 2 — implementation notes

The current code already has the base booking/session schema, six-digit unique check-in codes, an admin session-close endpoint that changes confirmed bookings to NO_SHOW and upserts ₹20 fines, and an admin endpoint to mark unpaid fines paid or waived.

## Remaining Phase 2 gaps confirmed from main

- Waitlist entries do not model offer status, offered time, expiry time, or response time.
- Cancellation promotes the next waitlisted member immediately instead of issuing an offer.
- Members cannot accept or decline waitlist offers.
- The member booking response/UI does not expose fines.
- The repository README still describes waitlist offers and fine processing as limitations, though a basic session-close implementation exists.

## Proposed safe implementation order

1. Add a `WaitlistOfferStatus` enum and nullable offer timestamps to `WaitlistEntry`; migrate with defaults so pre-existing rows remain valid.
2. Move waitlist advancement into one transaction-safe helper that locks the session, expires stale offers, and issues one 10-minute offer to the oldest eligible entry.
3. Change cancellation to call the helper instead of confirming another booking immediately.
4. Add a member-owned accept/decline endpoint. Accept only a live offer and confirm only while capacity remains; decline/expiry advances the FIFO queue.
5. Return member fine records in an authenticated API and show offer actions and fine status in the member dashboard.
6. Keep no-show marking idempotent and add test coverage for offer expiry, queue advancement, and fine lifecycle.
7. Run lint, TypeScript checking, Prisma schema validation, build, and DB-backed integration tests when a configured PostgreSQL database is available.

## Important verification caveat

This document is an implementation plan only. A container network restriction prevented downloading the GitHub archive into the execution environment during this session, so no full local build or database migration was executed based only on the remote source reads.