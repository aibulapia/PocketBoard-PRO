# MMEEC 포켓보드 PRO

## 📁 폴더 구조 (2026-07 개편)

| 폴더 | 내용 | 웹 배포 |
|---|---|---|
| `public/` | index.html, config.js, data.js, storage.js, manifest.json, 아이콘, _headers, _redirects | ✅ **이 폴더만 배포됨** |
| `server/` | supabase-*.sql, apps-script-v3.gs (Supabase·구글시트에 붙여넣는 설정문) | ❌ |
| `docs/` | README, BACKLOG, 백업문서(인증정보 제거본) | ❌ |

> ⚠️ **Cloudflare Pages 설정**: Build output directory = `public`
> 이 설정 덕분에 `server/`·`docs/`의 파일은 웹에 노출되지 않습니다.
> 새 파일을 추가할 때 **웹에 공개돼도 되는 것만 `public/`에** 넣으세요.

> ⚠️ **인증정보는 저장소에 기록하지 않습니다.** 관리자 코드·백업 토큰 등은 별도 보관합니다.

---


주말공사 현장 점검 · 긴급공사 등록 · 체감온도 관리 PWA

> **버전: 2.23** (2026-07-30)
> 배포: Cloudflare Pages (https://pocketboardprov2.pages.dev/)
> ⚠️ Private 저장소 — config.js에 서비스 키 포함
> 전체 버전 이력은 [`CHANGELOG.md`](./CHANGELOG.md) 참고

## 구성 파일 (2026-07 폴더 개편 반영)

| 파일 | 위치 | 역할 |
|---|---|---|
| `index.html` | `public/` | 메인 앱 (React CDN + Babel, 단일 파일) |
| `config.js` | `public/` | Supabase + 구글시트 + 기상청 API 키 |
| `data.js` | `public/` | **감독자 명단·공장·안전대책** (이름만! 연락처 금지) |
| `storage.js` | `public/` | 저장·동기화·병합 |
| `manifest.json`, `icon-192/512.png` | `public/` | PWA |
| `_headers`, `_redirects` | `public/` | Cloudflare 설정 |
| `supabase-rls-v2.sql` | `server/` | RLS 강화 (Supabase에서 1회 실행, 완료됨) |
| `supabase-rotate-codes-v1.sql` | `server/` | 관리자 코드·백업 토큰 교체용 |
| `supabase-access-v1.sql` | `server/` | 접속 현황 기능 (Supabase에서 실행 완료) |
| `apps-script-v3.gs` | `server/` | 체감온도 기록 + 자동백업(05시, 현재 미사용) |
| `supabase-master-v3.sql` | `server/` | ⚠️ v2.5 시점 구버전 — **재실행 금지**, 참고용만 |

## 최근 주요 버전 요약

- **v2.23** — "오늘로" 버튼 삭제, 날짜 표시 터치로 오늘 이동 대체, 예정 공사 건수 글씨 확대
- **v2.22d** — 카드 목록 날짜 필터 해제(전체 표시), 예정 건수 문구 분리
- **v2.22c** — 체감온도 기록 1일 리셋 (서버 저장 한도 초과 방지)
- **v2.22b** — 다크모드 가독성 보정, 스와이프 슬라이드 피드백, 안전보고문 공장 한정(5공장)
- **v2.22a** — 날씨·날짜·안내문 한 줄 정리 (폴드4 폭 대응)
- **v2.22** — 카드에서 체감온도·안전보고문 바로 처리, 바텀시트 버튼 재구성
- **v2.21** — 헤더 재배치, 초기화·파일변경 최고관리자 전용화
- **v2.20a** — 다크모드 카드 그라디언트 가독성 버그 수정
- **v2.20** — 다크모드 토글, 엑셀 재업로드 안내 문구
- 그 이전 이력(v2.1~v2.19b, 보안 조치 경위 포함)은 [`CHANGELOG.md`](./CHANGELOG.md) 참고

## 관리자 설정 (최초 1회, 완료됨)

1. ~~`supabase-master-v3.sql` 실행~~ → 이후 `supabase-rotate-codes-v1.sql`로 코드 교체 완료
2. `supabase-rls-v2.sql` 실행 완료
3. `supabase-access-v1.sql` 실행 완료 (접속 현황 기능)
4. Apps Script 자동백업은 **현재 미사용** — 필요 시 `apps-script-v3.gs`(05시 트리거로 설정됨) 적용

## 감독자 명단 수정

`public/data.js` 열어 이름 수정 → 재배포. **연락처는 절대 이 파일에 넣지 말 것** (관리자 모드의 연락처 기능 사용 — 서버에만 저장됨)

---
© 2026 aibulapia@gmail.com — 무단 복제 금지
