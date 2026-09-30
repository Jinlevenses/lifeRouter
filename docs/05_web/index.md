# 05. 웹 클라이언트

Next 16 + React + Tailwind 4 + shadcn/ui(Radix)를 사용한다(ADR-016). 웹(데스크톱) 사용을 우선으로 설계하고(Q-8) 데스크톱은 232px shadcn Sidebar, 모바일은 1열과 하단 바의 캡처 버튼을 쓴다. Radix primitive는 focus trap, escape, aria 관계를 유지하는 데 사용하되 색·간격은 제품 토큰으로 통일한다.

## 디자인 시스템
- **설치 방식**: shadcn/ui 공식 CLI. `pnpm dlx shadcn@latest add <이름>`을 `apps/web`에서 실행하면 `src/components/ui`에 복사된다(`components.json`: style new-york, Tailwind 4, `@/components/ui`). Magic UI는 `shadcn add @magicui/<이름>`.
- **토큰**: `src/app/globals.css`의 shadcn 변수에 제품 값을 넣는다 — background `#F7F8FA`, foreground `#18212B`, card `#FFFFFF`, primary `#0F766E`, border `#E5E8EC`, radius 10px. 상태색 `success/warning/info`는 LifeRoute 추가 토큰이다.
- **계층**: `components/ui`(shadcn·Magic UI 원본, 수정은 주석으로 표시) → `components/app`(Card+헤더, EmptyState, Badge 톤, 반응형 Sheet=데스크톱 Dialog/모바일 Drawer, Field·MoneyInput·SearchInput, Segmented, StatTile, GoalRing, Sonner 토스트) → 화면.
- **강조 요소(Magic UI)**: 오늘 화면 통계 타일의 NumberTicker, 오늘의 3가지 카드 BorderBeam, 3가지를 모두 끝냈을 때 Confetti, 순자산 목표 AnimatedCircularProgressBar, 카드 진입 BlurFade, 로그인 AuroraText·DotPattern.
- **규칙**: 금액은 애니메이션·숫자 변환하지 않는다(NumberTicker는 개수만). `MotionConfig reducedMotion="user"`와 CSS 규칙으로 ‘동작 줄이기’를 따른다. 버튼은 기본 `type="button"`(제출 버튼만 `type="submit"`).

화면은 optimistic UI로 version을 보내며 409이면 최신 데이터 비교/재적용을 제공한다. 폼은 금액을 숫자로 변환하지 않고 decimal 문자열로 유지한다. 외부 캘린더 변경 버튼은 승인 대기 Proposal과 managed 여부를 명확히 표시한다. 시각 회귀는 Playwright screenshot과 수동 iPhone/VoiceOver로 확인한다 (E2E-WEB-001 자동, A11Y-001의 VoiceOver는 수동).
