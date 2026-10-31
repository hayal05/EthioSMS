# Pilot acceptance record

## Implemented and covered by automated verification

- [x] Versioned transactional migrations; tenant/application ownership constraints.
- [x] Invitations, roles, disable/recovery, scoped keys, rotation/revocation.
- [x] Request limits and concurrent segment reservations without overspending.
- [x] GSM-7/Amharic/emoji estimation, encrypted payloads, masked API history.
- [x] Stable idempotency, message history pagination and invalid-input handling.
- [x] Paused dispatch, concurrent claims, expiry, bounded offline retry and unknown outcomes.
- [x] Single-use OTP, expiry, supersession, wrong purpose and attempt exhaustion.
- [x] Campaign consent, deduplication, suppression, review/approval and unsent cancellation.
- [x] Retention preserves unsettled work and releases unsent quota before purging.
- [x] Disposable PostgreSQL backup/restore and database restart queue fixture in CI.

Each staged pull request has its own CI. See PROJECT_STATUS.md for the verified implementation commits and run IDs.

## Required before expanding the pilot

- [ ] Review/merge the pull request chain in order (1 through 12).
- [ ] Owner authorizes/configures Render deployment and Neon URL/secrets; verify HTTPS/cookies and private readiness.
- [ ] Rehearse restore on the owner's isolated Neon branch with dispatch paused and live flags off.
- [x] Local desktop/mobile browser walkthrough with simulated API responses; no JS errors or horizontal overflow.
- [ ] Owner-only browser walkthrough on the deployed origin; verify sign-in, invites, key management, forms and errors on the deployed origin.
- [ ] Verify operator/package permission for automated SMS and practical opt-out handling.
- [ ] Install/configure Android gateway, exact SIM/device and consenting allowlist.
- [ ] Owner explicitly enables a controlled live test; verify short, Amharic and multipart delivery, actual segmentation and sender number.
- [ ] Measure accepted-to-sent/delivered latency, expiry and failure rates; record target/observed values rather than promising a latency in advance.
- [ ] Test phone offline/reconnection, gateway token expiry, provider timeout and backend sleep/restart under the actual hosting plan.
- [ ] Invite 2–5 approved users gradually and monitor queue/quota/Neon/Render usage and feedback.

Automated mock/provider-contract tests do not satisfy physical delivery or real-host availability checks. No production deployment, live credentials, or actual SMS test has been performed in this work.
