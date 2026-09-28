# LifeRoute 기획 검토 (Astra planner)

- 검토 대상: `docs/README.md`, `docs/IMPLEMENTATION.md`, `docs/00_project` ~ `docs/15_ai` (전량 정독)
- 검토일: 2026-09-28
- 동반 산출물: `contracts-draft.ts` → `packages/contracts/index.ts`로 채택(조정 사항은 00_project ADR-008~ADR-012 참조)
- 구현 반영 상태와 차이는 [IMPLEMENTATION.md](../IMPLEMENTATION.md)가 기준이다. 이 문서는 검토 당시의 판단 기록이다.
- 이 문서는 **설계 판단**만 담는다. 어떤 항목도 구현·검증 완료를 뜻하지 않는다.

---

## 1. 문서 검토 결과 — 공백·모순·미정의

### 1.1 참조 파일 부재와 원장 자체의 오류

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-01 | README "진실의 우선순위", 00 DR-001 | "사용자 승인 범위 → `packages/contracts/index.ts` → …", "API contract는 `packages/contracts/index.ts`가 기준이다" | 계약 파일이 존재하지 않는다. 2순위 진실이 공백이라 모든 하위 문서가 근거 없이 계약을 인용한다. |
| G-02 | 14_roadmap 마지막 문장, 15_ai 맥락 지도 | "상세 단위는 tasks/REGISTRY.md를 따른다", "`AGENTS.md`, … `tasks/REGISTRY.md`" | 두 파일 모두 없다. 작업 단위와 루트 규약이 없어 구현자가 범위를 판단할 수 없다. |
| G-03 | IMPLEMENTATION.md Rulings | "The workspace is empty and is not a Git repository." | 실제로는 git 저장소다(브랜치 `claude/amazing-hypatia-shbxn6`, 커밋 없음). |
| G-04 | IMPLEMENTATION.md Rulings/Progress | "No Docker/PostgreSQL binary is installed.", "Node 24 available" | 구현 환경은 Node 22 + PostgreSQL 16 로컬이다. embedded-postgres 추가 판단의 전제가 틀렸다. |
| G-05 | IMPLEMENTATION.md 헤더/Progress | "user-approved LifeRoute plan, 2026-09-29", "2026-09-29: Environment inspected." | 검토일(2026-09-28)보다 미래 날짜다. 원장의 날짜 신뢰성이 깨진다. |
| G-06 | 00 요구사항표 vs 각 영역 문서 | 00은 FR당 테스트 1개(예: FR-005 → UNIT-FIN-001)만 적음 | 01/05/06/07/08/09/10/11/13이 인용하는 E2E-FIN-001, A11Y-001, E2E-WEB-001, INT-TOSS-001, INT-FIN-001, UNIT-COLLECTION-001, UNIT-RECEIPT-001, INT-AI-CONSENT-001, OPS-RESTORE-001, SEC-ATTACH-001이 추적성 표에 없다. |
| G-07 | 12_quality | "`pnpm verify`는 … 묶는 명령이어야 하지만" | 무엇을 묶는지(typecheck/lint/unit/integration/e2e 중 어디까지, DB 필요 여부) 정의가 없다. |

### 1.2 재무 도메인

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-08 (불일치 1) | 00 FR-005 / 03 / 07 | "포함 자산-모든 부채", "included=true 자산 합계에서 **모든 포함 부채**를 빼며", "모든 대출·카드 등 부채는 차감한다" | 03만 "포함 부채"라 써서 부채 제외 가능성을 열어 둔다. `Account.included`가 부채에 어떤 의미인지 정해지지 않았다. |
| G-09 | 03, 07 | "결측/오래된 계정 ID를 요약에 노출", "불완전(결측/오래된 계정)" | "오래된(stale)"의 기준 일수가 없다. |
| G-10 | 03 | "KRW/외화 혼합은 snapshot의 `fxRate`와 평가 기준일을 명시" | fxRate 방향(KRW per 1 unit?), 평가 기준일이 `asOf`와 같은지, 통화가 계정 속성인지 snapshot 속성인지 없다. |
| G-11 | 07 | "산술은 decimal 라이브러리에서 반올림 정책을 정해 수행" | 정책이 정해지지 않았다(환산·합계·monthlyRequired 각각). |
| G-12 | 00 수용 기준, 07 | "100,000,000 KRW/36개월", "`monthlyRequired = goalGap / remainingMonths`" | 36개월의 시작일과 remainingMonths 계산 규칙(달력월 차이? 일수/30?)이 없다. |
| G-13 | 03, 07 | "`liquid=true` 자산만 별도 합계" | liquid subtotal에서 부채(특히 카드)를 빼는지 불명. |
| G-14 | 09, 03 | "사용자가 확인한 뒤에 `confirmed`가 된다" | 확정된 영수증이 어떤 엔티티로 남는지 없다. 03 엔티티 목록에 Receipt/지출 기록이 없고, 순자산(스냅샷 모델)과의 관계도 없다. |
| G-15 | 00 수용 기준 | "예금·연금 평가액을 포함하며 국민연금 미래 수급권은 제외" | 연금 카테고리의 범위(퇴직연금/개인연금/IRP 등)와 '평가액'의 출처(수동)가 명시되지 않았다. |

### 1.3 계획·반복·루틴·오늘

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-16 | 00 FR-003 vs 03 | "daily/weekday/weekly/monthly", "weekly는 weekday 배열" | `weekday`가 kind(월~금)인지 weekly의 요일 배열인지 용어가 충돌한다. |
| G-17 | 03 | "반복은 `startDate` 이후만 생성한다" | 반복이 Task에 붙는지 Routine에 붙는지, "생성"이 인스턴스 사전 생성인지 계산인지 없다. |
| G-18 | 00 FR-001, 01 | "오늘의 상위 3개", "topDate가 오늘인 미완료 작업 3개" | 4개 이상 지정 시 처리, 표시 순서, 어제 미완료 top의 이월 규칙이 없다. |
| G-19 | 01 | "plannedAt은 캘린더 배치 시각" | Instant인지 DateOnly+시각인지, 소요 시간(duration)이 있는지 없다. |
| G-20 | 00 FR-004, 03 | "미기록은 CheckIn 행 부재이지 skipped가 아니다" | 어떤 날이 루틴의 "기대일"인지 규칙이 없다. 기대일이 없으면 매일이 unrecorded가 된다. |
| G-21 | 01 | "Goal은 방향, Project는 완료 기준, Task는 실행 단위" | Task가 Project 없이 Goal에 직접 붙을 수 있는지 없다. |
| G-22 | ADR-002 | "업무일은 `DateOnly`" | "오늘"을 정하는 시간대와 주체(서버/클라이언트)가 명시되지 않았다(Asia/Seoul 암묵). |

