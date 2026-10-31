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

Validation status is recorded in the pull request and CI. Deployment and live sending are not enabled.

Next: Task 2, versioned database migrations and durable state, after Task 1 CI passes.
