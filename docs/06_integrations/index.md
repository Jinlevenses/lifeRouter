# 06. 연동

| 연동 | 허용 범위 | 조건 |
|---|---|---|
| Google Calendar | 읽기 및 승인된 managed event 쓰기 | OAuth, 최소 scope, etag/conflict 처리 |
| Notion Calendar | Google Calendar를 통한 읽기 | Notion 별도 쓰기/데이터 저장 없음 |
| Toss | 공식 API의 read-only 잔액 | 계약 키, 허용 IP, 소유자 설정 후 |
| 은행 | 수동 snapshot | 공식 API 전까지 CSV 우선 흐름 없음 |

Google sync는 sync token/etag, 삭제와 재인증을 다루며, 쓰기는 Proposal 승인과 expected version을 모두 통과해야 한다. Toss 오류는 계정 잔액을 덮어쓰지 않고 Connection을 stale/failed로 갱신한다. 외부 credential은 `.env`/OS secret store 등 저장소 밖에서 관리한다.

승인 참조: [Toss 개발자](https://developers.tossinvest.com), [Google Calendar sync](https://developers.google.com/workspace/calendar/api/guides/sync), [Notion Calendar connections](https://www.notion.com/help/notion-calendar-connections), [금융결제원 Open Banking](https://openapi.kftc.or.kr/service/openBanking). URL의 현재 정책·자격은 구현 직전 재확인한다. (FR-008 → INT-GCAL-001, INT-TOSS-001 planned)