### 1.4 노트·컬렉션

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-23 (불일치 3) | 08 | "태그 및 note/project/goal 연결로 backlink를 계산한다" | 링크가 문서 내 노드인지 메타 관계인지, task 링크 허용 여부, 추출 규칙, Markdown 표현이 없다. |
| G-24 | 08 | "Tiptap `DocumentNode` JSON과 검색용 text를 함께 저장" | text를 누가 만드는지(클라이언트/서버), 허용 node/mark 목록, 문서 크기 상한, 이미지(첨부) 연결 규칙, revision 보존 기간이 없다. |
| G-25 | 08 | "record의 `values`는 property type에 맞게 검증" | values의 키(속성 id?), select 옵션 정의, relation 대상, view의 정렬·필터·그룹 규칙이 없다. |

### 1.5 API·동시성·보안

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-26 | 02, 04 | "`version`이 있는 자원은 …", "자원 `version` 수정에는 …" | 어떤 자원이 version을 갖는지 없다. CheckIn/BalanceSnapshot처럼 자연키 upsert/append 자원의 취급도 없다. |
| G-27 | 02, 04, 05 | "`idempotencyKey`로 재시도 쓰기를 중복 실행하지 않는다" | 키 생성 주체, TTL, 같은 키·다른 payload 처리, 재생 응답 표시가 없다. |
| G-28 | 04 | "현재 버전 및 재조회 힌트를 포함한 409" | 본문 필드명이 없다. |
| G-29 | 03 | "소프트 삭제 대상은 `deletedAt`을 보존" | 대상 엔티티 목록이 없다. |
| G-30 | 09, 13 | "요청은 인증되며", "rate limit" | iPhone Share Sheet/Shortcuts가 어떻게 인증하는지(세션 쿠키는 부적합) 없다. rate limit 대상도 없다. |
| G-31 | 03, 04 | 03 엔티티 목록 | InboxItem, Attachment, Receipt, Review, Analysis, AI 원장, Guidance 출처, API 토큰이 "영속 모델의 기준" 목록에 없다. |
| G-32 | 04 | 엔드포인트 5개 | 노트 본문 단건 조회, revision 조회, Markdown export, 캡처 전용 엔드포인트, health가 없다. `/workspace`에 모든 노트 본문을 싣는지 불명. |

### 1.6 캘린더·연동·AI·검토·운영

| # | 위치 | 인용 | 문제 |
|---|---|---|---|
| G-33 | 01, 02 다이어그램 | "당일 캘린더", Worker→Google | Google 연결 전에는 캘린더가 빈 화면이 된다. 로컬 이벤트 개념이 없다. |
| G-34 | ADR-003 | "Proposal→승인→managed event" | 소유자가 직접 만든 Proposal도 2단계 승인을 거치는지, Proposal의 생성 주체가 누구인지 없다. managed event를 쓸 캘린더(primary vs 별도)도 없다. |
| G-35 | 06 표 | "Toss \| 공식 API의 read-only 잔액", 링크 `developers.tossinvest.com` | 링크는 토스증권 개발자 사이트다. 대상이 토스뱅크 잔액인지 증권 잔고인지, read-only 잔액 API가 실제 존재하는지 확인되지 않았다. |
| G-36 | 06 | "Notion Calendar \| Google Calendar를 통한 읽기" | 코드 작업이 아닌 사실(노션 캘린더가 Google 캘린더를 표시)이며, 구현 항목이 없다는 점을 명시하지 않았다. |
| G-37 | 06, 11 | "stale/failed", "reauth" | Connection 상태값이 문서마다 다르다. |
| G-38 (불일치 2) | 10, 15 | "`Analysis`는 purpose, noteIds, 예상 비용, 실행 상태", "월 AI 3,000 KRW 잔여 예산을 사전 표시" | 실제 지출 원장이 없어 잔여를 계산할 근거가 없다. 단가 출처(USD→KRW), 토큰 추정 방식도 없다. |
| G-39 (불일치 4) | 10 | "주간/월간 검토는 … 결정론적" | `Review.period`가 string이라 경계·시간대·유일키·재생성이 정의되지 않았다. 소유자 편집분과 재생성 결과의 관계도 없다. |
| G-40 | 10 | "소유자 프로필 정보가 없으면 eligibility는 `unknown`" | 프로필 엔티티가 없고, 안내가 정적 큐레이션인지 크롤링인지 없다. |
| G-41 | 11 | "암호화 archive, manifest, 각 파일 hash" | 암호화 방식, 키 출처, 백업 대상(DB dump + attachments?), 저장 위치, catch-up 규칙이 없다. |
| G-42 | 00 | "월 운영 한도는 10,000 KRW, 그중 AI는 3,000 KRW" | AI 외 7,000 KRW의 항목이 없다(local-first면 0에 가깝다). 추적 대상이 아니라는 선언이 필요하다. |
| G-43 | 05 | "폼은 금액을 숫자로 변환하지 않고" | 입력 정규화(천단위 구분자 제거, 전각 숫자)와 통화별 소수 자릿수 규칙이 없다. |

---

## 2. 결정 제안

각 결정은 `contracts-draft.ts`에 반영되어 있다. 표기: **D-xx (해결하는 G-번호)**.

### 2.1 기준·원장 (D-01 ~ D-05)

- **D-01 (G-01, G-02)** 계약 파일은 `contracts-draft.ts`를 `packages/contracts/index.ts`로 채택해 시작한다. `AGENTS.md`(루트 규약: 읽기 순서, 금지사항, 검증 없이 "완료" 금지)와 `tasks/REGISTRY.md`(§3.3 표)를 단계 0에서 만든다.
- **D-02 (G-03~G-05)** IMPLEMENTATION.md Rulings를 정정한다: git 저장소임, Node 22 + PostgreSQL 16 로컬 사용, embedded-postgres **추가하지 않음**(DATABASE_URL 필수, docker compose는 선택), 날짜를 2026-09-28로 정정. 이후 원장은 명령 출력 인용 없이 verified로 바꾸지 않는다.
- **D-03 (G-06)** 00 추적성 표를 "FR → 여러 테스트 ID"로 확장한다(§3.3 표의 테스트 ID 열을 그대로 옮긴다).
- **D-04 (G-07)** `pnpm verify` = `typecheck → lint → test:unit → test:integration(DATABASE_URL 필요, 없으면 명시적 skip 출력) → build`. e2e는 `pnpm verify:e2e`로 분리(Playwright + 로컬 DB 필요).
- **D-05 (G-42)** 운영비 10,000 KRW 중 AI 3,000 KRW만 시스템이 계량한다. 나머지는 소유자 수동 관리(local-first, 예상 0 KRW)로 문서에 선언한다.

### 2.2 원시 타입·시간대·동시성 (D-06 ~ D-12)

