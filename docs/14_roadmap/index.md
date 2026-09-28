# 14. 구현 로드맵

모든 상태는 **진행 중**이며 체크 표시가 있는 `docs/IMPLEMENTATION.md`의 명령 증거만 verified로 승격한다.

| 단계 | 결과 | 관련 작업 | 완료 증거 |
|---|---|---|---|
| 0 | 계약·문서·도구 기준 | DOC-001 | 문서 검토/계약 typecheck |
| 1 | money/date/재무·반복 domain | CORE-001 | 단위 테스트 |
| 2 | DB, migration, owner auth, API | DATA-001 | 통합 DB/API 테스트 |
| 3 | 한국어 웹 흐름 | UI-001 | Playwright/접근성 |
| 4 | Google/Toss/capture/receipt | INT-001 | adapter 테스트 및 자격 수동 확인 |
| 5 | export/backup/worker/QA | OPS-001, QA-001 | restore/독립 review |

2주 trial, 실제 iPhone, 외부 credential, Tailscale remote enrollment, 외부 backup media는 단계 완료 증거가 아니며 소유자가 별도 실행해야 한다. 상세 단위는 [tasks/REGISTRY.md](../../tasks/REGISTRY.md)를 따른다.
