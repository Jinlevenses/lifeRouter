# 01. 제품 경험

## 정보 구조
오늘, 계획(Goals/Projects/Tasks), 자산, 노트, Inbox, 검토, 설정을 제공한다. 밝고 프리미엄한 UI는 `#F7F8FA` 배경, 흰 카드, `#18212B` 본문, `#0F766E` 강조색과 데스크톱 232px sidebar를 사용한다. iPhone은 우선 행동과 빠른 캡처를 하단/시트로 노출한다.

## 핵심 흐름
- 오늘: topDate가 오늘인 미완료 작업 3개, 당일 캘린더, 루틴의 done/skipped/unrecorded, 최신 순자산을 함께 본다. (FR-001 → E2E-TODAY-001 planned)
- 계획: Goal은 방향, Project는 완료 기준, Task는 실행 단위다. dueDate는 마감일이고 plannedAt은 캘린더 배치 시각이다. (FR-002 → UNIT-TASK-001 planned)
- 자산: 소유자가 수동으로 snapshot을 추가하고 포함/유동성 여부와 추정값 이유를 확인한다. (FR-005 → E2E-FIN-001 planned)

UX는 비어 있는 상태, 권한 거절, 충돌, 동기화 지연을 숨기지 않고 다음 안전한 행동을 제안해야 한다. 접근성은 키보드, 충분한 명도, 명확한 라벨, iPhone VoiceOver 수동 검증을 요구한다 (A11Y-001 planned).