- **D-06 (G-22)** 시간대는 `Asia/Seoul` 고정(Settings.timezone은 literal). **"오늘"은 서버가 정한다**: `today = now(UTC) → Asia/Seoul 달력일`. WorkspaceData가 `today`를 내려주고 UI는 그것을 쓴다. DateOnly 경계(주·월·기대일·stale)는 모두 이 달력일 기준이다.
- **D-07** `Money` = `^-?(0|[1-9]\d*)(\.\d{1,4})?$`(지수·구분자 금지). `Instant`는 `Z` 종결만 허용(오프셋 거부). `Id`는 UUID(클라이언트 optimistic 생성 허용, 서버가 유일성 검증).
- **D-08 (G-26)** version 보유 자원: Task, Goal, Project, Routine, Account, Note, Collection, CollectionRecord, CalendarEvent, Proposal, Receipt, Review, Analysis, Settings, Connection, Guidance. **version 없는 자원**: CheckIn(자연키 `(routineId, date)` upsert), BalanceSnapshot(append, 자연키 `(accountId, asOf)`), NoteRevision·AiUsage·Attachment·InboxItem(상태 전이표로 보호).
- **D-09 (G-27)** `idempotencyKey`는 클라이언트가 **시도(attempt)마다 새 UUID**로 만든다(재시도만 같은 키). 서버는 `(key → 응답)`을 24시간 보관, 같은 키·다른 payload 해시는 422 `IDEMPOTENCY_MISMATCH`, 재생 응답은 `replayed: true`.
- **D-10 (G-28)** 409 본문: `{ ok:false, error:{ code:'VERSION_CONFLICT', message, details:{ resourceType, resourceId, expectedVersion, currentVersion, current, refetchUrl:'/api/v1/workspace' }, nextAction } }`. `current`에는 비밀·토큰이 없다.
- **D-11 (G-29)** soft delete 대상: Task, Goal, Project, Routine, Note, Collection, CollectionRecord, CalendarEvent(로컬). Account는 삭제 대신 archive(사유 필수). Snapshot/CheckIn은 hard delete(감사는 명령 로그로).
- **D-12 (G-43)** 폼 입력은 `[0-9.,\-]` 외 문자 제거 → 쉼표 제거 → Money 정규식 검증. 통화별 소수 자릿수(KRW 0, JPY 0, 기본 2)는 core `DECIMAL_POLICY.currencyScale`.

### 2.3 재무 (D-13 ~ D-20)

- **D-13 (G-08, 불일치 1)** **부채는 항상 차감한다.** `Account.included`는 자산에만 의미가 있고, 부채는 `included=true, liquid=false`를 계약(refine)과 명령(422 `LIABILITY_ALWAYS_INCLUDED`)이 강제한다. 상환 완료·해지된 부채는 "제외"가 아니라 `account.archive { reason }`(archivedAt + archiveReason 감사)로 순자산에서 빠진다. 03의 "모든 포함 부채"는 "모든 부채"로 정정한다.
- **D-14 (G-09)** `stale` = 최신 snapshot `asOf < today − Settings.finance.staleAfterDays`(기본 **35일**, 월 1회 입력 습관 + 여유). `missing` = snapshot 없음(합계에 0, `missingAccountIds`에 노출). 둘 중 하나라도 있으면 `data:'incomplete'`.
- **D-15 (G-10)** 통화는 **계정 속성**(snapshot에 복사 저장). `fxRate` = KRW per 1 단위, `currency !== 'KRW'`면 필수. 평가 기준일 = `asOf`. `amountKrw`는 서버 파생(`round_half_up(amount × fxRate, 0)`).
- **D-16 (G-11)** 반올림: decimal.js precision 40. 환산·합계는 정수 KRW `ROUND_HALF_UP`. **`monthlyRequired`는 `ROUND_CEIL`**(부족 저축 방지). API는 문자열 그대로.
- **D-17 (G-12)** `Settings.finance.goalStartDate` = `owner:create` 실행일, `goalTargetDate` = +36개월(저장값, 재계산 없음). `remainingMonths`: `today > targetDate → 0(overdue)`, 아니면 `max(1, 달력월 차이 − (targetDay < todayDay ? 1 : 0))`. `goalGap ≤ 0 → achieved, monthlyRequired=null`; overdue도 null. 상태는 `goal.status ∈ {active, achieved, overdue}`와 `data ∈ {complete, incomplete}`를 **분리**한다(07의 "불완전"은 데이터 상태다).
- **D-18 (G-13)** `liquidAssetsKrw` = included & liquid 자산 합계, **부채 미차감**. UI 라벨은 "유동 자산 합계".
- **D-19 (G-14)** 확정 영수증은 `Receipt(status='confirmed')`로 남는 **지출 기록**이며 잔액·순자산에 영향을 주지 않는다(잔액은 snapshot만). 월간 검토 `spendingKrw`는 confirmed Receipt 합계. 별도 Transaction/원장 엔티티는 v1에 두지 않는다.
- **D-20 (G-15)** 계정 category enum: 자산 `cash, deposit, savings, investment, pension, realEstate, otherAsset` / 부채 `loan, creditCard, otherLiability`. `pension`은 소유자가 평가액을 수동 snapshot한 계정(퇴직·개인연금·IRP)만. 국민연금은 category가 없으므로 만들 수 없다(문서 규칙 + UI 안내).

### 2.4 계획·반복·루틴·오늘 (D-21 ~ D-27)

- **D-21 (G-16)** Recurrence kind = `daily | weekday | weekly | monthly`. `weekday`(월~금)는 `weekly{mon..fri}`의 설탕이며 core가 정규화한다. `weekly.weekdays`는 요일 이름 배열(비어 있으면 422). `monthly.day ∈ 1..31 | 'last'`, 해당 월 일수 초과는 말일 clamp. `interval`(격주 등)은 v1 범위 밖.
- **D-22 (G-17)** 반복은 **둘 다**에 붙되 의미가 다르다. `Routine.schedule`은 "기대일 규칙"(계산만, 인스턴스 없음). `Task.recurrence`는 "완료 시 다음 발생을 새 Task로 생성"하는 rolling 모델(사전 생성 없음). 다음 dueDate = `max(이전 dueDate, today)` **이후 첫 발생**(밀린 반복이 여러 개 쌓이지 않음). 새 Task는 `seriesId`를 잇고 topDate/plannedAt은 비운다. `endDate` 지나면 생성하지 않는다. 반복 Task는 dueDate 필수(422 `RECURRENCE_REQUIRES_DUE_DATE`).
- **D-23 (G-18)** `Task.topDate + topRank(1..3)`. `task.setTop { date, rank? }`: 같은 날 open 작업 3개가 차 있으면 409 `TOP_LIMIT_EXCEEDED`, rank 충돌은 409 `TOP_RANK_TAKEN`(자동 밀어내기 없음). 오늘 화면은 `topDate === today && status open`을 rank 순으로 보인다. **자동 이월 없음**: 과거 topDate가 남은 open 작업은 `todayView.staleTopTaskIds`로 내려 UI가 "오늘로 옮기기"를 제안한다. 완료·취소 시 top은 유지(기록 목적).
- **D-24 (G-19)** `plannedAt: Instant | null` + `plannedDurationMin: 5..1440 | null`. dueDate(DateOnly)와 독립. 오늘 화면의 캘린더 = 오늘 plannedAt 작업 + 오늘 CalendarEvent.
- **D-25 (G-20)** 루틴 일별 상태는 4값: `done | skipped | unrecorded | notExpected`. 기대일 = `schedule`이 그날을 포함하고 `status='active'`인 날. 기대일이 아닌 날은 `notExpected`(집계 제외). `checkin.record`는 기대일이 아니어도 허용(기록은 자유, 집계는 기대일 기준).
- **D-26 (G-21)** Task는 `projectId`, `goalId` 둘 다 nullable. Project가 있으면 goalId는 Project의 goal로 서버가 동기화(클라이언트 값 무시). 즉 Goal 직결 Task 허용.
- **D-27** Goal/Project/Task/Routine 모두 `sortOrder`(정수)로 수동 정렬.

