# 00. 마스터 제품·엔지니어링 명세

## 목적과 경계
LifeRoute는 한국의 단일 소유자가 Mac+iPhone에서 오늘의 상위 3개, 캘린더, 루틴, 순자산, 목표·프로젝트·할 일, 노트와 검토를 관리하는 local-first 서비스다. 월 운영 한도는 **10,000 KRW**, 그중 AI는 **3,000 KRW**다(시스템이 계량하는 것은 AI 3,000 KRW뿐이며 나머지는 소유자 수동 관리, local-first라 예상 0 KRW). 초기에는 LAN/로컬을 우선하며, 이후 Tailscale 사설 HTTPS를 허용한다. 공개 가입, 다중 사용자, 실시간 공동편집, 은행 CSV 우선 흐름, AI 금융 쓰기는 범위 밖이다.

## 요구사항 기준선과 추적성
상태: **자동 검증** = `docs/IMPLEMENTATION.md`에 명령 출력이 있는 테스트가 통과함 · **수동 미검증** = 소유자 확인 필요 · planned = 미구현.

| ID | 요구사항 | 검증(테스트 ID) | 상태 |
|---|---|---|---|
| FR-001 | 오늘은 top 3, 캘린더, 루틴, 순자산을 제공한다 | E2E-TODAY-001, INT-CMD-PLAN-001 | 자동 검증 |
| FR-002 | 목표·프로젝트·할 일은 분리하고 dueDate와 plannedAt을 분리한다 | UNIT-TASK-001, INT-CMD-PLAN-001 | 자동 검증 |
| FR-003 | 반복은 daily/weekday/weekly/monthly와 말일 clamp를 지원한다 | UNIT-REC-001, INT-CMD-PLAN-001 | 자동 검증 |
| FR-004 | 루틴은 done/skipped/unrecorded를 구분한다 | UNIT-ROUTINE-001, INT-CMD-PLAN-001, E2E-TODAY-001 | 자동 검증 |
| FR-005 | 순자산은 포함 자산-모든 부채이며 liquid subtotal을 보인다 | UNIT-FIN-001, INT-FIN-001, E2E-FIN-001 | 자동 검증 |
| FR-006 | 노트는 Tiptap JSON 이력·Markdown 내보내기·태그·backlink를 지원한다 | UNIT-NOTE-001, UNIT-COLLECTION-001, INT-NOTE-001, INT-COLLECTION-001, E2E-NOTE-001 | 자동 검증 |
| FR-007 | 공유/텍스트/이미지/영수증을 inbox로 받고 OCR 확인 뒤 확정한다 | UNIT-RECEIPT-001, INT-INBOX-001, INT-CAPTURE-001, E2E-CAPTURE-001 | 자동 검증(OCR 엔진 미구현, 실물 iPhone 수동 미검증) |
| FR-008 | Google 읽기와 승인된 managed calendar 쓰기만 수행한다 | INT-GCAL-001, INT-GCAL-002(가짜 제공자), INT-CAL-001 | 자동 검증(실제 Google 자격 수동 미검증) |
| FR-009 | 주간/월간 검토는 결정론적이며 AI는 동의된 원문만 분석한다 | UNIT-REVIEW-001, UNIT-AI-BUDGET-001, INT-REVIEW-001, INT-AI-CONSENT-001, INT-AI-001 | 자동 검증(실제 AI 청구 수동 미검증) |
| FR-010 | 매일 암호화 백업, 보존과 restore drill을 제공한다 | OPS-BACKUP-001, OPS-RESTORE-001, OPS-EXPORT-001 | 자동 검증(외부 매체·실제 drill 수동 미검증) |
| NFR-001 | local-first, 비밀/데이터 저장소 외부, HTTPS 사설 접근 | SEC-001, SEC-ATTACH-001, SEC-LOGIN-001, INT-AUTH-001 | 자동 검증(Tailscale HTTPS 수동 미검증) |
| NFR-002 | 금액은 decimal string, 동시 수정은 version conflict, 쓰기는 idempotent | UNIT-MONEY-001, INT-API-001, INT-API-002 | 자동 검증 |
| NFR-003 | TypeScript strict, Next 16/React/Tailwind/Radix/PostgreSQL/Drizzle/Better Auth/pg-boss | BUILD-001 (`pnpm verify`) | 자동 검증 |
| DR-001 | API contract는 `packages/contracts/index.ts`가 기준이다 | TYPE-CONTRACT-001 | 자동 검증 |
| A11Y-001 | 키보드, 명도, 라벨, iPhone VoiceOver | E2E-WEB-001(자동 부분) | 자동 부분만 검증, VoiceOver 수동 미검증 |

