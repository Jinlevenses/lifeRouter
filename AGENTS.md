# AGENTS.md — LifeRoute 작업 규약

AI 에이전트와 사람이 이 저장소에서 작업할 때 지키는 규칙입니다 (docs/15_ai 맥락 지도의 “기준”).

## 읽는 순서
1. 사용자 승인 범위: `docs/00_project/index.md` (요구사항·ADR·추적성)
2. 계약: `packages/contracts/index.ts` — API·도메인의 단일 기준. 여기에 없는 명령·필드는 존재하지 않는다.
3. 실제 검증 원장: `docs/IMPLEMENTATION.md` — 명령 출력으로 확인된 것만 verified
4. 작업 목록: `tasks/REGISTRY.md`
5. 해당 영역 문서: `docs/01_product` … `docs/15_ai`
6. Next.js 16 코드를 쓰기 전: `apps/web/AGENTS.md` (번들된 최신 문서를 읽을 것)

## 불변식 (어기면 안 됨)
- 금액은 decimal 문자열. JS number로 바꾸지 않는다(`parseFloat` 금지 lint). 산술은 `@liferoute/core` money 함수만.
- 업무일은 `YYYY-MM-DD`(Asia/Seoul), 시각은 UTC ISO(Z). “오늘”은 서버가 정해 `WorkspaceData.today`로 내려준다. `new Date().toISOString().slice(0,10)` 금지.
- 모든 쓰기는 `/api/v1/commands`의 typed Command 하나로. version 자원은 expectedVersion 필수, 충돌은 409(덮어쓰지 않음). 재시도는 같은 idempotencyKey.
- 부채는 항상 순자산에서 차감(보관만 제외). 국민연금 미래 수급권 계좌는 만들지 않는다.
- 외부 쓰기(Google)는 Proposal → 소유자 승인 → worker, managed 이벤트/‘LifeRoute’ 캘린더에만.
- AI는 소유자가 고른 노트만, 예상 비용·잔여 예산 확인과 명시적 동의 뒤에만. AI는 재무·일정·설정 명령을 실행할 수 없다.
- 비밀·개인 데이터·첨부·백업은 저장소 밖(`LIFEROUTE_DATA_DIR`, `.env.local`). 로그에 잔액·본문·토큰 금지.
- 공개 가입 없음. 소유자는 `pnpm owner:create`로 한 명만.
- UI 부품은 shadcn/ui·Magic UI를 공식 CLI(`pnpm dlx shadcn@latest add …`, `apps/web`에서)로 `components/ui`에 추가한다. 손으로 비슷한 부품을 새로 만들지 않고, 앱 전용 조합은 `components/app`에 둔다. `components/ui`를 고치면 `// LifeRoute:` 주석을 남긴다. 금액은 애니메이션하지 않는다.

## 변경 절차
- 계약을 바꾸면: `packages/contracts/index.ts` → `docs/00_project`(ADR·추적성) → 해당 영역 문서 → 테스트.
- 스키마를 바꾸면: `packages/server/src/db/schema.ts` 수정 후 `pnpm db:generate --name <이름>`로 마이그레이션 생성(손으로 쓰지 않음).
- 새 명령은 `packages/server/src/commands/index.ts`의 handlers에 등록해야 컴파일된다.

## 완료라고 말하기 전에
- `pnpm verify`(typecheck → lint → 단위 → 통합 → build)를 돌리고, E2E가 닿는 변경이면 `pnpm verify:e2e`.
- 출력 없이 “완료/검증됨”이라 쓰지 않는다. `docs/IMPLEMENTATION.md`에는 실행한 명령과 결과만 적는다.
- 자동 테스트로 주장할 수 없는 것: 2주 실사용, 실물 iPhone·VoiceOver, 실제 Google/Toss/AI 자격·청구, OCR 정확도, 외부 매체 백업·복구 훈련, Tailscale 원격 접근.
