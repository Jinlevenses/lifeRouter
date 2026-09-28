import type { AccountCategory } from "@liferoute/contracts";

export const CATEGORY_LABEL: Record<AccountCategory, string> = {
  cash: "현금",
  deposit: "예금·입출금",
  savings: "적금",
  investment: "투자",
  pension: "연금(평가액)",
  realEstate: "부동산",
  otherAsset: "기타 자산",
  loan: "대출",
  creditCard: "카드 대금",
  otherLiability: "기타 부채",
};
