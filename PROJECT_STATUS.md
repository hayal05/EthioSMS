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

Local type checks, non-database tests, and build pass. Database integration verification runs against disposable PostgreSQL in CI. Live SMS and deployment remain disabled.

Next: Task 3, invited accounts and administrator setup, after Task 2 CI passes.
