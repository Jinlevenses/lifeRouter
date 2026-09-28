# LifeRoute implementation ledger

Approved specification: user-approved LifeRoute plan, 2026-09-29. Full product documentation is under docs/00_project through docs/15_ai.

## Work packages
- [ ] DOC-001: Preserve the approved decisions, requirements, ADRs, traceability and AI harness.
- [ ] CORE-001: Exact money, date-only recurrence, forecast, privacy and source semantics with tests.
- [ ] DATA-001: PostgreSQL schemas, migrations, owner authentication, versioned domain API.
- [ ] UI-001: Korean responsive dashboard and working plans/assets/notes/reviews/settings flows.
- [ ] INT-001: Google OAuth/read sync, approved writes, Toss read-only, capture, receipts.
- [ ] OPS-001: Export, encrypted backup/restore, worker, budget controls, Docker and runbooks.
- [ ] QA-001: Typecheck, lint, unit/integration/e2e, visual checks, independent review.

## Rulings
- The workspace is empty and is not a Git repository. Work happens in the user's explicitly selected project directory; no additional worktree is necessary.
- No Docker/PostgreSQL binary is installed. Add optional embedded-postgres for local development and real PostgreSQL tests, while retaining Docker Compose and DATABASE_URL for normal deployment. It is real PostgreSQL, not a substitute storage engine.
- Credential-dependent integrations remain disconnected until configured. No external account is connected, real personal data uploaded, paid AI invoked or service published automatically.
- Two-week use, VoiceOver on a physical iPhone, third-party credentials, external backup media and remote device enrollment require owner validation and are never reported as completed by automated tests.

## Progress
2026-09-29: Environment inspected. Node 24 available; repository empty. Dependency versions being resolved. No baseline tests exist.
