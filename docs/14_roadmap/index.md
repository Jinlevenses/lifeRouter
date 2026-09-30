# 14. 구현 로드맵

상태는 `docs/IMPLEMENTATION.md`의 명령 증거로만 승격한다. 2026-09-28 기준 단계 0–5의 자동 검증 가능한 부분은 완료, 아래 ‘소유자 확인’ 항목은 미검증이다.

| 단계 | 결과 | 관련 작업 | 완료 증거 |
|---|---|---|---|
| 0 | 계약·문서·도구 기준 | DOC-001 | 문서 검토/계약 typecheck |
| 1 | money/date/재무·반복 domain | CORE-001 | 단위 테스트 |
| 2 | DB, migration, owner auth, API | DATA-001 | 통합 DB/API 테스트 |
| 3 | 한국어 웹 흐름 | UI-001 | Playwright/접근성 |
| 4 | Google/Toss/capture/receipt | INT-001 | adapter 테스트 및 자격 수동 확인 |
| 5 | export/backup/worker/QA | OPS-001, QA-001 | restore/독립 review |

2주 trial, 실제 iPhone, 외부 credential, Tailscale remote enrollment, 외부 backup media는 단계 완료 증거가 아니며 소유자가 별도 실행해야 한다. 상세 단위는 [tasks/REGISTRY.md](../../tasks/REGISTRY.md)를 따른다.

| 다음 후보 (backlog) | 이유 |
|---|---|
| 로컬 OCR 어댑터(tesseract.js kor+eng) | 영수증 입력 수고 줄이기, 정확도는 수동 확인 |
| 토스증권 잔고 어댑터 | 공식 Open API 문서·client_id/secret·허용 IP 확인 후(ADR-014) |
| 토스뱅크 잔액 | 개인용 공식 API가 확인되면 |
| Notion 데이터베이스 일정 읽기 | Notion Calendar의 Google 연동 밖 일정이 필요할 때(ADR-015) |
| Google 읽을 캘린더 선택 UI | 현재는 목록 전체를 읽음 |
| PWA 설치·오프라인 캐시 | iPhone 홈 화면 사용성 |
| 노트 전문 검색(PostgreSQL FTS) | 노트가 많아질 때 |
