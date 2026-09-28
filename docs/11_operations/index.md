# 11. 운영 runbook

## 최초 소유자 준비
1. `cp .env.example .env.local` 후 저장소 밖 값으로 채운다: `BETTER_AUTH_SECRET`, `LIFEROUTE_BACKUP_KEY`(둘 다 `openssl rand -base64 32`, 서로 다르게), `BETTER_AUTH_URL`(실제로 접속할 주소), `LIFEROUTE_DATA_DIR`(기본 `~/LifeRouteData`).
2. PostgreSQL: 없으면 `pnpm db:local`(embedded, 데이터는 `$LIFEROUTE_DATA_DIR/postgres`), 출력된 `DATABASE_URL`을 `.env.local`에 넣고 `pnpm db:migrate`.
3. `pnpm owner:create --email … --name …`로 단일 소유자를 만든다(두 번째 실행은 거부). `pnpm dev`(또는 `pnpm build && pnpm start`)와 `pnpm worker`를 띄운다.
4. Google/Toss/AI는 필요한 경우에만 설정한다. 설정 전에는 disconnected 상태가 정상이다.
5. iPhone: 설정 > iPhone 캡처 토큰 발급 → 단축어 ‘URL의 콘텐츠 가져오기’(POST `/api/v1/capture`, `Authorization: Bearer <토큰>`, 양식 `kind`/`text`/`url`/`file`). 실물 동작은 소유자가 확인한다.

## 백업·복구
명령: `pnpm backup [--dir <외장 경로>]`, `pnpm restore --archive <파일> --verify`(복호화·해시 확인만), `pnpm restore --archive <파일> --target-db <빈 새 DB URL> --attachments-dir <새 폴더>`(현재 `DATABASE_URL`로의 복구는 거부). worker는 설정의 시각(기본 03:30, 서울)에 백업하고, 시작 시 마지막 성공이 24시간 전이면 즉시 백업한다. 암호화 키를 잃으면 백업을 열 수 없으므로 키 사본을 오프라인에 보관한다.

매일 catch-up 작업은 암호화 archive, manifest, 각 파일 hash를 생성한다. 보존은 7 daily/4 weekly/12 monthly다. restore는 새 위치/DB에 검증 후 교체하며 manifest와 hash가 하나라도 다르면 중단한다. 목표는 조건부 **RPO 24h, RTO 2h**이고 외부 매체·실제 drill 증거가 없으면 목표일 뿐 verified가 아니다. (FR-010 → OPS-BACKUP-001, OPS-RESTORE-001 planned)

## 장애 대응
worker 실패: job 재시도/로그를 확인하고 idempotency key로 중복을 막는다. Google reauth: Connection을 reauth로 표시하고 수동 재동의를 요청한다. backup 실패: 마지막 성공 시각을 노출하고 다음 catch-up을 보존한다. Tailscale 공개 전환은 HTTPS, 소유자 인증, 원격 기기 enrollment 검토를 별도 변경으로 다룬다.
