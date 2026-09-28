# 06. 연동

| 연동 | 허용 범위 | 조건 |
|---|---|---|
| Google Calendar | 읽기 및 승인된 managed event 쓰기 | OAuth, 최소 scope, etag/conflict 처리 |
| Notion Calendar | Google Calendar를 통한 읽기 | Notion 별도 쓰기/데이터 저장 없음 |
| Toss | 공식 API의 read-only 잔액 | 계약 키, 허용 IP, 소유자 설정 후 |
| 은행 | 수동 snapshot | 공식 API 전까지 CSV 우선 흐름 없음 |

Google sync는 sync token/etag, 삭제와 재인증을 다루며, 쓰기는 Proposal 승인과 expected version을 모두 통과해야 한다. Toss 오류는 계정 잔액을 덮어쓰지 않고 Connection을 stale/failed로 갱신한다. 외부 credential은 `.env`/OS secret store 등 저장소 밖에서 관리한다.

승인 참조: [Toss 개발자](https://developers.tossinvest.com), [Google Calendar sync](https://developers.google.com/workspace/calendar/api/guides/sync), [Notion Calendar connections](https://www.notion.com/help/notion-calendar-connections), [금융결제원 Open Banking](https://openapi.kftc.or.kr/service/openBanking). URL의 현재 정책·자격은 구현 직전 재확인한다. (FR-008 → INT-GCAL-001, INT-TOSS-001 planned)

## 구현 상태 (2026-09-28)
- **Google**: `GOOGLE_CLIENT_ID/SECRET`이 있을 때만 활성. scope `calendar.readonly` + `calendar.app.created`(ADR-012). OAuth 콜백이 앱 전용 ‘LifeRoute’ 캘린더를 만들고 첫 동기화를 큐잉한다. worker가 15분마다 캘린더별 syncToken으로 동기화하고 410이면 전체 재동기화, 401·권한 403은 `reauth_required`, 속도 제한 403/429/5xx는 재시도. 승인된 Proposal만 쓰며 etag가 다르면 덮어쓰지 않고 실패 처리한다. 가짜 제공자로 흐름을 자동 검증했으며 실제 Google 계정 연결은 수동 확인이 필요하다. Google Cloud의 승인된 리디렉션 URI는 `${BETTER_AUTH_URL}/api/v1/auth/google/callback`이다.
- **Notion Calendar**: 구현 없음. Notion Calendar 일정이 Google 캘린더에 있으면 읽기 동기화로 함께 들어온다.
- **Toss**: `BalanceProvider` 인터페이스와 Disconnected 구현만 있다. 공식 read-only 잔액 API의 존재·대상(토스뱅크/토스증권)·자격은 소유자 확인 사항(Q-2).
- **은행**: 수동 스냅샷.
