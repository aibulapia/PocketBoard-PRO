# MMEEC 포켓보드 PRO

주말공사 현장 점검 · 긴급공사 등록 · 체감온도 관리 PWA

> **버전: 2.1** (2026-07)
> 배포: Cloudflare Pages
> ⚠️ Private 저장소 — config.js에 서비스 키 포함

## 구성 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 메인 앱 (React CDN + Babel 인브라우저, 단일 파일) |
| `config.js` | Supabase + Google Sheets 연결 키 (⚠️ 키 포함) |
| `storage.js` | 로컬/클라우드 저장, 실시간 동기화, 병합 로직 |
| `manifest.json` | PWA 설정 (PNG 아이콘) |
| `icon-192.png` / `icon-512.png` | PWA 아이콘 |
| `_headers` / `_redirects` | Cloudflare Pages 보안/캐시 헤더 |
| `apps-script-v2.gs` | 구글시트 기록용 Apps Script (토큰 검증) — **별도 적용 필요** |
| `supabase-rls-v2.sql` | Supabase RLS 강화 스크립트 — **별도 실행 필요** |
| `BACKLOG.md` | 개발 백로그 (확정 9건 + 검토 항목) |

## v2.1 변경사항 (v1.0 대비)

- 체감온도 글씨 검정 (관심/주의/경고, 인라인 스타일 강제)
- calcHeatIndex 암묵적 전역변수 수정
- grade 널 체크 (크래시 방지)
- 세션 변경 시 Realtime 자동 재구독
- 엑셀 재업로드 시 인원/체감온도 기록 보존 (NO+공장 보조 매칭)
- 인원수 숫자 검증
- 엑셀 병합셀/공백 헤더 대응 + 파싱 실패 디버그 로그
- 웹훅 공유 토큰 (sheetsToken)
- clear()를 DELETE → 빈 배열 덮어쓰기로 변경 (RLS 대응)
- PWA PNG 아이콘 (192/512)
- 암호 상수화 (ADMIN_PASSWORD)

## 배포 (Cloudflare Pages)

1. 이 저장소를 Cloudflare Pages에 연결 (또는 파일 직접 업로드)
2. 빌드 설정 없음 (정적 파일)
3. 별도 1회 적용 필요:
   - Supabase SQL Editor에서 `supabase-rls-v2.sql` 실행
   - Google Apps Script에 `apps-script-v2.gs` 적용 후 재배포

## 세션 코드

- URL `?session=코드` 로 팀 공유, 미지정 시 `"default"`
- 현장/팀별 고유 코드 사용 권장 (예: `?session=양정동0718`)

---
© 2026 aibulapia@gmail.com — 무단 복제 금지
