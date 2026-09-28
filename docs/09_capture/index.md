# 09. 모바일 캡처와 영수증

iPhone Share Sheet/Shortcuts는 텍스트, URL, 이미지 또는 영수증을 InboxItem으로 보낸다. 요청은 인증되며 attachment는 hash·MIME·크기 검사 후 저장소 외부에 저장한다. Inbox는 new → converted/archived 전이만 허용하고 원본과 변환 대상 관계를 남긴다.

영수증 OCR은 로컬 처리 우선이다. merchant/amount/date는 draft로만 만들고 사용자가 확인한 뒤에 `confirmed`가 된다. OCR 실패나 불확실한 필드는 빈 값/원문을 보존하며 추측으로 금융 기록을 만들지 않는다. (FR-007 → E2E-CAPTURE-001, UNIT-RECEIPT-001 planned)
