# MMEEC 포켓보드 PRO — 프로젝트 백업 문서

> 작성일: 2026-07-12  
> 버전: 1.0  
> 배포: https://weekends-c.netlify.app/

---

## 📁 배포 파일 목록

| 파일 | 역할 |
|------|------|
| `index.html` | 메인 앱 (React CDN + Babel 인브라우저) |
| `config.js` | Supabase + Google Sheets 연결 키 |
| `storage.js` | 로컬/클라우드 저장 및 실시간 동기화 |
| `manifest.json` | PWA 설정 |
| `netlify.toml` | 배포 및 보안 헤더 설정 |

---

## 🔑 연결 서비스

### Supabase
- **프로젝트명**: pocketboard1
- **Project ID**: ojmpeuuldpsfuilnneui
- **Region**: ap-northeast-2 (Seoul)
- **URL**: https://ojmpeuuldpsfuilnneui.supabase.co
- **Publishable Key**: sb_publishable_4fsA55-lJq9glbcg9Lqd6A__XmIJwIa
- **테이블**: `public.pocket_sessions`
- **RLS**: 활성화 (공개 정책 - 세션 ID 기반 접근)

### Google Sheets (체감온도 자동 기록)
- **시트 ID**: 1wXrksZQM9bLI4HtsbpLP72RKX2MKfo7phehlqDIsM5o
- **Apps Script URL**: https://script.google.com/macros/s/AKfycbxPZQ-RW9iDpZaiiT5FaceGlo0v1tbvQMgupstSjTwZAc37Z0eepChi0nAlqgKZKN8n/exec
- **탭 구조**: 일자별 자동 생성 (예: 2507-12)
- **연장작업**: 새벽 06:00 이전은 전날 탭에 기록

---

## ⚙️ config.js

```javascript
window.APP_CONFIG = {
  supabaseUrl: "https://ojmpeuuldpsfuilnneui.supabase.co",
  supabaseKey: "sb_publishable_4fsA55-lJq9glbcg9Lqd6A__XmIJwIa",
  sheetsWebhookUrl: "https://script.google.com/macros/s/AKfycbxPZQ-RW9iDpZaiiT5FaceGlo0v1tbvQMgupstSjTwZAc37Z0eepChi0nAlqgKZKN8n/exec",
};
```

---

## 🏭 지원 공장 목록 (SUPPORTED_FACTORIES)

1공장 / 2공장 / 3공장 / 4공장 / 5공장 / 6.엔진 / 7.변속기 / 8.소재 / 9.기타 / 10.아산 / 11.남양 / 12.광명

---

## 🔐 암호 보호 기능

| 기능 | 암호 |
|------|------|
| 데이터 초기화 | **1895** |
| 회사명 수정 | **1895** |

---

## 🌡️ 체감온도 계산기

### 공식
**기상청 2022년 6월 개정 산출식** (Stull 2011 습구온도 추정식 적용)

```
Tw = Ta × ATAN[0.151977(RH+8.313659)^½]
   + ATAN(Ta+RH) - ATAN(RH-1.67633)
   + 0.00391838 × RH^1.5 × ATAN(0.023101×RH) - 4.686035

체감온도 = -0.2442 + 0.55399×Tw + 0.45535×Ta - 0.0022×Tw² + 0.00278×Tw×Ta + 3.0
```

### KOSHA 위험 단계 (안전보건공단 기준)

| 단계 | 온도 | 색상 | 아이콘 | 조치 |
|------|------|------|--------|------|
| 관심 | 31~33℃ | 하늘색 | ○ | 충분한 물 섭취, 주기적 휴식 |
| 주의 | 33~35℃ | 노란색 | ■ | 2시간 작업 시 20분 휴식 |
| 경고 | 35~38℃ | 주황색 | ▲ | 매시간 15분 휴식 권고 |
| 위험 | 38℃↑  | 빨간색 | ◆ | 작업 중지 권고, 즉시 대피 |

---

## 📋 안전보고문 고정 항목

```
공사 전/중/후 안전작업 이행결과
*업 체 명 : MMEEC  (수정 가능, 암호 1895)
*허가번호 : 2607
```

### 작업유형 코드 → 안전대책 자동 조합

