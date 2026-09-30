# 작업 레지스트리

상태: **done** = 구현 + 자동 테스트 통과(증거: `docs/IMPLEMENTATION.md`) · **partial** = 일부만 · **owner** = 소유자만 확인 가능 · **planned** = 미착수.
설계 근거는 [plan-review-2026-09-28.md](../docs/00_project/plan-review-2026-09-28.md)(D-xx)와 00_project의 ADR이다.

| ID | 작업 | 요구사항 | 테스트 ID | 상태 | 메모 |
|---|---|---|---|---|---|
| DOC-001 | 원장 정정, ADR-004~012 | DR-001 | 문서 검토 | done | 원장의 날짜(2026-09-29 KST)와 Mac 환경 기록은 정정이 아니라 유지(ADR-010) |
| DOC-002 | AGENTS.md | DR-001 | 문서 검토 | done | |
| DOC-003 | REGISTRY + 추적성 다중 테스트 ID | DR-001 | 문서 검토 | done | |
| DOC-004 | 소유자 답변 Q-1..Q-8 반영, ADR-013~016 | DR-001 | 문서 검토 | done | 2026-09-30 |
| BUILD-001 | pnpm monorepo, strict TS, eslint, vitest, playwright, `pnpm verify` | NFR-003 | BUILD-001 | done | |
| CONTRACT-001 | `packages/contracts/index.ts` 채택 + 계약 테스트 | DR-001, NFR-002 | TYPE-CONTRACT-001 | done | brand 대신 경계 검증(ADR-008) |
| CORE-001 | Money(decimal, HALF_UP/CEIL) | NFR-002 | UNIT-MONEY-001 | done | |
| CORE-002 | DateOnly/Asia/Seoul, ISO 주·월 | ADR-002 | UNIT-DATE-001 | done | |
| CORE-003 | Recurrence(말일 clamp) | FR-003 | UNIT-REC-001 | done | |
| CORE-004 | Top 3·반복 Task 규칙 | FR-002 | UNIT-TASK-001 | done | |
| CORE-005 | Routine 상태·집계·연속 | FR-004 | UNIT-ROUTINE-001 | done | |
| CORE-006 | 순자산·목표 | FR-005 | UNIT-FIN-001 | done | stale은 평가 기준일 기준 |
| CORE-007 | 노트 allowlist·text·noteLink·Markdown | FR-006 | UNIT-NOTE-001 | done | |
| CORE-008 | 컬렉션 값·view 검증 | FR-006 | UNIT-COLLECTION-001 | done | |
| CORE-009 | 결정론적 검토 | FR-009 | UNIT-REVIEW-001 | done | |
| CORE-010 | 영수증 필드 규칙 | FR-007 | UNIT-RECEIPT-001 | done | |
| CORE-011 | AI 예산 | FR-009 | UNIT-AI-BUDGET-001 | done | |
| CORE-012 | 상태 전이표 | FR-007, FR-008 | UNIT-STATE-001 | done | |
| DATA-001 | Drizzle 스키마 + 마이그레이션 | NFR-003 | INT-DB-001(통합 테스트 전체가 실제 마이그레이션 사용) | done | |
| DATA-002 | 소유자 단일 계정, 가입 차단 | NFR-001 | INT-AUTH-001, E2E-TODAY-001 | done | |
| DATA-003 | 명령 파이프라인·409·오류 매핑 | NFR-002 | INT-API-001 | done | |
| DATA-004 | idempotency 24h + prune | NFR-002 | INT-API-002 | done | |
| DATA-005 | workspace 읽기 모델 + health | FR-001 | INT-CMD-PLAN-001 | done | |
| DATA-006 | task/goal/project/routine/checkin | FR-002~004 | INT-CMD-PLAN-001 | done | |
| DATA-007 | account/snapshot | FR-005 | INT-FIN-001 | done | |
| DATA-008 | note save/revision/links + 읽기 API | FR-006 | INT-NOTE-001 | done | |
| DATA-009 | collection/record | FR-006 | UNIT-COLLECTION-001, INT-COLLECTION-001 | done | |
| DATA-010 | 첨부 업로드/다운로드 | FR-007, NFR-001 | SEC-ATTACH-001 | done | |
| DATA-011 | 캡처 토큰 + `/capture` | FR-007 | INT-CAPTURE-001, E2E-CAPTURE-001 | done | |
| DATA-012 | inbox/receipt | FR-007 | INT-INBOX-001 | done | |
| DATA-013 | 로컬 일정 + proposal | FR-008 | INT-CAL-001 | done | |
| DATA-014 | review generate/update/finalize | FR-009 | INT-REVIEW-001 | done | |
| DATA-015 | analysis + AiUsage | FR-009 | INT-AI-CONSENT-001, INT-AI-001 | done | |
| DATA-016 | settings/connection/guidance | FR-008, NFR-001 | (E2E/수동) | partial | guidance 전용 테스트 없음 |
| DATA-017 | 보안: CSRF·rate limit·redact·비밀 제외·로그인 후 이동 경로 | NFR-001 | SEC-001, SEC-LOGIN-001, E2E-CAPTURE-001 | done | open redirect 보강(security-review) |
| UI-001 | 앱 셸·토큰·로그인·오류/409 | NFR-003 | E2E-WEB-001 | done | |
| UI-002 | 오늘 | FR-001 | E2E-TODAY-001 | done | |
| UI-003 | 계획 | FR-002, FR-003 | E2E-TODAY-001(일부) | partial | 계획 화면 전용 E2E 없음 |
| UI-004 | 루틴 7일 격자 | FR-004 | E2E-TODAY-001(일부) | partial | |
| UI-005 | 자산 | FR-005 | E2E-FIN-001 | done | |
| UI-006 | 노트 | FR-006 | E2E-NOTE-001 | done | |
| UI-007 | Inbox·영수증 확인 | FR-007 | E2E-CAPTURE-001 | done | 영수증 확정 E2E 없음 |
| UI-008 | 검토·AI | FR-009 | (수동 스크린샷) | partial | E2E 없음 |
| UI-009 | 설정 | NFR-001 | E2E-CAPTURE-001(토큰) | partial | |
| UI-010 | 컬렉션 | FR-006 | (수동 스크린샷) | partial | E2E 없음 |
| UI-011 | 레이아웃·접근성 자동 점검 | A11Y-001 | E2E-WEB-001 | done | VoiceOver는 owner |
| UI-012 | shadcn/ui 도입(공식 CLI, 토큰·Sidebar·Dialog/Drawer·Field·Sonner) | NFR-003 | E2E 전체, BUILD-001 | done | ADR-016 |
| UI-013 | Magic UI 강조(NumberTicker·BorderBeam·Confetti·목표 링·BlurFade·로그인) | FR-001, FR-005 | E2E-TODAY-001, E2E-FIN-001 | done | 금액은 애니메이션 안 함 |
| INT-001 | Google OAuth + 읽기 동기화 | FR-008 | INT-GCAL-001(가짜) | done / owner | 실제 계정 연결은 owner |
| INT-002 | 승인 → managed 쓰기 | FR-008 | INT-GCAL-002(가짜) | done / owner | |
| INT-003 | Toss 어댑터 (토스뱅크·토스증권 분리, ADR-014) | FR-005 | INT-TOSS-001 | partial | 연결 2개·마이그레이션 0001 완료. 토스증권 Open API 문서 확인 후 잔고 조회 구현, 토스뱅크는 수동 |
| INT-004 | OCR 어댑터 | FR-007 | INT-OCR-001 | planned | 현재 수동 입력 |
| INT-005 | AI 어댑터 + 원장 (OpenAI GPT 기본, ADR-013) | FR-009 | INT-AI-001(가짜) | done / owner | 실제 OpenAI 호출·청구 대조는 owner |
| INT-007 | Notion Calendar 연동 (Google 경유, ADR-015) | FR-008 | 문서·설정 안내 | done / owner | 실제 Notion Calendar 표시 확인은 owner |
| INT-006 | iPhone 단축어 레시피 | FR-007 | E2E-CAPTURE-002 | owner | 설정 화면에 안내 있음 |
| OPS-001 | 내보내기 zip | FR-010 | OPS-EXPORT-001 | done | |
| OPS-002 | 암호화 백업·보존·catch-up | FR-010 | OPS-BACKUP-001 | done | |
| OPS-003 | 검증 복구 CLI | FR-010 | OPS-RESTORE-001 | done | 외부 매체 drill은 owner |
| OPS-004 | worker·docker compose | NFR-003 | OPS-WORKER-001(수동 실행 확인) | partial | worker 전용 자동 테스트 없음, compose 미실행 |
| OPS-005 | runbook | FR-010 | 문서 검토 | done | |
| QA-001 | `pnpm verify` / `verify:e2e` | NFR-003 | BUILD-001 | done | |
| QA-002 | 독립 review(code-review, security-review) | 전체 | 수동 | done | 결과와 수정은 IMPLEMENTATION.md |
| OWNER-001 | 2주 실사용 | 전체 | 수동 | owner | |
| OWNER-002 | 실물 iPhone Share Sheet·VoiceOver | FR-007, A11Y-001 | 수동 | owner | |
| OWNER-003 | 외부 매체 백업·복구 drill(RPO 24h/RTO 2h) | FR-010 | 수동 | owner | |
| OWNER-004 | Tailscale 사설 HTTPS·원격 기기 등록 | NFR-001 | 수동 | owner | 별도 변경 |