### 2.5 노트·컬렉션 (D-28 ~ D-33)

- **D-28 (G-23, 불일치 3)** backlink는 **inline atom node** `noteLink`로 고정: `{ type:'noteLink', attrs:{ targetType:'note'|'project'|'goal'|'task', targetId, label } }`(mark가 아니라 node — 라벨 편집과 원자 삭제가 쉽다). 저장 시 서버가 문서를 순회해 `NoteLink(sourceNoteId, targetType, targetId, label)` 행을 **전량 교체**한다. X의 backlinks = `NoteLink.target = X` ∪ `Note.projectId/goalId = X`(소속 관계). 태그는 backlink가 아니라 필터다. Markdown: `[label](liferoute://<targetType>/<targetId>)`.
- **D-29 (G-24)** `text`는 **서버 파생**(text node를 개행으로 결합; 클라이언트는 보내지 않음). 허용 node 19종·mark 7종 allowlist 밖은 422. 문서 1 MB 상한. 이미지는 `image{ attachmentId, alt? }`. Markdown export는 소유자 요청 시 `GET /api/v1/notes/:id/export.md`로만 생성(파일 저장 없음). NoteRevision은 **전량 보존**(단일 사용자 규모; 정리는 backlog).
- **D-30** `note.save`는 전체 저장 + `expectedVersion` 필수. 성공 시 이전 버전을 NoteRevision으로 남기고 version+1. 409면 `current`(최신 Note)를 돌려 UI가 diff/재적용한다. `note.restoreRevision`은 revision 내용으로 **새 저장**(이력 유지).
- **D-31 (G-25)** `CollectionRecord.values`는 `{ [propertyId]: PropertyValue }`, PropertyValue는 `type` 판별 유니온(text/number/money+currency/date/checkbox/status/select/multiSelect/url/relation). 서버가 알 수 없는 키·type 불일치·없는 option id·required 누락을 422로 거부. 속성 삭제 시 record의 해당 값은 서버가 제거.
- **D-32** View: `table | board(groupByPropertyId 필수: status/select) | calendar(datePropertyId 필수: date)`, `sorts ≤ 5`, `filters ≤ 10`(op: eq/neq/contains/isEmpty/isNotEmpty/gt/lt). formula/rollup 없음.
- **D-33** 노트 목록은 WorkspaceData에 `NoteSummary`(본문 제외, excerpt 200자)로, 본문·revision·backlink는 `GET /api/v1/notes/:id`(`NoteDetail`)로 받는다.

### 2.6 캡처·영수증·첨부 (D-34 ~ D-38)

- **D-34 (G-30)** iPhone 캡처 인증은 **scope='capture' Bearer 토큰**: `token.create`가 평문 secret을 **한 번만** 반환(서버는 sha256만 저장), `POST /api/v1/capture`에만 유효. `token.revoke`로 폐기. Rate limit: 로그인 5회/분, capture 60회/분, commands 600회/분(단일 사용자 보호용).
- **D-35** Inbox 전이표: `new → converted | archived`, 그 밖은 409 `STATE_TRANSITION_INVALID`. `convertedTo {type,id}`로 원본↔대상 관계 보존. 웹 빠른 캡처는 `inbox.create`(text/url), 이미지·영수증은 `/api/v1/capture` 또는 `/api/v1/attachments` + `inbox.convert{target:'receipt'}`.
- **D-36 (G-14 보완)** Receipt: `status draft|confirmed|discarded`, `ocr.status unavailable|pending|done|failed`, 필드마다 `{value, confidence, source: none|ocr|owner}`. **OCR 없이도 draft 생성·수동 입력·확정이 가능**(OCR은 선택 어댑터). 확정 시 `confirmed{merchant, amountKrw, date, category?, memo?}` 필수.
- **D-37** Attachment: 허용 MIME `image/jpeg|png|heic|webp, application/pdf, text/plain`, 20 MB 상한, sha256 서버 계산(클라이언트 값과 다르면 415 `ATTACHMENT_REJECTED`), 저장 경로는 `ATTACHMENTS_DIR`(저장소 밖)이며 API에 노출하지 않는다. 동일 sha256은 중복 저장하지 않는다.
- **D-38** OCR 어댑터 인터페이스 `OcrEngine.recognize(attachment) → {rawText, fields}`; 기본 구현 `UnavailableOcr`(status='unavailable'). 후보는 tesseract.js(로컬·무료, kor+eng). 정확도는 검증 대상이 아니라 "확인 UI가 있음"만 검증한다.

### 2.7 캘린더·연동 (D-39 ~ D-45)

- **D-39 (G-33)** `CalendarEvent.source = 'local' | 'google'`. **로컬 이벤트**를 v1에 둔다(연결 전에도 오늘 캘린더 사용 가능). `calendar.event.create/update/delete`는 로컬 이벤트에만 허용, google 이벤트 직접 수정은 409 `USE_PROPOSAL`.
- **D-40 (G-34)** Proposal 생성 주체는 v1에서 **소유자뿐**(`createdBy='owner'`; `system`은 예약). 흐름은 propose(미리보기 저장) → approve(승인 + job 큐잉) → applied/failed(worker). 2단계는 "외부 쓰기 전 반드시 명시 승인"이라는 ADR-003의 불변식을 코드 경로로 고정하기 위한 것이다. `calendar.update/delete` Proposal은 `managed=true` 이벤트에만(아니면 409 `NOT_MANAGED_EVENT`), 승인 시 `expectedEventVersion`을 검사한다.
- **D-41** managed event는 **별도 "LifeRoute" 캘린더**(Connection.meta.managedCalendarId, 연결 시 생성 또는 선택)에 쓰고, 이벤트 extendedProperties에 `liferoute.managed=true` + 로컬 id를 남긴다. primary 캘린더에는 쓰지 않는다(owner가 설정에서 바꿀 수 있음).
- **D-42** Google 동기화: 캘린더별 syncToken, 410이면 full resync, etag 불일치는 `syncStatus='conflict'`로 표시(자동 덮어쓰기 없음), 삭제는 `deletedAt`, 401/invalid_grant는 `reauth_required`. 읽기 scope `calendar.readonly` + 쓰기용 `calendar.events`(managed 캘린더 한정은 API가 보장하지 않으므로 코드가 managedCalendarId만 쓰도록 강제). 연결 전 `connection.syncNow`는 412 `INTEGRATION_DISCONNECTED`.
- **D-43 (G-35)** Toss는 `BalanceProvider` 인터페이스 + `DisconnectedBalanceProvider`만 구현한다. 실제 API 존재·자격은 소유자 확인 사항(§5). 성공 시 `BalanceSnapshot(source='toss')`를 **추가**하고(덮어쓰기 없음), 실패 시 Connection만 `stale/failed`.
- **D-44 (G-36)** Notion Calendar 항목은 "구현 없음: Google 캘린더에 반영된 노션 캘린더 일정이 읽기 동기화로 들어온다"로 문서에 명시한다.
- **D-45 (G-37)** Connection.status enum 통일: `disconnected | connected | reauth_required | stale | failed`. `stale` = 마지막 성공 후 48h 초과(Google) / 35일 초과(Toss). 비밀·sync cursor는 서버 전용 컬럼이며 어떤 읽기 모델에도 없다.

