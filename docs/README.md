# MMEEC 포켓보드 PRO

## 📁 폴더 구조 (2026-07.29 개편)

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

> **버전: 2.22d** (2026-07-29)
> 배포: Cloudflare Pages
> ⚠️ Private 저장소 — config.js에 서비스 키 포함

## 구성 파일

| 파일 | 역할 | 배포 |
|---|---|---|
| `index.html` | 메인 앱 (React CDN + Babel, 단일 파일) | ✅ |
| `config.js` | Supabase + 구글시트 + 기상청 API 키 | ✅ |
| `data.js` | **감독자 명단·공장·안전대책** (이름만! 연락처 금지) | ✅ |
| `storage.js` | 저장·동기화·병합 | ✅ |
| `manifest.json`, `icon-192/512.png` | PWA | ✅ |
| `_headers`, `_redirects`, `wrangler.toml` | Cloudflare 설정 | ✅ |
| `supabase-rls-v2.sql` | RLS 강화 | Supabase에서 1회 실행 |
| `supabase-master-v3.sql` | **마스터 모드 + 백업 RPC** (코드/토큰 변경 후 실행!) | Supabase에서 1회 실행 |
| `apps-script-v3.gs` | 체감온도 기록 + **매일 06시 자동백업** | Apps Script에 적용 |
| `apps-script-v2.gs` | (구버전 — v3로 대체됨) | 사용 안 함 |
| `BACKLOG.md` | 기능 명세 및 배포 체크리스트 | 문서 |

## v2.2 주요 기능 (v2.1 → 2.2)

1. **폭염대책 자동 작성** — 안전보고문에 체감온도(공사전=최초/공사중=12~14시) + 조치 자동 삽입, 미측정 시 경고팝업
2. **기상 정보 팝업** — 양정동 실황 기온·습도 + 기상특보/통보문, 2시간 자동 갱신
3. **카톡 인앱 우회 + PWA 설치 안내**
4. **관리자(마스터) 모드** — 서버 검증, 현장 등록소, 연락처 서버 보관
5. **엑셀 다운로드** — 일반=내 세션 / 마스터=전체 통합, **매일 06시 구글시트 자동백업**
6. **작업연장** — "22시연장" 표기, 17시 후 배지 자동 전환(종료/연장)
7. **TODAY 터치 토글** — 회색 이탤릭 취소, 06시 리셋
8. **n일째 표시** — 실제 작업일 카운트
9. **data.js 분리** — 명단 수정은 이 파일만
10. **06시 일일 체계** — 상태·연장·표시 자동 리셋 (심야작업 보호)

## 초기 설정 순서

1. `supabase-master-v3.sql` 열어 `CHANGE-MASTER-CODE`, `CHANGE-BACKUP-TOKEN`을 본인 값으로 변경 → Supabase SQL Editor 실행
2. `supabase-rls-v2.sql`도 실행 (미적용 상태였다면)
3. `apps-script-v3.gs`의 `BACKUP_TOKEN`을 1번과 동일하게 수정 → Apps Script에 붙여넣기 → `createDailyTrigger` 1회 실행 → 웹앱 재배포 (URL 변경 시 config.js 갱신)
4. 전체 파일 Cloudflare Pages 배포
5. 관리자 모드 접속 → 사용 중인 세션 코드를 등록소에 등록 (자동백업 대상이 됨)

## 감독자 명단 수정

`data.js` 열어 이름 수정 → 재배포. **연락처는 절대 이 파일에 넣지 말 것** (관리자 모드의 연락처 기능 사용 — 서버에만 저장됨)

---
© 2026 aibulapia@gmail.com — 무단 복제 금지
