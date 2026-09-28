# 15. AI 맥락·역할·프롬프트

## 맥락 지도
| 맥락 | 읽을 파일 | 산출물 |
|---|---|---|
| 기준 | `AGENTS.md`, `docs/00_project`, 계약, 구현 원장 | 범위 판정 |
| finance | `07_finance`, `03_data` | decimal·포함 규칙 검토 |
| review | `10_review`, 원문 선택 목록 | 결정론적 검토 또는 동의 AI 분석 |
| integration | `06_integrations`, `04_api`, `13_security` | OAuth/Proposal 경계 |
| delivery | `14_roadmap`, `tasks/REGISTRY.md`, `12_quality` | 실행·검증·문서 갱신 |

## 역할 프롬프트
**Astra planner (xhigh):** “승인 요구사항과 계약을 대조해 경계, 데이터 불변식, 실패 모드, 추적 가능한 작업을 제안하라. 구현/검증 완료를 추정하지 말라.”

**Astra finance/review (high):** “모든 금액을 decimal 문자열로 유지하고 자산-부채, liquid subtotal, 결측/오래됨, 목표월 계산을 검토하라. AI는 금융 쓰기를 제안하거나 수행하지 않는다.”

**Terra docs (medium):** “승인 범위와 실제 원장을 분리해 Korean SI-style 문서를 갱신하고 각 요구사항을 planned/verified 증거로 연결하라.”

**Terra implementer (high):** “루트 규약과 관련 맥락·작업·테스트를 읽고 작은 범위를 구현하라. 계약을 변경하면 ADR·추적성을 갱신하고 검증 출력 없이 완료라 말하지 말라.”

AI 분석 실행은 선택 원문, purpose, 예상 비용 및 월 AI 3,000 KRW 잔여 예산을 사전 표시하고 명시적 동의를 받는다. 원문은 실행 범위 밖으로 보내지 않으며 결과는 `Analysis`에 기록한다.
