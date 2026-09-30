# LifeRoute

나 한 사람을 위한 local-first 인생·생활 관리 웹 서비스입니다. Mac에서 돌리고 Mac(웹 우선)/iPhone 브라우저로 씁니다. 화면은 shadcn/ui 부품에 Magic UI 강조 요소를 얹어 만들었습니다.

- **오늘**: 오늘의 3가지, 오늘 일정(LifeRoute 일정 + 시각을 정한 할 일 + Google), 루틴 체크, 순자산
- **계획**: 목표(방향) → 프로젝트(완료 기준) → 할 일(실행 단위), 마감일과 캘린더 배치 분리, 반복, 루틴
- **자산**: 계좌별 수동 잔액 스냅샷, 순자산 = 포함 자산 − 모든 부채, 유동 자산, 1억/36개월 목표
- **노트·컬렉션**: Tiptap 편집기, 링크·역링크, 이전 버전, Markdown 내보내기, 표·보드·달력 컬렉션
- **Inbox**: iPhone 공유 시트/단축어 캡처, 할 일·노트·영수증으로 변환, 영수증은 직접 확인해야 확정
- **검토**: 주간/월간 결정론적 집계 + 내 회고, 동의한 노트만 보내는 선택형 AI 분석(OpenAI GPT, 월 3,000원 한도)
- **운영**: 매일 암호화 백업(7일/4주/12개월 보존), 검증 복구, 전체 내보내기

문서는 [docs/](docs/README.md), 구현·검증 원장은 [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md), 작업 목록은 [tasks/REGISTRY.md](tasks/REGISTRY.md)입니다.

## 처음 실행 (Mac)

필요: Node 22+ (24 권장), pnpm 10 (`corepack enable`), PostgreSQL 16+ (없으면 아래 `db:local`).

```bash
pnpm install
cp .env.example .env.local        # 값 채우기: BETTER_AUTH_SECRET, LIFEROUTE_BACKUP_KEY (openssl rand -base64 32)

# PostgreSQL이 없다면 (Docker 없이 실제 PostgreSQL 실행, 터미널 하나를 계속 씁니다)
pnpm db:local                     # 출력된 DATABASE_URL을 .env.local에 넣기

pnpm db:migrate
pnpm owner:create --email you@example.com --name 이름    # 소유자는 딱 한 명, 공개 가입 없음
pnpm dev                          # http://localhost:3000
pnpm worker                       # 다른 터미널: 백업·동기화·AI 작업기
```

iPhone에서 쓰려면 같은 Wi-Fi에서 `http://<Mac의 IP>:3000`으로 접속하되 `.env.local`의 `BETTER_AUTH_URL`을 그 주소로 바꿉니다. 외부(Tailscale 사설 HTTPS) 노출은 별도 변경으로 다룹니다 ([docs/11_operations](docs/11_operations/index.md)).

Docker로 돌리려면 `.env.local`에 `POSTGRES_PASSWORD`를 넣고 `docker compose --env-file .env.local up -d`.

## 개발

```bash
pnpm verify        # typecheck → lint → 단위 → 통합(PostgreSQL 필요) → build
pnpm test          # 단위 테스트
pnpm test:int      # 통합 테스트 (TEST_DATABASE_URL, 기본 postgres://liferoute:liferoute@127.0.0.1:5432/liferoute_test)
pnpm verify:e2e    # Playwright E2E (E2E_DATABASE_URL, 기본 liferoute_e2e — 매번 지워집니다)
pnpm seed:demo     # 빈 개발 DB에 예시 데이터
```

구조: `packages/contracts`(API·도메인 계약, zod) · `packages/core`(순수 도메인: 금액·날짜·반복·순자산·검토) · `packages/server`(DB·명령·연동·백업) · `apps/web`(Next 16 UI와 `/api/v1`) · `scripts`(마이그레이션, 소유자, 작업기, 백업/복구).

UI 부품 추가: `apps/web`에서 `pnpm dlx shadcn@latest add <이름>`(shadcn/ui) 또는 `pnpm dlx shadcn@latest add @magicui/<이름>`(Magic UI). 파일은 `src/components/ui`에 복사되고, 앱 전용 조합은 `src/components/app`에 둡니다([docs/05_web](docs/05_web/index.md)).

## 연동 (모두 기본 꺼짐)

| 연동 | 켜는 방법 | 비고 |
|---|---|---|
| Google 캘린더 | `GOOGLE_CLIENT_ID/SECRET` 설정 → 설정 > 연결 | 모든 캘린더 읽기, 승인한 일정만 별도 ‘LifeRoute’ 캘린더에 쓰기 |
| Notion Calendar | Google 연결 후 Notion Calendar에 같은 Google 계정 추가 | ‘LifeRoute’ 캘린더가 Notion Calendar에 보이고, Notion Calendar에서 Google 캘린더에 만든 일정이 ‘오늘’에 들어옴 |
| AI 분석 (GPT) | `OPENAI_API_KEY` 설정 → 설정 > AI (모델·단가 입력) | 동의·예상 비용 확인 후 고른 노트만 전송, 월 한도 차단 |
| 토스증권 잔고 | 미구현(인터페이스만) | 공식 Open API 문서·키·허용 IP 확인 후 연결, 그 전엔 수동 잔액 |
| 토스뱅크 잔액 | 미구현 | 개인용 공식 API 확인 전까지 수동 잔액 |
| OCR | 미구현(인터페이스만) | 영수증은 직접 입력해 확정 |
