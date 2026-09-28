# 10. 검토와 생활·업무 안내

주간/월간 검토는 완료 작업, 루틴 check-in, 자산 변화, 미완료 항목을 결정론적으로 집계해 wins/challenges/nextFocus 초안을 만든다. 동일 입력에는 동일 결과여야 하며, AI는 선택된 raw document만 명시적 동의와 비용 preview 뒤 분석한다. `Analysis`는 purpose, noteIds, 예상 비용, 실행 상태를 남긴다. AI가 재무 쓰기·캘린더 직접 쓰기를 하지 않는다. (FR-009 → UNIT-REVIEW-001, INT-AI-CONSENT-001 planned)

한국 생활·근로·세무 안내는 공공·공식 출처만 사용한다: [고용노동부](https://www.moel.go.kr), [국세청](https://www.nts.go.kr), [찾기쉬운 생활법령](https://www.easylaw.go.kr). 모든 안내에는 source URL, checked date, effective date를 저장하며, 소유자 프로필 정보가 없으면 eligibility는 `unknown`이다. 이는 개인 세무/법률 판단을 자동화하지 않는다.
