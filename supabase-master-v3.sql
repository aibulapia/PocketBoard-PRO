-- ============================================================
-- MMEEC 포켓보드 PRO 2.5 — 마스터 모드 + 자동백업 서버 설정
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ⚠️ 실행 전 아래 두 값을 반드시 본인 값으로 변경하세요!
--    1) MASTER_CODE  : 'CHANGE-MASTER-CODE'  (관리자 모드 암호)
--    2) BACKUP_TOKEN : 'CHANGE-BACKUP-TOKEN' (Apps Script 백업용)
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
  created_at timestamptz not null default now()
);
alter table public.supervisor_contacts enable row level security;
-- anon 직접 접근 정책 없음 → 마스터 RPC로만 접근 (일반 사용자 기기에 미전송)

-- ── 3. 마스터 코드 검증 (서버측) ──────────────────────
create or replace function public.master_check(p_code text)
returns boolean language sql immutable as
$$ select p_code = 'CHANGE-MASTER-CODE' $$;

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

create or replace function public.master_upsert_contact(p_code text, p_name text, p_phone text, p_factory text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform master_guard(p_code);
  insert into supervisor_contacts (name, phone, factory) values (p_name, p_phone, coalesce(p_factory, ''));
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
  if p_token <> 'CHANGE-BACKUP-TOKEN' then
    raise exception 'unauthorized';
  end if;
  return query
    select r.session_code, r.site_name, coalesce(p.items, '[]'::jsonb), p.updated_at
    from session_registry r
    left join pocket_sessions p on p.session_id = r.session_code
    where r.active
    order by r.created_at;
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
  public.master_upsert_contact(text, text, text, text),
  public.master_delete_contact(text, bigint),
  public.backup_export(text)
to anon;

-- ============================================================
-- 참고
--  * 연락처는 이 테이블에만 존재 — 클라이언트 파일(data.js 등)에는
--    절대 넣지 마세요. 마스터 코드 검증 후에만 서버가 전송합니다.
--  * supabase-rls-v2.sql (v2.1의 RLS 강화)도 아직 미적용이라면
--    함께 실행하세요. 두 스크립트는 서로 독립적입니다.
-- ============================================================