### 2.8 검토·AI·안내 (D-46 ~ D-52)

- **D-46 (G-39, 불일치 4)** `Review { kind: weekly|monthly, periodStart, periodEnd(포함), key }`. weekly = ISO 주(**월~일**, `weekly:YYYY-Www`), monthly = 달력월(`monthly:YYYY-MM`). 경계는 Asia/Seoul 달력일. `unique(key)`. `review.generate{kind, date}`는 date가 속한 기간을 서버가 계산해 **upsert**한다(재생성 idempotent).
- **D-47** Review는 세 영역으로 나눈다: `computed`(결정론적 집계 + `inputsHash`), `draft`(computed에서 규칙으로 만든 wins/challenges/nextFocus 문장 배열), `owner`(소유자 편집 텍스트, 재생성 시 **보존**). `finalized`는 재생성 불가(409 `STATE_TRANSITION_INVALID`). 결정론 테스트 = 같은 입력 fixture → 같은 `computed`/`draft`/`inputsHash`.
- **D-48** computed 항목: 완료 Task, 기간 내 due였는데 기간 말에 open인 Task, 루틴별 expected/done/skipped/unrecorded, 순자산 시작·끝·변화(periodStart 전일 / periodEnd 기준 최신 snapshot, 없으면 null + incomplete), confirmed Receipt 합계, 생성 노트 수, 기록된 check-in 수.
- **D-49 (G-38, 불일치 2)** `AiUsage` 원장 도입: `{monthKey(Asia/Seoul), provider, model, inputTokens, outputTokens, estimatedCostKrw, actualCostKrw|null, occurredAt}`. `usedKrw(month) = Σ(actualCostKrw ?? estimatedCostKrw)`, `reservedKrw = Σ estimate of Analysis in consented|queued|running`. `preview.cost + used + reserved > budget → 409 AI_BUDGET_EXCEEDED`. 예산은 `Settings.ai.monthlyBudgetKrw`(기본 '3000').
- **D-50** 비용 산정: 단가는 **소유자가 KRW/1M tokens로 직접 입력**(환율 자동 조회 없음). 입력 토큰 = `ceil(chars / charsPerToken)`(기본 2, 한국어 보수치), 출력 토큰 = `maxOutputTokens`(기본 2,000) 상한으로 계산. 실제 비용은 provider usage 응답 × 단가. 단가 미입력이면 preview 자체가 412 `AI_NOT_CONFIGURED`.
- **D-51** 동의 흐름: `analysis.preview`(원문 목록·purpose·예상 비용·잔여 예산 저장) → `analysis.execute{consent:true, consentEstimateKrw}`(현재 estimate와 불일치면 409 `AI_CONSENT_STALE`) → worker가 noteIds의 원문**만** 전송. Analysis 전이표는 계약에 고정. AI actor는 `account.* / snapshot.* / calendar.* / receipt.confirm / settings.*`를 실행할 수 없다(`AI_FORBIDDEN_COMMAND_PREFIXES`, 서버가 403).
- **D-52 (G-40)** Guidance는 v1에서 **소유자가 입력하는 정적 출처 목록**(크롤링·AI 없음). `sourceUrl` 호스트는 `www.moel.go.kr, www.nts.go.kr, www.easylaw.go.kr` allowlist. 프로필 엔티티는 두지 않으므로 `eligibility`는 항상 `'unknown'`(UI에 그렇게 표기). 단계 5 이후 backlog.

### 2.9 운영·보안 (D-53 ~ D-57)

- **D-53 (G-41)** 백업 = `pg_dump --format=custom` + `ATTACHMENTS_DIR` tar → 하나의 archive를 **AES-256-GCM**(키: env `BACKUP_ENCRYPTION_KEY`, 32바이트 base64, DB·auth 키와 분리)로 암호화 + `manifest.json{createdAt, files[{path,sha256,size}], appVersion, contractVersion}`. 저장 위치 `BACKUP_DIR`(저장소 밖). 보존 7/4/12는 worker가 정리. catch-up: 부팅 시 마지막 성공이 24h 이전이면 즉시 실행. 스케줄 `Settings.backup.dailyAt`(기본 03:30 Asia/Seoul).
- **D-54** restore CLI: `pnpm backup:restore --archive <path> --target-db <url> --attachments-dir <dir> --verify`. manifest hash 하나라도 불일치 → 중단(교체 없음). 검증 통과 후에만 스위치 안내 출력. 실제 drill은 소유자 수동.
- **D-55** Better Auth: email+password 단일 사용자. signup 엔드포인트 비활성(요청 시 404). `pnpm owner:create`가 유일한 생성 경로(2번째 실행은 거부). 세션 쿠키 `SameSite=Lax` + commands는 `Origin` 검사. Tailscale 노출은 별도 변경(HTTPS 종단은 Tailscale serve).
- **D-56** 로그 마스킹: 금액·노트 본문·토큰·OAuth 응답 본문은 로그 금지(로거에 redact 목록). 외부 오류 메시지는 `lastError`에 저장 전 URL query/토큰 제거.
- **D-57** 어댑터 선택 규칙: env에 자격이 **모두** 있을 때만 실제 어댑터를 주입, 아니면 `Disconnected*`. 앱은 어떤 어댑터로도 부팅·테스트가 되어야 한다.

### 2.10 소유자만 답할 수 있는 질문 (기본값은 이미 위에 적용)

| # | 질문 | 적용 중인 기본값 |
|---|---|---|
| Q-1 | 36개월 목표의 시작일을 최초 실행일로 잡아도 되는가, 특정 날짜인가? | owner:create 실행일 (D-17) |
| Q-2 | "Toss"는 토스뱅크 잔액인가, 토스증권 잔고인가? 개발자 계약·허용 IP를 실제로 받을 계획인가? | 어댑터 인터페이스만, 연결 없음 (D-43) |
| Q-3 | Google 계정을 연결할 의사가 있는가? managed 이벤트를 별도 "LifeRoute" 캘린더에 써도 되는가? | 별도 캘린더 (D-41) |
| Q-4 | AI provider·모델·단가(KRW/1M tokens)를 무엇으로 입력할 것인가? | provider=disconnected (D-50) |
| Q-5 | 백업 저장 위치(외부 SSD/NAS 경로)와 `BACKUP_ENCRYPTION_KEY` 보관 방식 | `BACKUP_DIR` 로컬 경로 (D-53) |
| Q-6 | 연금 계정으로 넣을 항목(퇴직연금/IRP/개인연금)과 평가액 갱신 주기 | category=pension, 수동 snapshot, stale 35일 (D-14, D-20) |
| Q-7 | HEIC 원본을 그대로 저장할지(서버 변환 없음) | HEIC 허용, 변환 없음 (D-37) |
| Q-8 | 데스크톱 사이드바 항목 순서와 iPhone 하단 시트의 기본 행동(캡처 vs top 완료) | 캡처 우선 (01 문서 그대로) |