### 수용 기준
순자산 목표는 100,000,000 KRW/36개월이고 예금·연금 평가액을 포함하며 국민연금 미래 수급권은 제외한다. 계좌 잔액은 공식 API 전까지 수동 snapshot이다. Toss는 공식 read-only API, 키/IP 조건 충족 시에만 사용한다. Notion Calendar는 Google 연결을 통해 읽는다(별도 구현 없음).

## ADR
### ADR-001: local-first PostgreSQL
결정: PostgreSQL을 단일 데이터 기준으로 두고 공개 SaaS 가입을 만들지 않는다. 이유: 개인 데이터·비용·오프라인 우선 요구. 결과: 원격은 나중에 Tailscale 사설 HTTPS로 제한한다.

### ADR-002: 명시적 금액·날짜 타입
결정: `Money`는 decimal string, 업무일은 `DateOnly`, instant는 UTC ISO 문자열이다. 이유: KRW 합계와 월말 반복에서 float/시간대 오류를 막는다.

### ADR-003: 승인형 외부 쓰기
결정: Google Calendar 쓰기는 Proposal→승인→managed event로만 한다. 이유: 사용자의 캘린더를 AI/동기화가 임의 변경하지 않게 한다.

### ADR-004: 부채는 항상 차감 (불일치 1 해결)
결정: `Account.included`는 자산에만 의미가 있다. 부채는 `included=true, liquid=false`를 계약과 명령이 강제하고(422 `LIABILITY_ALWAYS_INCLUDED`), 상환·해지된 부채는 제외가 아니라 `account.archive{reason}`로 빠진다. 이유: “모든 부채 차감” 요구와 감사 가능성.

### ADR-005: AI 사용 원장 (불일치 2 해결)
결정: `AiUsage` 원장을 둔다. 이번 달 사용액 = Σ(actual ?? estimated), 예약액 = consented/queued/running 분석의 예상 비용. 예상+사용+예약 > 월 예산이면 409 `AI_BUDGET_EXCEEDED`. 단가는 소유자가 원/100만 토큰으로 입력하고, `max_tokens`가 출력 상한이다. 동의 금액이 현재 예상과 다르면 409 `AI_CONSENT_STALE`. 중단된 분석은 예상 비용을 사용액으로 기록해 한도를 안전 쪽으로 계산한다.

### ADR-006: backlink = inline atom node `noteLink` (불일치 3 해결)
결정: `{type:"noteLink", attrs:{targetType note|project|goal|task, targetId, label}}`. 저장 때마다 서버가 추출해 `note_links`를 전량 교체한다. Markdown은 `[label](liferoute://type/id)`. 노드 19종·마크 7종 allowlist 밖, `javascript:` 등 위험 링크, URL 이미지는 422.

### ADR-007: Review 기간 키 (불일치 4 해결)
결정: `kind weekly(ISO 주, 월~일)|monthly(달력월)`, `key weekly:YYYY-Www|monthly:YYYY-MM` unique, Asia/Seoul 경계, 재생성은 같은 key upsert로 소유자 회고를 보존한다. 확정(finalized) 뒤에는 재생성·수정 불가. 진행 중 기간에서 오늘 마감은 아직 ‘기한 지남’이 아니다.

