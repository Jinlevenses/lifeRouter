# 08. 노트와 컬렉션

노트 본문은 Tiptap `DocumentNode` JSON과 검색용 text를 함께 저장한다. 저장마다 version을 올리고 `NoteRevision`에 제목·문서·text를 남긴다. 태그 및 note/project/goal 연결로 backlink를 계산한다. Markdown export는 사용자가 요청한 portable 복사본만 생성한다.

사용자 정의 컬렉션은 typed property(text, number, money, date, checkbox, status, select, multiSelect, url, relation)와 table/board/calendar view를 제공한다. formula, rollup, 실시간 협업은 제공하지 않는다. record의 `values`는 property type에 맞게 검증한다. (FR-006 → INT-NOTE-001, UNIT-COLLECTION-001 planned)