---

## 3. MVP 우선순위

### 3.1 단계별 "매일 쓸 수 있는" 최소 경로

소유자가 매일 쓰려면 **단계 0~3이 연결 없이(disconnected) 끝까지 동작**해야 한다. 외부 연동은 전부 어댑터 뒤에 두고 단계 4로 미룬다.

| 단계 | 반드시 end-to-end로 동작해야 하는 것 | 이유 |
|---|---|---|
| 0 | monorepo 골격, contracts typecheck + 스키마 라운드트립 테스트, AGENTS.md, REGISTRY.md, 원장 정정 | 이후 모든 작업의 기준 |
| 1 | core 순수 함수: Money/Date(Asia/Seoul)/Recurrence/Task top·반복/Routine 상태/순자산·목표/노트 텍스트·링크·Markdown/컬렉션 값 검증/검토 집계/영수증 규칙/AI 예산/전이표 | DB 없이 단위 테스트로 도메인 불변식을 먼저 고정 |
| 2 | Drizzle 스키마·마이그레이션, owner:create, 명령 파이프라인(인증→스키마→idempotency→권한→version), workspace 읽기 모델, 첨부, capture 토큰·엔드포인트, 전 도메인 명령 핸들러(어댑터는 전부 Disconnected) | UI 없이도 curl/통합 테스트로 사용 가능 |
| 3 | 한국어 웹: 로그인 → 오늘(top 3·오늘 일정(로컬+plannedAt)·루틴 체크·순자산 카드) → 계획 → 자산(계정·snapshot) → 노트(Tiptap·version 충돌 UI·revision·backlink·태그·MD export) → Inbox(웹 캡처·변환·영수증 수동 확정) → 검토(주간/월간 생성·편집) → 설정(목표·capture 토큰·연결 상태 disconnected·AI 예산) → 컬렉션 | 여기까지가 "매일 사용" |
| 4 | Google OAuth+읽기 동기화, Proposal 승인 쓰기, Toss 어댑터, OCR 어댑터, AI 어댑터+원장, iPhone Shortcut 레시피 | 자격증명·소유자 확인 필요 |
| 5 | export, 암호화 백업·복구 CLI, worker/health/docker compose, runbook, `pnpm verify`, 독립 review | 운영 |

### 3.2 Disconnected/stub 어댑터로 출하하는 것

`packages/integrations`(또는 `apps/web/src/server/adapters`)에 인터페이스와 기본 구현을 둔다. 선택은 env 자격 유무로만 한다(D-57).

| 인터페이스 | 기본(stub) 구현 | 동작 |
|---|---|---|
| `CalendarProvider` (list/sync/createManaged/updateManaged/deleteManaged) | `DisconnectedCalendarProvider` | Connection.status=`disconnected`; `connection.syncNow`·`calendar.approve` → 412 `INTEGRATION_DISCONNECTED`(Proposal은 pending 유지) |
| `BalanceProvider` (fetchBalances) | `DisconnectedBalanceProvider` | Toss 연결 없음; 수동 snapshot만 |
| `OcrEngine` (recognize) | `UnavailableOcr` | Receipt.ocr.status=`unavailable`; 수동 입력·확정은 가능 |
| `AiProvider` (estimate/analyze) | `DisconnectedAiProvider` | `analysis.preview` → 412 `AI_NOT_CONFIGURED`; 원장·예산 계산은 단위 테스트로 검증 |
| `BackupStorage` (write/list/prune) | `LocalDirBackupStorage` | 로컬 디렉터리만; 외부 매체는 경로 마운트로 |

### 3.3 tasks/REGISTRY.md 제안

상태는 전부 `planned`. `verified`는 IMPLEMENTATION.md에 명령 출력이 인용될 때만 바꾼다. 테스트 ID는 00 추적성 표에 그대로 옮긴다(D-03).

