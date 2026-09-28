# 03. 데이터 모델과 규칙

계약의 `Task`, `Goal`, `Project`, `Routine`, `CheckIn`, `Account`, `BalanceSnapshot`, `Note`, `Collection`, `CalendarEvent`, `Connection`, `Proposal`, `Settings`가 영속 모델의 기준이다. 소프트 삭제 대상은 `deletedAt`을 보존하고, 노트는 `NoteRevision`으로 이전 Tiptap JSON을 보존한다.

재무는 계정의 `included=true` 자산 합계에서 모든 부채를 빼며(ADR-004: 부채는 제외할 수 없고 보관만 가능), `liquid=true` 자산만 별도 합계한다. KRW/외화 혼합은 snapshot의 `fxRate`와 평가 기준일을 명시하고 결측/오래된 계정 ID를 요약에 노출한다. 국민연금 미래 entitlement는 계정을 만들지 않는다. `amount`, 목표액, 예산, 계산 결과는 모두 decimal 문자열이다 (FR-005/NFR-002 → UNIT-FIN-001 planned).

반복은 `startDate` 이후만 발생한다. Routine의 schedule은 기대일 계산에만 쓰고(인스턴스 없음), 반복 Task는 완료 시 max(마감일, 오늘) 이후 첫 발생을 새 Task로 만든다(밀린 반복은 쌓이지 않음). weekly는 weekday 배열, monthly는 day 또는 `last`, 29–31은 해당 월 마지막 날로 clamp한다. Routine의 미기록은 CheckIn 행 부재이지 `skipped`가 아니다 (FR-003/004 → UNIT-REC-001, UNIT-ROUTINE-001 planned).

## 구현 메모 (2026-09-28)
- 스키마: `packages/server/src/db/schema.ts`, 마이그레이션 `packages/server/drizzle/`. 단일 소유자라 owner_id 열이 없다(ADR-001).
- version 자원: Task, Goal, Project, Routine, Account, Note, Collection, CollectionRecord, CalendarEvent, Proposal, Receipt, Review, Analysis, Settings, Connection, Guidance. CheckIn은 `(routineId, date)` upsert, BalanceSnapshot은 `(accountId, asOf)` 유일(같은 날 교체는 `replace=true`).
- 소프트 삭제: Task, Goal, Project, Routine, Note, Collection, CollectionRecord, CalendarEvent(로컬). Goal/Project 삭제 시 연결된 항목은 남고 연결만 풀린다.
- 오늘의 3가지 불변식은 DB 부분 유일 인덱스 `tasks_top_slot_uq(top_date, top_rank) where open`로도 보장한다.
- Connection의 OAuth 토큰(`secret`, BETTER_AUTH_SECRET 파생 키로 AES-256-GCM)과 sync cursor는 어떤 읽기 모델에도 포함되지 않는다.
