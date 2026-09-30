# 06. 연동

| 연동 | 허용 범위 | 조건 |
|---|---|---|
| Google Calendar | 읽기 및 승인된 managed event 쓰기 | OAuth, 최소 scope, etag/conflict 처리 |
| Notion Calendar | Google Calendar를 통한 양방향 보기(ADR-015) | Notion 별도 API·데이터 저장 없음 |
| 토스증권 | 공식 Open API의 read-only 잔고(ADR-014) | WTS에서 client_id·secret 발급, 허용 IP 등록, 소유자 설정 후 |
| 토스뱅크 | 공식 잔액 API 확인 전까지 수동 snapshot | 개인용 공식 API가 확인되면 |
| AI (OpenAI GPT) | 동의한 노트의 분석만(ADR-013) | `OPENAI_API_KEY`, 설정의 모델·단가, 월 3,000원 한도 |
| 은행 | 수동 snapshot | 공식 API 전까지 CSV 우선 흐름 없음 |

Google sync는 sync token/etag, 삭제와 재인증을 다루며, 쓰기는 Proposal 승인과 expected version을 모두 통과해야 한다. Toss 오류는 계정 잔액을 덮어쓰지 않고 Connection을 stale/failed로 갱신한다. 외부 credential은 `.env`/OS secret store 등 저장소 밖에서 관리한다.

승인 참조: [Toss 개발자](https://developers.tossinvest.com), [Google Calendar sync](https://developers.google.com/workspace/calendar/api/guides/sync), [Notion Calendar connections](https://www.notion.com/help/notion-calendar-connections), [금융결제원 Open Banking](https://openapi.kftc.or.kr/service/openBanking). URL의 현재 정책·자격은 구현 직전 재확인한다. (FR-008 → INT-GCAL-001, INT-TOSS-001 planned)

## 구현 상태 (2026-09-28)
- **Google**: `GOOGLE_CLIENT_ID/SECRET`이 있을 때만 활성. scope `calendar.readonly` + `calendar.app.created`(ADR-012). OAuth 콜백이 앱 전용 ‘LifeRoute’ 캘린더를 만들고 첫 동기화를 큐잉한다. worker가 15분마다 캘린더별 syncToken으로 동기화하고 410이면 전체 재동기화, 401·권한 403은 `reauth_required`, 속도 제한 403/429/5xx는 재시도. 승인된 Proposal만 쓰며 etag가 다르면 덮어쓰지 않고 실패 처리한다. 가짜 제공자로 흐름을 자동 검증했으며 실제 Google 계정 연결은 수동 확인이 필요하다. Google Cloud의 승인된 리디렉션 URI는 `${BETTER_AUTH_URL}/api/v1/auth/google/callback`이다.
- **Notion Calendar** (Q-3, 2026-09-30): 별도 구현 없음(공개 API 없음). Notion Calendar는 Google·Outlook·iCloud 캘린더를 연결해 보여 준다. ① Google 연결 → ② Notion Calendar에 같은 Google 계정 추가 후 ‘LifeRoute’ 캘린더 켜기 → ③ 승인한 LifeRoute 일정은 Notion Calendar에, Notion Calendar에서 Google 캘린더에 만든 일정은 LifeRoute ‘오늘’에 나타난다. Notion 데이터베이스 날짜 속성은 범위 밖. 설정 > 연결에 같은 안내가 있다.
- **Toss** (Q-2, 2026-09-30): 연결을 `toss_bank`, `toss_securities`로 나눴다(ADR-014). 토스증권은 2026-05부터 개인용 공식 Open API(인증, 시세, 계좌·잔고, 주문)가 있으며 잔고 조회만 쓸 예정이다. 개발 환경에서 developers.tossinvest.com 접근이 막혀 엔드포인트를 확인하지 못했으므로 어댑터는 아직 Disconnected이고, 추측으로 구현하지 않았다. 토스뱅크는 수동 snapshot. `.env`: `TOSS_SECURITIES_CLIENT_ID/SECRET`(아직 읽지 않음).
- **AI**: OpenAI GPT(ADR-013). `OPENAI_API_KEY`가 있고 설정에서 제공자를 OpenAI로 고른 경우에만 활성.
- **은행**: 수동 스냅샷.
