# 00. 마스터 제품·엔지니어링 명세

## 목적과 경계
LifeRoute는 한국의 단일 소유자가 Mac+iPhone에서 오늘의 상위 3개, 캘린더, 루틴, 순자산, 목표·프로젝트·할 일, 노트와 검토를 관리하는 local-first 서비스다. 월 운영 한도는 **10,000 KRW**, 그중 AI는 **3,000 KRW**다. 초기에는 LAN/로컬을 우선하며, 이후 Tailscale 사설 HTTPS를 허용한다. 공개 가입, 다중 사용자, 실시간 공동편집, 은행 CSV 우선 흐름, AI 금융 쓰기는 범위 밖이다.

## 요구사항 기준선
| ID | 요구사항 | 검증 | 상태 |
|---|---|---|---|
| FR-001 | 오늘은 top 3, 캘린더, 루틴, 순자산을 제공한다 | E2E-TODAY-001 | planned |
| FR-002 | 목표·프로젝트·할 일은 분리하고 dueDate와 plannedAt을 분리한다 | UNIT-TASK-001 | planned |
| FR-003 | 반복은 daily/weekday/weekly/monthly와 말일 clamp를 지원한다 | UNIT-REC-001 | planned |
| FR-004 | 루틴은 done/skipped/unrecorded를 구분한다 | UNIT-ROUTINE-001 | planned |
| FR-005 | 순자산은 포함 자산-모든 부채이며 liquid subtotal을 보인다 | UNIT-FIN-001 | planned |
| FR-006 | 노트는 Tiptap JSON 이력·Markdown 내보내기·태그·backlink를 지원한다 | INT-NOTE-001 | planned |
| FR-007 | 공유/텍스트/이미지/영수증을 inbox로 받고 OCR 확인 뒤 확정한다 | E2E-CAPTURE-001 | planned |
| FR-008 | Google 읽기와 승인된 managed calendar 쓰기만 수행한다 | INT-GCAL-001 | planned |
| FR-009 | 주간/월간 검토는 결정론적이며 AI는 동의된 원문만 분석한다 | UNIT-REVIEW-001 | planned |
| FR-010 | 매일 암호화 백업, 보존과 restore drill을 제공한다 | OPS-BACKUP-001 | planned |
| NFR-001 | local-first, 비밀/데이터 저장소 외부, HTTPS 사설 접근 | SEC-001 | planned |
| NFR-002 | 금액은 decimal string, 동시 수정은 version conflict, 쓰기는 idempotent | INT-API-001 | planned |
| NFR-003 | TypeScript strict, Next 16/React/Tailwind/Radix/PostgreSQL/Drizzle/Better Auth/pg-boss | BUILD-001 | planned |
| DR-001 | API contract는 `packages/contracts/index.ts`가 기준이다 | TYPE-CONTRACT-001 | planned |

### 수용 기준
순자산 목표는 100,000,000 KRW/36개월이고 예금·연금 평가액을 포함하며 국민연금 미래 수급권은 제외한다. 계좌 잔액은 공식 API 전까지 수동 snapshot이다. Toss는 공식 read-only API, 키/IP 조건 충족 시에만 사용한다. Notion Calendar는 Google 연결을 통해 읽는다.

## ADR
### ADR-001: local-first PostgreSQL
결정: PostgreSQL을 단일 데이터 기준으로 두고 공개 SaaS 가입을 만들지 않는다. 이유: 개인 데이터·비용·오프라인 우선 요구. 결과: 원격은 나중에 Tailscale 사설 HTTPS로 제한한다.

### ADR-002: 명시적 금액·날짜 타입
결정: `Money`는 decimal string, 업무일은 `DateOnly`, instant는 UTC ISO 문자열이다. 이유: KRW 합계와 월말 반복에서 float/시간대 오류를 막는다.

### ADR-003: 승인형 외부 쓰기
결정: Google Calendar 쓰기는 Proposal→승인→managed event로만 한다. 이유: 사용자의 캘린더를 AI/동기화가 임의 변경하지 않게 한다.

## 상태와 검증 한계
현재 문서는 승인 설계다. 2주 사용성 시험, 실물 iPhone/VoiceOver, 외부 자격증명, 원격 기기 등록, 백업 매체 검증은 수행되지 않았다. 단계 0–5는 명령과 수동 증거가 확보될 때만 verified가 된다.

## 계약을 확장하기 전 해결할 불일치
1. `Account.included`가 liability에도 적용되면 “모든 부채 차감”과 충돌할 수 있다. 구현은 liability를 항상 차감하거나, 제외를 허용한다면 사용자 승인과 reason/audit 필드를 추가해야 한다.
2. `Analysis`에는 예상 비용만 있고 월별 실제 AI 지출 원장이 없다. 3,000 KRW 한도를 강제하려면 actualCost, 발생 시각, 월 합계 조회 또는 별도 usage ledger가 필요하다.
3. `DocumentNode`/`Note` 계약만으로 backlink의 링크 문법과 역참조 인덱스가 정의되지 않았다. 링크 mark/attrs와 추출 규칙을 계약 또는 ADR로 고정해야 한다.
4. `Review.period`는 string이라 주간/월간 경계, timezone, 재생성 idempotency를 보장하지 않는다. period kind와 date range/unique key를 설계할 필요가 있다.
