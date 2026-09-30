# LifeRoute implementation ledger

Approved specification: user-approved LifeRoute plan, 2026-09-29 (KST). Full product documentation is under docs/00_project through docs/15_ai; the design review that resolved the open gaps is docs/00_project/plan-review-2026-09-28.md. Only results backed by a command run are marked verified here.

## Work packages
- [x] DOC-001: Preserve the approved decisions, requirements, ADRs, traceability and AI harness. ADR-004..012 added in docs/00_project, AGENTS.md, tasks/REGISTRY.md (document review, 2026-09-28).
- [x] CORE-001: Exact money, date-only recurrence, forecast, privacy and source semantics with tests. `pnpm test` → 13 files, 74 tests passed (2026-09-28).
- [x] DATA-001: PostgreSQL schemas, migrations, owner authentication, versioned domain API. `pnpm test:int` → 3 files, 30 tests passed on PostgreSQL 16.13 (2026-09-28).
- [x] UI-001: Korean responsive dashboard and working plans/assets/notes/reviews/settings flows. `pnpm build` succeeded; `pnpm verify:e2e` → 8 passed (desktop + iPhone viewport) (2026-09-28).
- [~] INT-001: Google OAuth/read sync and approved writes, capture and receipts are implemented and tested against fake providers (INT-GCAL-001/002, INT-CAPTURE-001, INT-INBOX-001, E2E-CAPTURE-001). Toss read-only (INT-003, split into 토스뱅크/토스증권) and OCR (INT-004) remain interfaces only; real credentials are owner-only.
- [x] OPS-001: Export, encrypted backup/restore, worker, budget controls, Docker and runbooks. OPS-BACKUP-001, OPS-RESTORE-001, OPS-EXPORT-001 in `pnpm test:int`; worker and restore drill run by hand (below). `docker compose` was not run (no Docker in the dev container).
- [x] QA-001: Typecheck, lint, unit/integration/e2e, visual checks, independent review. `pnpm verify` exit 0 and `pnpm verify:e2e` exit 0 (2026-09-28); code-review and security-review results below.

## Rulings
- The project lives in the Git repository Jinlevenses/lifeRouter; development in the cloud container happens on branch `claude/amazing-hypatia-shbxn6`. The owner's Mac path (/Users/jin/code/lifeRoute) was not reachable, so the plan documents came from the uploaded docs archive.
- The owner's Mac has no Docker/PostgreSQL binary (recorded 2026-09-29 KST). This is kept, not corrected: optional embedded-postgres (`pnpm db:local`, real PostgreSQL) serves local development, and Docker Compose plus DATABASE_URL remain for normal deployment (ADR-010). The cloud development container uses Node 22.22.2, pnpm 10.33.0 and system PostgreSQL 16.13.
- Credential-dependent integrations remain disconnected until configured. No external account is connected, real personal data uploaded, paid AI invoked or service published automatically.
- Two-week use, VoiceOver on a physical iPhone, third-party credentials, external backup media and remote device enrollment require owner validation and are never reported as completed by automated tests.
- Deviations from the design review draft: primitives are zod-validated strings instead of branded types (ADR-008); backups are a logical JSON dump instead of pg_dump (ADR-009).

## Verification evidence (2026-09-28, cloud container)
| Command | Result |
|---|---|
| `pnpm typecheck` | contracts, core, server, scripts, web: Done |
| `pnpm lint` | 0 problems |
| `pnpm test` | 13 files, 74 tests passed |
| `pnpm test:int` | 3 files, 30 tests passed (real PostgreSQL, drizzle migrations) |
| `pnpm build` | Compiled successfully (Next 16.3.6) |
| `pnpm verify` | exit 0 (all of the above in order) |
| `pnpm verify:e2e` | 8 passed: E2E-CAPTURE-001 ×2, E2E-FIN-001, E2E-WEB-001 (desktop, iPhone), E2E-NOTE-001, E2E-TODAY-001 ×2 |
| `pnpm worker` (by hand) | catch-up backup written on start, heartbeat recorded in ops_state |
| `pnpm restore --verify` then `--target-db liferoute_drill` | manifest hashes verified; 30 rows restored into the fresh database; live DATABASE_URL refused |

## Independent review
### code-review skill (commit 2708f57)
Ten findings, all fixed with tests or checks:
1. `.gitignore` `attachments/` was unanchored and hid `apps/web/src/app/api/v1/attachments` from git → anchored `/attachments/`, `/backups/`.
2. The capture token secret could be stored in the idempotency/command log → response is redacted before logging.
3. Google create proposals could duplicate events on retry → proposal id is the local event id; an existing event is reused.
4. Analyses stuck in `running` were never failed → worker sweep fails them and books the estimate as used (cap stays safe); pending OCR is re-enqueued.
5. `AI_CONSENT_STALE` attempted an update that was then rolled back → returns the refreshed estimate and asks again.
6. Snapshot staleness was measured against today, marking past reviews incomplete → measured against the evaluation date.
7. Export Markdown image links pointed nowhere → `../attachments/<sha256>` inside the zip.
8. Google 403 rate/quota errors were treated as re-consent → transient.
9. Events ending exactly at midnight appeared on the next day → end is exclusive.
10. Duplicate client-supplied ids answered 500 → 422; fx rate must be > 0. Also: the OAuth callback reuses the app-created calendar instead of any calendar named LifeRoute.