| 코드 | 작업유형 | 대표 안전대책 |
|------|----------|--------------|
| 고 | 고소작업 | 안전벨트(그네식) 착용 및 2중 고리 체결 |
| 중 | 중량물 | 중량물 취급 시 2인1조 작업 및 상호 신호 |
| 자 | 자동화설비 | 자동화 공정 진입 시 전원 차단 및 LOTO 체결 |
| 화 | 화기작업 | 화기(화재) 감시자 배치 |
| 밀 | 밀폐공간 | 밀폐 안전수칙 준수 |
| 건 | 건설기계 | 신호수 배치 및 작업장 통제 |
| 청 | 청소 | 안전보호구 착용 |
| 운 | 운반 | 중량물 취급 시 2인1조 작업 |
| 전 | 전기작업 | 전원 차단 및 LOTO 체결 |

공통 기본 수칙 (항상 포함):
- 안전보호구 착용
- 작업 전/후 구역 설정 및 주변 정리정돈
- 작업자 건강 및 음주 여부 확인

---

## 🛠️ 주요 기능 목록 (22가지)

1. 공장 탭 고정 (탭만 상단 고정, 헤더는 스크롤)
2. 엑셀/CSV 업로드 및 파싱 (날짜 컬럼 자동 인식 — 월~일 전체)
3. Supabase 클라우드 실시간 동기화 (WebSocket Realtime)
4. 세션 코드로 팀원 공유 (?session=코드)
5. 내 공장 필터 (기기별 localStorage 저장, 기본값: 4·5공장)
6. TODAY 배지 자동 표시 (오늘 요일 기준 투입인원>0 공사)
7. 공사 추가 탭 (당일외 공사 선택 추가 + 긴급공사 등록)
8. 카드별 공사위치 입력 (층수탭: B1/1층/2층/2.5층/3층/옥상/옥외)
9. 담당 감독자 지정 (공장별 고정 명단 + 직접 입력)
10. 작업 인원 입력 (직영/일용/협력사명+인원)
11. 특이사항 메모 (Memo here)
12. 💬 카톡 복사 (공사명+위치+감독자+인원 축약 형식)
13. 📋 안전보고문 복사 (공사전/중/후 + 65세 고령자 옵션)
14. 🌡️ 체감온도 계산기 (기상청 2022 Stull 공식, KOSHA 기준)
15. 체감온도 구글 시트 자동 기록 (Apps Script, 일자별 탭)
16. 체감온도 결과 카드별 개별 표시 (Supabase 저장)
17. 회사명 버튼 수정 (암호 1895, localStorage 저장)
18. 초기화 암호 보호 (암호 1895)
19. ℹ️ 프로그램 정보 (v1.0, aibulapia@gmail.com)
20. 최초 실행 내 공장 세팅 팝업 (4·5공장 기본 선택)
21. KOSHA 색상 체계 (관심/주의/경고/위험)
22. 긴급공사 등록 마법사 (5단계 자동 공사명 생성)

---

## 📊 구글 시트 구조

### 탭 명명 규칙
`YYMM-DD` 형식 (예: `2507-12`)

### 시트 헤더 (2행)
| 공장 | 사업장 | 공사명 | 등급 | 작업 | 기록1 | 기록2 | ... | 기록8 |

### 기록 셀 형식
```
09:15
○관심 31.2℃
```

### 연장작업 처리
- 00:00~05:59 → 전날 탭에 자동 기록

---

## 🔒 보안 주의사항

1. `supabese_key.txt` — 배포 폴더에 절대 포함 금지 (시크릿 키 포함)
2. Supabase RLS 정책이 현재 전체 공개 상태 — 운영 중요도에 따라 강화 권장
3. Apps Script URL은 공개되면 누구나 시트에 기록 가능 — 필요시 토큰 인증 추가 권장

---

## 📱 PWA 설치

모바일 브라우저에서 https://weekends-c.netlify.app/ 접속 후:
- **Android**: 브라우저 메뉴 → "홈 화면에 추가"
- **iOS**: Safari → 공유 → "홈 화면에 추가"

---

*© 2026 aibulapia@gmail.com — 제작자의 동의 없이 무단 복제를 엄금합니다.*
