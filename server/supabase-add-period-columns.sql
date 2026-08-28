-- ============================================================
-- v2.5g: pocket_sessions 테이블에 공사기간(시작~종료) 컬럼 추가
-- ============================================================
-- 목적: 앱의 "공사기간 자동 숨김" 기능이 여러 사람 폰에서도
--       똑같이 동작하려면, 이 두 값이 서버(DB)에도 저장돼야 함.
--       (기존에는 sheet_title만 저장돼서 엑셀 올린 폰에서만 동작했음)
--
-- 실행 방법: Supabase 프로젝트("PocketBoardPRO", ID: ojmpeuuldpsfuilnneui)
--            SQL Editor에 그대로 붙여넣고 실행. 수정할 값 없음.
-- ============================================================

alter table public.pocket_sessions
  add column if not exists period_start text,
  add column if not exists period_end   text;

comment on column public.pocket_sessions.period_start is '공사기간 시작일 (YYYY-MM-DD) — 엑셀 전체 날짜 범위 기준';
comment on column public.pocket_sessions.period_end   is '공사기간 종료일 (YYYY-MM-DD) — 이 날짜 지나면 앱에서 목록 전체 숨김';