### ADR-008: 원시 타입은 brand 없는 문자열
결정: 검토 초안의 branded 타입 대신 zod가 API 경계에서 형식을 강제하는 일반 문자열을 쓴다. 이유: DB·core·UI 사이 캐스트 남발이 오히려 오류를 숨긴다. 보완: `parseFloat` 금지 lint, money 함수 경유.

### ADR-009: 논리 백업 (pg_dump 대신)
결정: 백업은 도메인 테이블의 JSON 덤프 + 첨부를 zip → AES-256-GCM(별도 `LIFEROUTE_BACKUP_KEY`)으로 암호화하고 manifest에 파일별 sha256을 둔다. 복구는 빈 새 DB에만, 해시가 하나라도 다르면 중단. 이유: Mac에 PostgreSQL 클라이언트 바이너리·버전 일치를 요구하지 않고 자동 테스트로 왕복을 검증할 수 있다.

### ADR-010: 로컬 PostgreSQL 두 경로
결정: 소유자 Mac에는 Docker/PostgreSQL이 없다는 원장 기록에 따라 선택 의존성 `embedded-postgres`(`pnpm db:local`, 실제 PostgreSQL 바이너리)를 두고, Docker Compose와 `DATABASE_URL`도 유지한다. CI/클라우드 개발은 시스템 PostgreSQL 16을 쓴다.

### ADR-011: iPhone 캡처 토큰
결정: `scope=capture` Bearer 토큰(평문은 발급 때 한 번만 표시, 서버·멱등 원장에는 sha256만/비움)으로 `/api/v1/capture`만 호출한다. 웹 업로드는 소유자 세션+동일 출처 검사로 같은 엔드포인트를 쓴다.

### ADR-012: Google 최소 scope
결정: `calendar.readonly` + `calendar.app.created`. 앱이 만든 ‘LifeRoute’ 캘린더에만 API 수준에서 쓸 수 있다. 쓰기는 proposal id를 로컬 이벤트 id로 써서 재시도해도 중복되지 않으며 etag 불일치는 덮어쓰지 않고 실패로 남긴다. scope 이름·정책은 연결 직전 Google 문서로 재확인한다.

## 상태와 검증 한계
단계 0–5의 자동 검증 결과는 `docs/IMPLEMENTATION.md`에 명령과 함께 기록한다. 2주 사용성 시험, 실물 iPhone/VoiceOver, 외부 자격증명, 원격 기기 등록, 백업 매체·복구 drill은 수행되지 않았으며 자동 테스트로 대신할 수 없다.

## 해결된 불일치 (기록)
1. `Account.included`와 부채 → ADR-004.
2. AI 월 지출 원장 부재 → ADR-005.
3. backlink 문법·역참조 인덱스 → ADR-006.
4. `Review.period` 경계·시간대·유일키 → ADR-007.

설계 검토 전문(공백 43건, 결정 57건, 소유자 질문 8건)은 [plan-review-2026-09-28.md](plan-review-2026-09-28.md)에 있다.

## 소유자만 답할 수 있는 질문 (현재 적용 중인 기본값)
| # | 질문 | 기본값 |
|---|---|---|
| Q-1 | 36개월 목표 시작일 | 최초 실행일(설정에서 변경 가능) |
| Q-2 | Toss는 토스뱅크 잔액인가 토스증권 잔고인가, 공식 API 계약을 받을 것인가 | 인터페이스만, 수동 잔액 |
| Q-3 | Google 연결 의사, 별도 ‘LifeRoute’ 캘린더 사용 | 별도 캘린더 |
| Q-4 | AI 제공자·모델·단가 | 꺼짐, 켜면 claude-opus-5 기본(단가 자동 채움, 수정 가능) |
| Q-5 | 백업 저장 위치(외장 SSD/NAS)와 키 보관 | `~/LifeRouteData/backups`, 키는 `.env.local` |
| Q-6 | 연금 계정 범위와 갱신 주기 | category=pension 수동 스냅샷, 35일 지나면 ‘오래됨’ |
| Q-7 | HEIC 원본 보관 | 변환 없이 저장 |
| Q-8 | iPhone 기본 행동 | 캡처 우선 |
