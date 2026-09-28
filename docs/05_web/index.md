# 05. 웹 클라이언트

Next 16 + React + Tailwind + Radix를 사용한다. 데스크톱은 232px sidebar, 모바일은 1열과 캡처 우선 동작을 사용한다. Radix primitive는 focus trap, escape, aria 관계를 유지하는 데 사용하되 색·간격은 제품 토큰으로 통일한다.

화면은 optimistic UI로 version을 보내며 409이면 최신 데이터 비교/재적용을 제공한다. 폼은 금액을 숫자로 변환하지 않고 decimal 문자열로 유지한다. 외부 캘린더 변경 버튼은 승인 대기 Proposal과 managed 여부를 명확히 표시한다. 시각 회귀는 Playwright screenshot과 수동 iPhone/VoiceOver로 확인한다 (E2E-WEB-001, A11Y-001 planned).
