# 04. API 명세

`/api/v1/workspace`는 `WorkspaceData` 읽기 모델을 반환한다(체크인·일정·완료 작업은 ±60일 창, 노트는 본문 없는 요약). `/api/v1/commands`는 `{type, payload, idempotencyKey?}` typed `Command`를 받아 도메인 변경을 수행한다. `/api/v1/export`는 소유자 portable export, `/api/v1/attachments`는 upload/download, `/api/v1/auth/google`는 OAuth 시작/콜백을 담당한다.

쓰기 요청은 인증, payload schema, idempotency, 권한, version 순으로 검사한다. 자원 `version` 수정에는 클라이언트 expected version을 요구하고 충돌은 현재 버전 및 재조회 힌트를 포함한 409으로 응답한다. 날짜 전용 필드는 `YYYY-MM-DD`, instant는 UTC ISO 8601, money는 decimal string으로 직렬화한다. Attachment는 hash·MIME·크기 검증 뒤 저장소 외부 경로에 둔다. (DR-001, NFR-002 → INT-API-001 planned)

명령 목록은 계약의 `CommandType`를 유일한 기준으로 하며, calendar propose/approve/reject, 분석 preview/execute도 여기에 포함된다.

## 엔드포인트 (구현 기준, `API_ROUTES`)
| 경로 | 인증 | 설명 |
|---|---|---|
| `GET /api/v1/workspace` | 소유자 세션 | 읽기 모델 |
| `POST /api/v1/commands` | 소유자 세션 + 동일 출처(Origin/Sec-Fetch-Site) | typed Command, 600회/분 |
| `GET /api/v1/notes/:id`, `/revisions/:rid`, `/export.md` | 소유자 세션 | 노트 본문·이력·backlink, Markdown 사본 |
| `GET /api/v1/export` | 소유자 세션 | zip(JSON + notes/*.md + attachments, 비밀 없음) |
| `POST /api/v1/attachments`, `GET /api/v1/attachments/:id` | 소유자 세션(+동일 출처) | magic byte MIME·20MB·sha256, 내려받기는 `sandbox` CSP·nosniff |
| `POST /api/v1/capture` | capture Bearer 토큰 또는 소유자 세션+동일 출처 | JSON 또는 multipart(file) |
| `GET /api/v1/auth/google`, `/callback` | 소유자 세션 | OAuth 시작/콜백(state 쿠키) |
| `GET /api/v1/health` | 없음 | db/worker/마지막 백업 시각(개인 데이터 없음) |
| `/api/auth/*` | Better Auth | 로그인·로그아웃(가입 비활성, 로그인 5회/분) |

오류 본문은 `{ok:false, error:{code, message, details?, nextAction?}}`이고 HTTP 상태는 `HTTP_STATUS_BY_ERROR`를 따른다. 409 `VERSION_CONFLICT`의 `details`에는 `resourceType, resourceId, expectedVersion, currentVersion, current, refetchUrl`이 있다. idempotencyKey는 24시간 보관되며 같은 키·다른 내용은 422, 재생 응답은 `replayed:true`(단, 캡처 토큰 평문은 재생되지 않음).