### security-review skill
- One candidate: open redirect after login. `?next=/%5Cevil.example` (or `/%09/evil.example`) passed the `startsWith("/")`/`!startsWith("//")` check and browsers resolve it cross-origin. The false-positive filter scored it 7/10, below the skill's reporting threshold of 8, so the formal report lists no findings. Fixed anyway: `apps/web/src/lib/safe-next.ts` parses with WHATWG URL against a fixed base, requires the origin to be unchanged, rejects backslashes/control characters and non-string (repeated) values; applied on the server page and again before `location.assign`. Test: SEC-LOGIN-001 (`apps/web/test/safe-next.test.ts`).
- Hardening below threshold: `(app)/notes/[noteId]/page.tsx` read note data relying on the layout's session check; it now checks the owner session itself (layouts and pages render in parallel).

## 2026-09-30: owner answers and shadcn/ui redesign
### Owner answers (docs/00_project, ADR-013..016)
- Q-1, Q-5, Q-6, Q-7: confirmed defaults, no code change.
- Q-2 (토스뱅크 + 토스증권): contract `ConnectionProvider`/`SnapshotSource` split into `toss_bank`, `toss_securities`; data migration `0001_toss_split.sql` (generated with `pnpm db:generate --custom`). Run on a database seeded before the change: connections `ai, google, toss` → `ai, google, toss_bank` (the missing `toss_securities` row is seeded on next load). Toss adapters stay Disconnected: 토스증권 Open API exists (web search, 2026-05 launch) but developers.tossinvest.com is blocked from this container, so no endpoint was implemented by guesswork.
- Q-3 (Google + Notion Calendar): no Notion Calendar API; guidance in Settings > 연결 and docs/06_integrations (via the same Google account and the ‘LifeRoute’ calendar).
- Q-4 (GPT): contract `AiProvider` = `disconnected|openai|anthropic`; `packages/server/src/integrations/openai.ts` on the official `openai` SDK 7.25 (Responses API, `max_output_tokens`, `store: false`); per-provider adapter map; worker records the real provider. INT-AI-001 now runs the OpenAI path with a fake adapter and asserts the usage ledger row (`provider: "openai"`). Model ids offered in Settings come from the SDK's model type list; unit prices are owner input. No real OpenAI call was made.
- Q-8 (capture first, web first): desktop web is the primary design target; the iPhone bottom bar keeps the capture button.

### Design (ADR-016)
- The design sites (ui.shadcn.com, magicui.design, ui.aceternity.com) answer 403 from this container's egress policy. Workaround: cloned the official GitHub repositories (shadcn-ui/ui, magicuidesign/magicui), read the installation guides there (`apps/v4/content/docs/installation/next.mdx`, `manual.mdx`; Magic UI `installation/index.mdx`), packaged the `new-york-v4` sources with the official `shadcn build` command, served them on 127.0.0.1 and ran the official CLI: `REGISTRY_URL=http://127.0.0.1:4000/r pnpm dlx shadcn@4.21.0 add button card … -y` (33 components; 7 unused ones were removed afterwards) and `pnpm dlx shadcn@4.21.0 add <magicui item url>` (7 Magic UI components). Aceternity was not used (no public source repository, site blocked).
- Screens rebuilt on the shadcn primitives: Sidebar (232px), Tabs, ToggleGroup, Field/Input/InputGroup/NativeSelect, Dialog+Drawer, Sonner, Card/Badge/Empty, Checkbox, Progress, Alert, Spinner. Magic UI: NumberTicker (counts), BorderBeam (Top 3), Confetti (all Top 3 done), AnimatedCircularProgressBar (net worth goal), BlurFade, AuroraText + DotPattern (login). Screenshots were checked at 1440×900 and iPhone 14 on a seeded demo database.

### Verification (2026-09-30, Node 22.22.2, PostgreSQL 16.13)
| Command | Result |
|---|---|
| `pnpm verify` | exit 0: typecheck all packages, lint 0 problems, unit 13 files / 74 tests, integration 3 files / 30 tests, build compiled |
| `pnpm verify:e2e` | 8 passed (layout test now locates the shadcn sidebar by `data-slot`) |
| `pnpm db:migrate` on a pre-change database | `toss` connection renamed to `toss_bank` |

## Remaining owner-only work
- OWNER-001 two-week real use; OWNER-002 physical iPhone Share Sheet/Shortcut and VoiceOver; OWNER-003 external-media backup and restore drill (RPO 24h / RTO 2h); OWNER-004 Tailscale private HTTPS and remote device enrollment.
- Real Google credentials and consent screen, Notion Calendar showing the ‘LifeRoute’ calendar, OpenAI API key and billing reconciliation against the AiUsage ledger, 토스증권 Open API client_id/secret + allowed IP (and endpoint docs), OCR engine choice.
- Owner questions Q-1..Q-8 answered on 2026-09-30 (docs/00_project/index.md).

## Progress
2026-09-29 (KST): Environment inspected on the owner's Mac. Node 24 available; repository empty. No baseline tests existed.
2026-09-28 (UTC, cloud): Plan reviewed (43 gaps, 57 decisions, 8 owner questions); contract adopted; core, server, web, worker, ops and E2E implemented in commits 3452c2b..2708f57; code-review fixes in 2708f57; security-review hardening, collection integration test, docs and this ledger in the following commit.
