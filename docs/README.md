# 문서 커버리지와 읽는 순서

| 영역 | 문서 | 주된 증거/추적 |
|---|---|---|
| 기준 범위 | [00_project](00_project/index.md) | 요구사항·ADR·traceability |
| 사용자 제품 | [01_product](01_product/index.md), [05_web](05_web/index.md) | 화면·접근성 |
| 경계·영속성 | [02_architecture](02_architecture/index.md), [03_data](03_data/index.md), [04_api](04_api/index.md) | 계약·마이그레이션 |
| 도메인 | [07_finance](07_finance/index.md), [08_notes](08_notes/index.md), [09_capture](09_capture/index.md), [10_review](10_review/index.md) | 단위/통합 테스트 |
| 연동·운영 | [06_integrations](06_integrations/index.md), [11_operations](11_operations/index.md), [13_security](13_security/index.md) | 수동 runbook |
| 품질·계획·AI | [12_quality](12_quality/index.md), [14_roadmap](14_roadmap/index.md), [15_ai](15_ai/index.md) | 원장·작업 레지스트리 |

**진실의 우선순위:** 사용자 승인 범위 → `packages/contracts/index.ts` → `docs/IMPLEMENTATION.md`의 실제 검증 원장 → 각 영역 문서. 작업 단위는 [tasks/REGISTRY.md](../tasks/REGISTRY.md), 작업 규약은 [AGENTS.md](../AGENTS.md). 요구사항별 상태(자동 검증/수동 미검증)는 [00_project](00_project/index.md) 추적성 표가 기준이며, 설계 검토 기록은 [plan-review-2026-09-28.md](00_project/plan-review-2026-09-28.md)다.
