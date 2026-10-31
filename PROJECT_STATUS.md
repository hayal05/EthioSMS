# EthioSMS project status

## Task 1 — Foundation

Implemented on `feature/task-1-foundation`:

- npm workspace with TypeScript Express API and React/Vite frontend.
- Root scripts and lockfile for reproducible installs, checks, builds, and startup.
- Environment validation and example configuration; secret/build exclusions.
- Database-free liveness and token-protected foundation readiness.
- Public status shell with no fabricated usage or delivery data.
- Mock-only configuration; live SMS settings rejected at startup.
- Tests for configuration safety, readiness authentication, API boundaries, and static routing.
- GitHub Actions workflow for checks, tests, and build.

Validation: clean npm ci, type checks, all 3 backend tests, production build, and production dependency audit passed locally. GitHub CI passed for implementation commit 9723e0a (runs 41224683603 and 41224682866). PR #1 is open for review; main is unchanged. Deployment and live sending are not enabled.

Next: Task 2, versioned database migrations and durable state, after Task 1 CI passes.

## Task 2 — Database and durable state

Implemented on `feature/task-2-database`, stacked on Task 1 (PR #1 remains unmerged):

- Explicit, transactional, checksummed SQL migrations and concurrent-runner locking.
- Tenant-scoped relationships and indexes for accounts, applications, keys, queue, OTP, usage, audit, and retention settings.
- Small PostgreSQL pool with verified remote TLS and safe failure reporting.
- Database readiness behind the existing private token; liveness remains database-free.
- Atomic internal message storage with scoped idempotency and application/tenant-scoped retrieval.
- Required PostgreSQL integration tests in CI; no production database configured.

Local type checks, non-database tests, and build pass. PostgreSQL integration tests passed in GitHub CI (runs 41226177967 and 41226174426) for commit f71c398. Live SMS and deployment remain disabled.

Next: Task 3, invited accounts and administrator setup, after Task 2 CI passes.

## Task 3 — Administrator and invited accounts

Implemented on `feature/task-3-accounts`, stacked on Task 2:

- One-time administrator bootstrap and trusted offline administrator recovery commands.
- Per-invite tenant creation, 24-hour setup/recovery tokens stored as hashes, and password setup.
- Salted scrypt password hashing, fixed 8-hour sessions with hashed tokens, logout, and PostgreSQL-backed attempt limits.
- Session authentication and admin-only user/application administration; account disabling and recovery revoke sessions.
- Basic sign-in/setup and administrator invitation/disable/recovery interface.
- Mutation request protection, private response caching controls, redacted errors, and account audit events.
- PostgreSQL integration coverage for invite expiry/reuse, roles, disabling, recovery, throttling, and logout.

Local type checks, six non-database tests, and production builds passed. PostgreSQL-backed account tests passed in GitHub CI (runs 41226584997 and 41226580952) for implementation commit 6f766b2. Main remains unchanged; nothing is deployed and live SMS is disabled.

Next: Task 4 — developer applications, API keys, and atomic quotas.

## Task 4 — Applications, API keys, and quotas

Implemented on `feature/task-4-api-keys`, stacked on PR #3:

- Tenant-scoped application/key management, administrator approval, and a developer panel.
- Scoped bearer keys shown once, stored as hashes, with atomic rotation/revocation and active-key caps.
- Authenticated bearer usage endpoint with persistent key/application/account/global rate limits.
- Atomic daily segment reservation alongside durable message jobs, using Addis Ababa day boundaries.
- Administrator-configurable limits and destination prefixes; Ethiopian E.164 normalization helpers.
- Tests for tenant isolation, key lifecycle, scope rejection, concurrent rate limits and segment reservations.

Local type checks, seven non-database tests, and production builds pass. PostgreSQL integration checks passed in GitHub CI (runs 41227350781 and 41227346748) for implementation commit 7f00047. No public send endpoint, live SMS, deployment, or merge into main has been enabled.

Next: Task 5 — SMS submission/status API, segment estimation, and mock gateway scenarios.

## Task 5 — Mock SMS submission/status API

Implemented on `feature/task-5-message-api`, stacked on PR #4:

- Scoped POST submission and GET detail/history APIs with bounded cursor pagination.
- Server-side phone/expiry/size validation, GSM-7/Unicode segment estimates, and canonical idempotency fingerprints.
- AES-256-GCM message encryption and keyed request fingerprints; masked content-free responses.
- Atomic calculated-segment reservation integrated with durable submissions.
- Pure mock adapter covering acceptance, rejection, timeout, offline, and delayed outcomes.
- Unit and PostgreSQL API tests for privacy, retries, scopes, history, errors, and quota contention.

No dispatch or live telephony is enabled. Submissions remain queued in mock mode. Dispatch, expiry handling, and usage settlement follow in Task 6.

Next: Task 6 — reliable dispatch and recovery.

Task 5 validation: local type checks, ten non-database tests, and production builds passed. PostgreSQL CI passed for implementation commit 9f46dc5 (runs 41228125771 and 41228122278), covering authenticated submissions, encrypted storage, duplicate retries, scope isolation, history pagination, validation, and concurrent segment quotas. Final cursor validation rejects malformed date formats before querying PostgreSQL.

## Task 6 — Dispatch and recovery
Database claims/leases, bounded retries, conservative unknown outcomes, expiry, per-recipient usage settlement, pause/drain controls, and known-work timers implemented. CI results are recorded in PR #6. No deployment or live sending.

## Task 7 — SMSGate adapter
Targeted cloud adapter, exact live recipient allowlist, explicit live enablement guards, mode-isolated dispatch, authenticated status reconciliation, last successful API-contact tracking, and phone setup guide implemented. CI uses simulated HTTP. Physical phone/live delivery validation remains pending; no credentials or production infrastructure configured.

## Task 8 — OTP service
Purpose/application-bound single-use challenges, cryptographic six-digit codes, independent keyed digests, encrypted queued payloads, expiry/cooldown/attempt limits, recipient/IP limits, atomic quota integration and supersession implemented. Codes never appear in API responses. Queued payloads are erased on settlement/verification exhaustion. CI includes lifecycle and concurrent verification tests.
