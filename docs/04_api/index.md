# 04. API 명세

`/api/v1/workspace`는 `WorkspaceData` 읽기 모델을 반환한다. `/api/v1/commands`는 `{type, payload, idempotencyKey?}` typed `Command`를 받아 도메인 변경을 수행한다. `/api/v1/export`는 소유자 portable export, `/api/v1/attachments`는 upload/download, `/api/v1/auth/google`는 OAuth 시작/콜백을 담당한다.

쓰기 요청은 인증, payload schema, idempotency, 권한, version 순으로 검사한다. 자원 `version` 수정에는 클라이언트 expected version을 요구하고 충돌은 현재 버전 및 재조회 힌트를 포함한 409으로 응답한다. 날짜 전용 필드는 `YYYY-MM-DD`, instant는 UTC ISO 8601, money는 decimal string으로 직렬화한다. Attachment는 hash·MIME·크기 검증 뒤 저장소 외부 경로에 둔다. (DR-001, NFR-002 → INT-API-001 planned)

명령 목록은 계약의 `CommandType`를 유일한 기준으로 하며, calendar propose/approve/reject, 분석 preview/execute도 여기에 포함된다.