| ID | 작업 | 요구사항 ID | 테스트 ID | 의존 | 상태 |
|---|---|---|---|---|---|
| DOC-001 | IMPLEMENTATION.md Rulings/날짜 정정(git·Node 22·PG16·embedded-postgres 제거), ADR-004~007(부채 차감, AI 원장, noteLink, Review 기간) 추가 | DR-001 | 문서 검토 | — | planned |
| DOC-002 | `AGENTS.md` 작성(읽기 순서, 금지사항, 완료 주장 규칙, 계약 변경 절차) | DR-001 | 문서 검토 | — | planned |
| DOC-003 | `tasks/REGISTRY.md` 생성(이 표) + 00 추적성 표 다중 테스트 ID로 확장 | DR-001 | 문서 검토 | DOC-001 | planned |
| BUILD-001 | pnpm monorepo 골격: apps/web, packages/{contracts,core,db,integrations}, tsconfig strict, eslint, vitest, playwright, `pnpm verify` 스크립트 정의 | NFR-003 | BUILD-001 | — | planned |
| CONTRACT-001 | `packages/contracts/index.ts` 채택(초안 반영), 스키마 라운드트립·COMMAND_TYPES 완전성·잘못된 Money/DateOnly/Instant 거부 테스트 | DR-001, NFR-002 | TYPE-CONTRACT-001 | BUILD-001 | planned |
| CORE-001 | Money: decimal.js 정책(precision 40, KRW HALF_UP 정수, CEIL 정책), add/sub/mul, FX 환산, 통화 scale | NFR-002 | UNIT-MONEY-001 | CONTRACT-001 | planned |
| CORE-002 | DateOnly/Asia/Seoul: today(now), addMonths(말일 clamp), monthsBetween, ISO 주·월 경계, monthKey | ADR-002 | UNIT-DATE-001 | CONTRACT-001 | planned |
| CORE-003 | Recurrence: occursOn, nextAfter, weekday 정규화, monthly 29–31/last clamp, start/end 경계 | FR-003 | UNIT-REC-001 | CORE-002 | planned |
| CORE-004 | Task 규칙: top 3 한도·rank 유일, 완료→다음 발생 생성(max(due,today) 이후), due/planned 독립, project→goal 동기화 | FR-002 | UNIT-TASK-001 | CORE-003 | planned |
| CORE-005 | Routine: 기대일, 일별 상태(done/skipped/unrecorded/notExpected), 기간 집계 | FR-004 | UNIT-ROUTINE-001 | CORE-003 | planned |
| CORE-006 | 순자산: included 자산−모든 부채, liquid 합계, missing/stale/estimated, earliest/latest asOf, goalGap/remainingMonths/monthlyRequired(CEIL), 부채 불변식 | FR-005 | UNIT-FIN-001 | CORE-001, CORE-002 | planned |
| CORE-007 | 노트: allowlist 검증, text 파생, noteLink 추출, Markdown export(링크·이미지·표·체크리스트) | FR-006 | UNIT-NOTE-001 | CONTRACT-001 | planned |
| CORE-008 | 컬렉션: values 검증(키·type·option·required·relation), 속성 삭제 시 값 제거, view 제약 | FR-006 | UNIT-COLLECTION-001 | CONTRACT-001 | planned |
| CORE-009 | 검토: 기간 key/경계(ISO 주·월), computed 집계, inputsHash, draft 문장 규칙, 결정론 fixture | FR-009 | UNIT-REVIEW-001 | CORE-004, CORE-005, CORE-006 | planned |
| CORE-010 | 영수증: 필드 병합(ocr/owner), 확정 조건, 전이표 | FR-007 | UNIT-RECEIPT-001 | CONTRACT-001 | planned |
| CORE-011 | AI 예산: 토큰·비용 추정, used/reserved/remaining, 한도 판정, 동의 stale 판정 | FR-009 | UNIT-AI-BUDGET-001 | CORE-001, CORE-002 | planned |
| CORE-012 | 상태 전이표(Inbox/Proposal/Analysis) 검증 함수 | FR-007, FR-008 | UNIT-STATE-001 | CONTRACT-001 | planned |
| DATA-001 | Drizzle 스키마 + migration 0001(전 엔티티, unique(routineId,date)/(accountId,asOf)/(review.key), 인덱스, deletedAt) | NFR-003 | INT-DB-001 | CONTRACT-001 | planned |
| DATA-002 | Better Auth 소유자 단일 계정, signup 비활성, `pnpm owner:create`(2회 거부), 세션·Origin 검사 | NFR-001 | INT-AUTH-001, SEC-001 | DATA-001 | planned |
| DATA-003 | 명령 파이프라인(인증→스키마→idempotency→권한→version), 409 본문, 오류 코드→HTTP 매핑, 명령 로그 | NFR-002 | INT-API-001 | DATA-002 | planned |
| DATA-004 | idempotency 저장(24h, payload 해시, replayed) + prune job | NFR-002 | INT-API-002 | DATA-003 | planned |
| DATA-005 | `GET /workspace` 읽기 모델(today, todayView, netWorth, window, NoteSummary, aiBudget, ops) + `GET /health` | FR-001 | INT-API-003 | DATA-003, CORE-006 | planned |
| DATA-006 | task/goal/project/routine/checkin 핸들러 | FR-002, FR-003, FR-004 | INT-CMD-PLAN-001 | DATA-003, CORE-004, CORE-005 | planned |
| DATA-007 | account/snapshot 핸들러(부채 불변식, archive 사유, SNAPSHOT_EXISTS/replace, amountKrw 파생) | FR-005 | INT-FIN-001 | DATA-003, CORE-006 | planned |
| DATA-008 | note 핸들러(save+revision+links 교체, restoreRevision) + `GET /notes/:id`, revision, `export.md` | FR-006 | INT-NOTE-001 | DATA-003, CORE-007 | planned |
| DATA-009 | collection/record 핸들러 | FR-006 | INT-COLLECTION-001 | DATA-003, CORE-008 | planned |
| DATA-010 | 첨부 upload/download(sha256·MIME·크기, ATTACHMENTS_DIR, 중복 제거) | FR-007, NFR-001 | SEC-ATTACH-001 | DATA-002 | planned |
| DATA-011 | capture 토큰(token.create/revoke, sha256 저장) + `POST /capture`(Bearer, rate limit) | FR-007 | INT-CAPTURE-001 | DATA-010 | planned |
| DATA-012 | inbox create/convert/archive + receipt update/confirm/discard/requestOcr(UnavailableOcr) | FR-007 | INT-INBOX-001 | DATA-011, CORE-010, CORE-012 | planned |
| DATA-013 | 로컬 calendar.event.* + calendar.propose/approve/reject(DisconnectedCalendarProvider → 412) | FR-008 | INT-CAL-001 | DATA-003, CORE-012 | planned |
| DATA-014 | review generate(upsert)/update/finalize | FR-009 | INT-REVIEW-001 | DATA-006, DATA-007, CORE-009 | planned |
| DATA-015 | analysis preview/execute/cancel + AiUsage 원장(DisconnectedAiProvider → 412), AI actor 금지 명령 403 | FR-009 | INT-AI-CONSENT-001 | DATA-003, CORE-011 | planned |
| DATA-016 | settings/connection/guidance 핸들러, Connection 기본 행(3 provider, disconnected) 시드 | FR-008, NFR-001 | INT-SETTINGS-001 | DATA-003 | planned |
| DATA-017 | 보안 미들웨어: rate limit, 로그 redact, 외부 오류 마스킹, 비밀 컬럼 read model 제외 테스트 | NFR-001 | SEC-001 | DATA-003 | planned |
| UI-001 | 앱 셸: 디자인 토큰(Tailwind 4 @theme), 232px 사이드바/모바일 1열, Radix 기반 다이얼로그·시트, 로그인, 빈 상태·오류·409 공통 컴포넌트 | NFR-003 | E2E-WEB-001 | DATA-005 | planned |
| UI-002 | 오늘 화면(top 3, 오늘 일정=로컬 이벤트+plannedAt, 루틴 체크, 순자산 카드, staleTop 이동 제안) | FR-001 | E2E-TODAY-001 | UI-001, DATA-006, DATA-013 | planned |
| UI-003 | 계획 화면(Goal/Project/Task CRUD, due/planned 분리 입력, setTop, 반복 설정, 완료→다음 발생 표시) | FR-002, FR-003 | E2E-PLAN-001 | UI-001, DATA-006 | planned |
| UI-004 | 루틴 화면(주간 격자 done/skipped/unrecorded/notExpected, 기록·해제) | FR-004 | E2E-ROUTINE-001 | UI-001, DATA-006 | planned |
| UI-005 | 자산 화면(계정 CRUD·archive 사유, snapshot 추가(fx·estimated reason), 요약·missing/stale/estimated 배지, 목표 진행) | FR-005 | E2E-FIN-001 | UI-001, DATA-007 | planned |
| UI-006 | 노트 화면(Tiptap + noteLink/image 확장, version 충돌 비교·재적용, revision 목록·복원, backlink 패널, 태그, MD export) | FR-006 | E2E-NOTE-001 | UI-001, DATA-008 | planned |
| UI-007 | Inbox 화면(웹 캡처, 변환 대상 선택, archive) + 영수증 확인 시트(필드 source/confidence 표시, 수동 확정) | FR-007 | E2E-CAPTURE-001 | UI-001, DATA-012 | planned |
| UI-008 | 검토 화면(주간/월간 생성·재생성, computed 표, draft, owner 편집, finalize) | FR-009 | E2E-REVIEW-001 | UI-001, DATA-014 | planned |
| UI-009 | 설정 화면(목표액·기한, stale 일수, capture 토큰 발급/폐기(1회 표시), 연결 상태 disconnected 안내, AI 단가·예산, 백업 상태) | NFR-001 | E2E-SETTINGS-001 | UI-001, DATA-016 | planned |
| UI-010 | 컬렉션 화면(table/board/calendar view, 속성 편집, 값 검증 오류 표시) | FR-006 | E2E-COLLECTION-001 | UI-001, DATA-009 | planned |
| UI-011 | 접근성·시각 회귀(Playwright screenshot: 토큰·232px·모바일 overflow·focus, 키보드 경로 자동 검사) | A11Y-001(자동 부분) | E2E-WEB-001, A11Y-001 | UI-002~UI-010 | planned |
| INT-001 | Google OAuth 시작/콜백, refresh token 서버 저장, 읽기 동기화(syncToken/etag/410/삭제/reauth) | FR-008 | INT-GCAL-001 | DATA-013, DATA-016 | planned |
| INT-002 | Proposal 승인 → managed 캘린더 쓰기 job(expectedEventVersion, extendedProperties, applied/failed) | FR-008 | INT-GCAL-002 | INT-001 | planned |
| INT-003 | Toss `BalanceProvider` 실제 어댑터 골격(자격·IP 설정 시만 활성) + 실패 시 stale/failed | FR-005 | INT-TOSS-001 | DATA-007, DATA-016 | planned |
| INT-004 | OCR 로컬 어댑터(tesseract.js kor+eng) + `receipt.ocr` job | FR-007 | INT-OCR-001 | DATA-012 | planned |
| INT-005 | AI provider 어댑터(원문만 전송, usage→actualCostKrw 원장) + `ai.analysis` job | FR-009 | INT-AI-001 | DATA-015 | planned |
| INT-006 | iPhone Shortcut 레시피 문서(텍스트/URL/이미지 → `/capture`) + capture e2e | FR-007 | E2E-CAPTURE-002(수동 병행) | DATA-011 | planned |
| OPS-001 | `GET /export` zip(JSON per 엔티티 + notes Markdown + attachments + manifest) | FR-010 | OPS-EXPORT-001 | DATA-008, DATA-010 | planned |
| OPS-002 | 백업 job(pg_dump+attachments→AES-256-GCM, manifest, 7/4/12 보존, catch-up, 마지막 성공 노출) | FR-010 | OPS-BACKUP-001 | DATA-005 | planned |
| OPS-003 | `pnpm backup:restore --verify`(hash 불일치 중단, 새 DB 검증) | FR-010 | OPS-RESTORE-001 | OPS-002 | planned |
| OPS-004 | worker 프로세스(pg-boss, singletonKey, 재시도, health 반영), docker compose(postgres 16, web, worker) | NFR-003 | OPS-WORKER-001 | DATA-004 | planned |
| OPS-005 | runbook 갱신(최초 준비, 백업·복구, 장애, Tailscale 별도 변경) | FR-010 | 문서 검토 | OPS-001~004 | planned |
| QA-001 | `pnpm verify` 완성(typecheck→lint→unit→integration(DB skip 명시)→build), `verify:e2e` 분리 | NFR-003 | BUILD-001 | UI-011 | planned |
| QA-002 | 독립 review 체크리스트 실행(요구사항·테스트 ID 누락, 돈/date 타입 침범, 비밀 노출, 외부 쓰기 우회) | 전체 | 수동 | QA-001 | planned |

