# EthioSMS project status

Tasks 1–12 are implemented and merged into main through sequential pull requests. Tasks 1–11 passed CI. Task 12 also passed full PostgreSQL backup/restore/restart checks; its final retention replay regression is recorded in PR #12.

PRs #1–#12 have been merged into main. No Render/Neon service has been created or deployed, and no real SMS has been sent. Physical phone delivery, actual hosting behavior, owner restore rehearsal and the 2–5-user live pilot remain pending. See [acceptance checklist](docs/PILOT_CHECKLIST.md).

| Task | Review | CI | Implementation commit |
|---|---|---|---|
| 1–5 | PRs #1–#5 | Previously verified | See individual PRs |
| 6 | [PR #6](https://github.com/hayal05/EthioSMS/pull/6) | Passed | `5f894d4` |
| 7 | [PR #7](https://github.com/hayal05/EthioSMS/pull/7) | Passed | `8c25035` |
| 8 | [PR #8](https://github.com/hayal05/EthioSMS/pull/8) | Passed | `af30510` |
| 9 | [PR #9](https://github.com/hayal05/EthioSMS/pull/9) | Passed | `53387e6` |
| 10 | [PR #10](https://github.com/hayal05/EthioSMS/pull/10) | Passed | `466722c` |
| 11 | [PR #11](https://github.com/hayal05/EthioSMS/pull/11) | Passed | `63e773c` |
| 12 | [PR #12](https://github.com/hayal05/EthioSMS/pull/12) | Passed (final branch checks in PR) | Final branch head |

Implemented: isolated invited accounts, scoped keys, atomic quotas, encrypted messages, durable dispatch, guarded SMSGate adapter, purpose-bound OTPs, compact dashboards, reviewed campaigns, opt-out suppressions, API/OpenAPI docs, ERP example, retention and deployment runbooks.

Local checks and production builds pass; production dependency audit reported zero vulnerabilities. PostgreSQL suites are mandatory in CI. Headless-browser checks with simulated API responses verified desktop/mobile admin workspace rendering and mock form submission, without JavaScript errors or horizontal mobile overflow. These do not replace deployed-origin or phone tests.

Task 12 CI verifies a queued fixture through PostgreSQL dump/restore and database restart. The owner must still rehearse restoration on an isolated Neon branch. Free hosting does not guarantee OTP timing. Automatic inbound STOP, paid billing/credits, public registration, advanced scheduling, custom Android development and multi-device failover remain deferred.

Retention keeps opaque request identities after content cleanup; old replays return 410 instead of producing duplicate SMS. Expired OTP request metadata cannot generate a fresh code under an old event key. Regression tests cover both cases.

## First-account master admin update
The first-account form now uses email, password and confirmation only. Atomic first-account checks and a unique master-admin database index prevent concurrent duplicate owners. Creation signs the owner in; email login is supported alongside legacy usernames. Existing accounts remain unchanged. Migration 010 is required.
