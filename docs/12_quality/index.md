# 12. 품질·검증 전략

| 계층 | 범위 | 현재 상태 |
|---|---|---|
| 정적 | `pnpm build`, strict typecheck, lint | planned |
| 단위 | decimal 재무, recurrence, 루틴, review | planned |
| 통합 | PostgreSQL migration, command/idempotency/conflict, OAuth adapter | planned |
| E2E | 오늘·캡처·캘린더 승인·백업 복구 | planned |
| 수동 | 2주 사용, 실물 iPhone VoiceOver, credentials, remote/backup drill | not done |

`pnpm verify`는 구현 후 위 자동 검증을 묶는 명령이어야 하지만, 현재 성공을 주장할 수 없다. visual check는 밝은 토큰, 232px sidebar, 모바일 overflow, focus state를 Playwright와 수동 확인으로 다룬다. 독립 review는 요구사항 ID와 테스트 ID 누락, 돈/date type 침범, 비밀 노출, 외부 쓰기 우회를 검사한다.
