# 07. 재무 도메인

기본 목표는 36개월 안에 100,000,000 KRW 순자산이다. `goalGap = goalAmount - netWorth`, 남은 개월이 양수일 때 `monthlyRequired = goalGap / remainingMonths`이며, 목표 달성·기한 초과·불완전(결측/오래된 계정)은 명시적으로 상태화한다. 산술은 decimal 라이브러리에서 반올림 정책을 정해 수행하고 API에서는 문자열을 유지한다.

예금과 연금 평가 계정은 포함 가능하다. 모든 대출·카드 등 부채는 차감한다. 국민연금의 미래 entitlement는 제외한다. `estimated=true` snapshot은 reason을 필수로 두며, `asOf`가 다르면 earliest/latest를 표시하여 정밀도 한계를 숨기지 않는다. AI는 재무 읽기·요약은 가능해도 계정/잔액/목표를 쓰지 못한다. (FR-005, NFR-002 → UNIT-FIN-001, INT-FIN-001 planned)
