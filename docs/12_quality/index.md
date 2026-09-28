# 12. 품질·검증 전략

| 계층 | 범위 | 현재 상태 |
|---|---|---|
| 정적 | `pnpm build`, strict typecheck, lint | 자동 검증 |
| 단위 | decimal 재무, recurrence, 루틴, review, 노트, 컬렉션, 영수증, AI 예산 | 자동 검증 |
| 통합 | PostgreSQL migration, command/idempotency/conflict, 인증, 캡처, 백업·복구, Google/AI 흐름(가짜 제공자) | 자동 검증 |
| E2E | 오늘·캡처·CSRF·자산·노트·레이아웃(데스크톱/iPhone 뷰포트) | 자동 검증 |
| 수동 | 2주 사용, 실물 iPhone VoiceOver, credentials, remote/backup drill | not done |

`pnpm verify` = `typecheck → lint → test(단위) → test:int(PostgreSQL) → build`. E2E는 `pnpm verify:e2e`(Playwright, `E2E_DATABASE_URL`의 DB를 매번 초기화). 실행 결과는 `docs/IMPLEMENTATION.md`에 기록한다. visual check는 밝은 토큰, 232px sidebar, 모바일 overflow, focus state를 Playwright와 수동 확인으로 다룬다. 독립 review는 요구사항 ID와 테스트 ID 누락, 돈/date type 침범, 비밀 노출, 외부 쓰기 우회를 검사한다.
