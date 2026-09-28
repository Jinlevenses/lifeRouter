# 03. 데이터 모델과 규칙

계약의 `Task`, `Goal`, `Project`, `Routine`, `CheckIn`, `Account`, `BalanceSnapshot`, `Note`, `Collection`, `CalendarEvent`, `Connection`, `Proposal`, `Settings`가 영속 모델의 기준이다. 소프트 삭제 대상은 `deletedAt`을 보존하고, 노트는 `NoteRevision`으로 이전 Tiptap JSON을 보존한다.

재무는 계정의 `included=true` 자산 합계에서 모든 포함 부채를 빼며, `liquid=true` 자산만 별도 합계한다. KRW/외화 혼합은 snapshot의 `fxRate`와 평가 기준일을 명시하고 결측/오래된 계정 ID를 요약에 노출한다. 국민연금 미래 entitlement는 계정을 만들지 않는다. `amount`, 목표액, 예산, 계산 결과는 모두 decimal 문자열이다 (FR-005/NFR-002 → UNIT-FIN-001 planned).

반복은 `startDate` 이후만 생성한다. weekly는 weekday 배열, monthly는 day 또는 `last`, 29–31은 해당 월 마지막 날로 clamp한다. Routine의 미기록은 CheckIn 행 부재이지 `skipped`가 아니다 (FR-003/004 → UNIT-REC-001, UNIT-ROUTINE-001 planned).
