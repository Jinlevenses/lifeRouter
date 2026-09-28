# 13. 보안·개인정보

소유자 단일 계정은 Better Auth로 인증하고 owner provision CLI 외 공개 signup을 두지 않는다. 세션·CSRF·rate limit·attachment MIME/size/hash 검증, 최소 OAuth scope, 외부 오류의 비밀 마스킹을 적용한다. 백업은 별도 encryption key로 암호화하고 manifest hash로 검증한다.

개인 데이터, OAuth refresh token, API key, 암호화 key, attachment와 백업은 저장소 밖에 둔다. 로그는 잔액·본문·토큰을 기록하지 않는다. Tailscale은 이후 사설 HTTPS 노출만 허용하며 원격 enrollment를 별도 수동 검증한다. (NFR-001 → SEC-001, SEC-ATTACH-001, OPS-RESTORE-001 planned)
