-- ============================================================
-- MMEEC 포켓보드 PRO 2.1 — Supabase RLS 강화 스크립트
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ============================================================
-- 배경:
--   현재 pocket_sessions 테이블은 전체 공개 정책이라
--   publishable 키만 알면 누구나 읽기/쓰기/삭제 가능.
--   publishable 키는 브라우저에 노출되는 것이 전제이므로,
--   완전한 보호는 불가능하지만 아래 조치로 위험을 크게 줄임:
--     1) DELETE 전면 차단 (앱의 '초기화'는 빈 배열 저장으로 대체)
--     2) session_id 최소 길이 강제 → 무작위 대입 난이도 상승
--     3) items 크기 제한 → 스팸/저장소 남용 방지
-- ============================================================

-- 0. 기존 전체 공개 정책 제거 (정책 이름은 대시보드에서 확인 후 필요시 수정)
drop policy if exists "Enable all access" on public.pocket_sessions;
drop policy if exists "public access" on public.pocket_sessions;
-- 현재 걸려있는 정책 이름 확인용:
-- select policyname from pg_policies where tablename = 'pocket_sessions';

-- 1. RLS 활성화 (이미 활성화되어 있어도 무해)
alter table public.pocket_sessions enable row level security;

-- 2. SELECT: session_id가 6자 이상인 행만 조회 허용
create policy "select_min_session_len"
on public.pocket_sessions
for select
to anon
using ( char_length(session_id) >= 6 );

-- 3. INSERT: session_id 6자 이상 + items 용량 1MB 이하만 허용
create policy "insert_valid_session"
on public.pocket_sessions
for insert
to anon
with check (
  char_length(session_id) >= 6
  and pg_column_size(items) < 1048576
);

-- 4. UPDATE: 동일 조건
create policy "update_valid_session"
on public.pocket_sessions
for update
to anon
using ( char_length(session_id) >= 6 )
with check (
  char_length(session_id) >= 6
  and pg_column_size(items) < 1048576
);

-- 5. DELETE: anon 키로는 삭제 불가 (정책을 만들지 않음 = 전면 차단)
--    ※ 앱의 storage.js clear()가 DELETE를 호출하므로,
--      아래 "앱 코드 반영" 항목처럼 빈 배열 저장 방식으로 변경 필요
--      (v2.1 storage.js에 이미 반영되어 있음)

-- ============================================================
-- 주의사항
-- ============================================================
-- * 기존에 6자 미만 세션 코드("default" 는 7자라 통과)를 쓰던 팀원이 있다면
--   짧은 코드는 더 이상 조회되지 않으므로 새 코드로 안내 필요.
-- * 세션 코드는 추측 불가능한 조합 권장: 예) "2607-4공장-x7k2"
-- * 근본적 보호가 필요하면 Supabase Auth(익명 로그인) + 
--   session_id를 사용자별 소유로 묶는 구조로 전환해야 함 (v3 과제)
