# 11. 운영 runbook

## 최초 소유자 준비
1. 저장소 밖에 `DATABASE_URL`, auth secret, encryption key, OAuth credential을 준비한다.
2. `pnpm db:local` 또는 관리 PostgreSQL을 시작하고 `pnpm db:migrate`를 실행한다.
3. `pnpm owner:create`로 단일 소유자를 만든 뒤 `pnpm dev`를 실행한다.
4. Google/Toss/AI는 필요한 경우에만 설정한다. 설정 전에는 disconnected 상태가 정상이다.

## 백업·복구
매일 catch-up 작업은 암호화 archive, manifest, 각 파일 hash를 생성한다. 보존은 7 daily/4 weekly/12 monthly다. restore는 새 위치/DB에 검증 후 교체하며 manifest와 hash가 하나라도 다르면 중단한다. 목표는 조건부 **RPO 24h, RTO 2h**이고 외부 매체·실제 drill 증거가 없으면 목표일 뿐 verified가 아니다. (FR-010 → OPS-BACKUP-001, OPS-RESTORE-001 planned)

## 장애 대응
worker 실패: job 재시도/로그를 확인하고 idempotency key로 중복을 막는다. Google reauth: Connection을 reauth로 표시하고 수동 재동의를 요청한다. backup 실패: 마지막 성공 시각을 노출하고 다음 catch-up을 보존한다. Tailscale 공개 전환은 HTTPS, 소유자 인증, 원격 기기 enrollment 검토를 별도 변경으로 다룬다.
