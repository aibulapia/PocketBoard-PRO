-- ============================================================
-- MMEEC 포켓보드 PRO 2.5 — 마스터 모드 + 자동백업 서버 설정
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ⚠️ 실행 전 아래 두 값을 반드시 본인 값으로 변경하세요!
--    1) MASTER_CODE  : 'mmeecsafe'  (관리자 모드 암호)
--    2) BACKUP_TOKEN : 'backup-mmeecsafe-1895' (Apps Script 백업용)
--    변경 방법: 아래에서 Ctrl+F 로 찾아 바꾸기
-- ============================================================

-- ── 1. 현장(세션) 등록소 ──────────────────────────────
create table if not exists public.session_registry (
  session_code text primary key,
  site_name    text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.session_registry enable row level security;
-- anon 직접 접근 정책 없음 → RPC(security definer)로만 접근

-- ── 2. 감독자 연락처 (서버 전용 보관) ──────────────────
create table if not exists public.supervisor_contacts (
  id         bigint generated always as identity primary key,
  name       text not null,
  phone      text not null,
  factory    text not null default '',
  dept       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.supervisor_contacts enable row level security;
-- anon 직접 접근 정책 없음 → 마스터 RPC로만 접근 (일반 사용자 기기에 미전송)

-- ── 3. 마스터 코드 검증 (서버측) ──────────────────────
create or replace function public.master_check(p_code text)
returns boolean language sql immutable as
$$ select p_code = 'mmeecsafe' $$;

-- 공용 가드
create or replace function public.master_guard(p_code text)
returns void language plpgsql as $$
begin
  if not public.master_check(p_code) then
    raise exception 'unauthorized';
  end if;
end $$;

-- ── 4. 세션 등록소 RPC ────────────────────────────────
create or replace function public.master_list_sessions(p_code text)
returns setof public.session_registry
language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  return query select * from session_registry order by created_at;
end $$;

create or replace function public.master_upsert_session(p_code text, p_session text, p_site text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  insert into session_registry (session_code, site_name)
  values (p_session, coalesce(p_site, p_session))
  on conflict (session_code) do update set site_name = excluded.site_name, active = true;
end $$;

create or replace function public.master_delete_session(p_code text, p_session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  delete from session_registry where session_code = p_session;
end $$;

-- ── 5. 전체 통합 내보내기 (마스터 엑셀용) ─────────────
create or replace function public.master_export(p_code text)
returns table (session_id text, site_name text, items jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  return query
    select r.session_code, r.site_name, coalesce(p.items, '[]'::jsonb), p.updated_at
    from session_registry r
    left join pocket_sessions p on p.session_id = r.session_code
    where r.active
    order by r.created_at;
end $$;

-- ── 6. 연락처 RPC (마스터 전용) ───────────────────────
create or replace function public.master_list_contacts(p_code text)
returns setof public.supervisor_contacts
language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  return query select * from supervisor_contacts order by factory, name;
end $$;

create or replace function public.master_upsert_contact(p_code text, p_name text, p_phone text, p_factory text, p_dept text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  insert into supervisor_contacts (name, phone, factory, dept) values (p_name, p_phone, coalesce(p_factory, ''), coalesce(p_dept, ''));
end $$;

create or replace function public.master_delete_contact(p_code text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  delete from supervisor_contacts where id = p_id;
end $$;

-- ── 7. 자동백업용 RPC (Apps Script 매일 06시 트리거) ──
--     마스터 코드와 별개 토큰 — Apps Script에만 보관
create or replace function public.backup_export(p_token text)
returns table (session_id text, site_name text, items jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_token <> 'backup-mmeecsafe-1895' then
    raise exception 'unauthorized';
  end if;
  return query
    select r.session_code, r.site_name, coalesce(p.items, '[]'::jsonb), p.updated_at
    from session_registry r
    left join pocket_sessions p on p.session_id = r.session_code
    where r.active
    order by r.created_at;
end $$;

-- ── 7-2. 공지사항 (관리자 작성, 전체 공개 읽기) ──────────
create table if not exists public.app_notice (
  id         int primary key default 1,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.app_notice (id, body) values (1, '') on conflict (id) do nothing;

-- 공지 읽기 (누구나 — 마스터 코드 불필요, 내용만 공개)
create or replace function public.get_notice()
returns table(body text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select body, updated_at from app_notice where id = 1;
$$;

-- 공지 수정 (관리자만)
create or replace function public.master_set_notice(p_code text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  update app_notice set body = coalesce(p_body, ''), updated_at = now() where id = 1;
end $$;

-- ── 8. anon 실행 권한 부여 ────────────────────────────
grant execute on function
  public.master_check(text),
  public.master_guard(text),
  public.master_list_sessions(text),
  public.master_upsert_session(text, text, text),
  public.master_delete_session(text, text),
  public.master_export(text),
  public.master_list_contacts(text),
  public.master_upsert_contact(text, text, text, text, text),
  public.master_delete_contact(text, bigint),
  public.get_notice(),
  public.master_set_notice(text, text),
  public.backup_export(text)
to anon;

-- ============================================================
-- 참고
--  * 연락처는 이 테이블에만 존재 — 클라이언트 파일(data.js 등)에는
--    절대 넣지 마세요. 마스터 코드 검증 후에만 서버가 전송합니다.
--  * supabase-rls-v2.sql (v2.1의 RLS 강화)도 아직 미적용이라면
--    함께 실행하세요. 두 스크립트는 서로 독립적입니다.
-- ============================================================


-- ============================================================
-- 감독자 연락처 일괄 등록 (52명) — 재실행 안전(전체 삭제 후 재삽입)
-- ============================================================
delete from public.supervisor_contacts;
insert into public.supervisor_contacts (name, phone, factory, dept) values
  ('김숙자', '010-8784-4274', '1공장', '영업1'),
  ('송혜정', '010-9880-0573', '1공장', '영업1'),
  ('이은정', '010-8373-5877', '1공장', '영업1'),
  ('황정희', '010-9494-7505', '1공장', '영업1'),
  ('차진숙', '010-3579-5613', '1공장', '영업1'),
  ('이송희', '010-6423-6822', '1공장', '영업1'),
  ('심윤아', '010-9393-3726', '1공장', '영업1'),
  ('이화선', '010-7520-1454', '2공장', '영업2'),
  ('이수진', '010-4593-3417', '2공장', '영업2'),
  ('이아름', '010-6542-4567', '2공장', '영업2'),
  ('장혜정', '010-3881-5036', '2공장', '영업2'),
  ('홍은경', '010-4318-0128', '2공장', '영업2'),
  ('정희선', '010-4596-6354', '2공장', '영업2'),
  ('최정미', '010-2697-8100', '2공장', '영업2'),
  ('김신희', '010-2867-1970', '2공장', '영업2'),
  ('박남정', '010-8750-2824', '2공장', '영업2'),
  ('박혜영', '010-9235-1160', '2공장', '영업2'),
  ('윤은숙', '010-2464-2237', '2공장', '영업2'),
  ('이규화', '010-9030-8547', '2공장', '영업2'),
  ('이은미', '010-2539-0504', '3공장', '영업3'),
  ('이화선', '010-6392-0851', '3공장', '영업3'),
  ('임경숙', '010-7940-2622', '3공장', '영업3'),
  ('김명희', '010-2864-9917', '3공장', '영업3'),
  ('박수영', '010-3393-7402', '3공장', '영업3'),
  ('김류원', '010-8383-7609', '3공장', '영업3'),
  ('윤신영', '010-3999-9113', '3공장', '영업3'),
  ('한경희', '010-4852-6780', '4공장', '영업4'),
  ('심숙희', '010-5636-6548', '4공장', '영업4'),
  ('이현숙', '010-4870-3414', '4공장', '영업4'),
  ('위은서', '010-4728-7954', '4공장', '영업4'),
  ('이인혜', '010-9929-1415', '4공장', '영업4'),
  ('정다교', '010-8228-1726', '4공장', '영업4'),
  ('전미선', '010-4540-1704', '5공장', '영업5'),
  ('손정욱', '010-3585-0693', '5공장', '영업5'),
  ('윤상미', '010-7506-8779', '5공장', '영업5'),
  ('신명숙', '010-6555-2852', '5공장', '영업5'),
  ('차상숙', '010-9316-6329', '5공장', '영업5'),
  ('김은주', '010-7139-7910', '5공장', '영업5'),
  ('조은영', '010-2500-0158', '5공장', '영업5'),
  ('심주은', '010-2645-8047', '6.엔진', 'PT설비'),
  ('이은영', '010-3844-9440', '6.엔진', 'PT설비'),
  ('최은순', '010-2244-7681', '6.엔진', 'PT집진1'),
  ('김규리', '010-2474-1533', '7.변속기', 'PT집진2'),
  ('이미향', '010-8855-8968', '', 'PT로봇(엔변)'),
  ('이남선', '010-5713-7799', '', '차체로봇(전공장)'),
  ('정인선', '010-8287-6819', '', '차체로봇(전공장)'),
  ('김미정', '010-2022-3159', '', '차체로봇(전공장)'),
  ('배지은', '010-4621-6971', '', '프레스(전공장)'),
  ('박혜란', '010-8854-0121', '', '자동기(전공장)'),
  ('김병훈', '010-2717-6419', '', '차체기술(전공장)'),
  ('박기성', '010-6296-5438', '', '차체기술(전공장)'),
  ('박라희', '010-6585-0887', '8.소재', '8.소재');