---

## 4. 위험과 검증 한계

### 4.1 자동 테스트가 "검증됨"이라고 주장해서는 안 되는 것

1. **2주 실제 사용성** — 어떤 e2e도 대체하지 못한다. 소유자 일지가 유일한 증거다.
2. **실물 iPhone Share Sheet/Shortcuts 흐름과 VoiceOver** — Playwright 모바일 뷰포트는 화면 폭만 흉내 낸다. capture 엔드포인트의 통합 테스트는 "토큰으로 POST가 된다"까지만 증명한다.
3. **Google OAuth·동기화·managed 쓰기** — 실제 자격증명·동의 화면·API 정책(scope 승인, 앱 검증 상태)은 자동화 밖. 어댑터 테스트는 mock 응답에 대한 상태 전이만 검증한다.
4. **Toss read-only API의 존재·자격·허용 IP** — 문서 링크(토스증권)만으로는 잔액 API가 있다고 말할 수 없다. 자동 테스트는 인터페이스 계약만.
5. **AI 실제 비용** — 원장의 `actualCostKrw`는 provider usage × 소유자 입력 단가다. 청구서와의 일치는 소유자가 월말에 대조해야 한다. 3,000 KRW 한도는 "추정치 기준 차단"이지 청구 보증이 아니다.
6. **OCR 정확도** — 테스트는 "필드가 draft로만 생기고 확인 전엔 confirmed가 되지 않는다"만 증명한다.
7. **백업 RPO 24h / RTO 2h** — 외부 매체 저장, 실제 복구 drill, 시간 측정은 소유자 수동. 자동 테스트는 암호화 라운드트립과 manifest hash 불일치 중단만.
8. **Tailscale 사설 HTTPS·원격 기기 등록** — 범위 밖 별도 변경. 로컬 HTTP e2e로 원격 보안을 말하지 않는다.
9. **비밀이 저장소 밖에 있음** — 테스트는 read model에 비밀 컬럼이 없음과 로그 redact만 검증한다. 실제 `.env`/OS keychain 운용은 소유자 책임.
10. **순자산 수치의 정확성** — 계산은 결정론적으로 검증되지만 입력(수동 snapshot, fxRate, estimated)은 소유자 입력이다. "incomplete/stale/estimated" 배지가 보이는 것까지가 시스템의 보증이다.

### 4.2 설계 위험

- **contracts 크기**: 62개 명령·30여 스키마가 한 파일이다. 파생 타입 컴파일은 확인됐지만, 구현 중 분할(`commands.ts`, `entities.ts`)이 필요할 수 있다. 분할해도 `index.ts`가 re-export로 "단일 기준"을 유지해야 한다.
- **WorkspaceData 단일 응답**: 단일 사용자라 1~2년치는 문제없지만, checkIns/calendarEvents/receipts는 `window`(기본 60일)로 잘라야 한다. 노트 본문은 이미 제외했다.
- **Optimistic UI + version**: 노트 편집 중 409는 사용자에게 비교 UI를 요구한다. 자동 병합은 하지 않는다(실시간 협업 범위 밖).
- **Better Auth 버전 변동**: 단일 사용자 email+password와 signup 차단만 쓰므로 표면적을 최소로 유지한다.
- **Next 16 App Router + pg-boss**: worker는 Next 프로세스와 분리된 Node 프로세스로 둔다(빌드 시 초기화 부작용 방지).
- **decimal 문자열 침범**: UI/DB 경계에서 `Number()` 사용을 lint 규칙(예: `no-restricted-syntax`로 `parseFloat`/`Number(` on Money 필드)과 독립 review로 막아야 한다.
- **날짜 경계 버그**: `today` 계산은 반드시 core의 단일 함수(`todayInSeoul(now)`)만 쓴다. `new Date().toISOString().slice(0,10)`은 금지(UTC 날짜가 나온다).
