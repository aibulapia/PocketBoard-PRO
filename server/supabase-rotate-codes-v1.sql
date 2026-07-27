-- ============================================================
-- MMEEC 포켓보드 PRO — 관리자 코드 / 백업 토큰 교체
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ------------------------------------------------------------
-- [배경] 2026-07, 저장소 파일이 웹에 노출되어 아래 값이 공개됨.
--        · 관리자 코드 2종  · 백업 토큰
--        파일을 지워도 이미 유출된 값은 계속 유효하므로 반드시 교체할 것.
--
-- [사용법]
--   1) 아래 3개 값을 새 값으로 바꾼다 (따옴표 안만 교체)
--   2) 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행
--   3) apps-script-v3.gs 의 BACKUP_TOKEN 도 같은 값으로 수정 후 재배포
--
-- [권장] 회사명 기반(mmeec…)은 추측이 쉬움.
--        영문+숫자 섞어 12자 이상으로 정할 것.
--
-- ⚠️ 이 파일은 서버 설정용입니다. public/ 폴더에 넣지 마세요.
-- ⚠️ 실제 값을 적어 저장했다면 저장소에 커밋하지 마세요.
-- ============================================================

-- ── 여기만 수정 ──────────────────────────────────────────────
--   NEW_ADMIN_LV1  : 일반 관리자 (공지 입력, 연락처 조회·추가·전화)
--   NEW_ADMIN_LV2  : 최고 관리자 (위 + 연락처 삭제, 세션 등록소, 전체엑셀, 접속현황)
--   NEW_BACKUP_TOKEN : Apps Script 자동백업 전용 (사람이 입력하지 않음)
-- ─────────────────────────────────────────────────────────────

-- ── 1. 코드 검증 (레벨 0/1/2) ────────────────────────────────
create or replace function public.master_level(p_code text)
returns int language sql immutable as $$
  select case
    when p_code = 'NEW_ADMIN_LV2' then 2
    when p_code = 'NEW_ADMIN_LV1' then 1
    else 0
  end
$$;

create or replace function public.master_check(p_code text)
returns boolean language sql immutable as $$
  select public.master_level(p_code) >= 1
$$;

-- ── 2. 가드 (레벨1 이상 / 레벨2 전용) ────────────────────────
create or replace function public.master_guard(p_code text)
returns void language plpgsql as $$
begin
  if public.master_level(p_code) < 1 then
    raise exception 'unauthorized';
  end if;
end $$;

create or replace function public.master_guard_admin(p_code text)
returns void language plpgsql as $$
begin
  if public.master_level(p_code) < 2 then
    raise exception 'admin only';
  end if;
end $$;

-- ── 3. 백업 토큰 교체 ────────────────────────────────────────
create or replace function public.backup_export(p_token text)
returns table (session_id text, site_name text, items jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_token <> 'NEW_BACKUP_TOKEN' then
    raise exception 'unauthorized';
  end if;
  return query
    select r.session_code, r.site_name, coalesce(p.items, '[]'::jsonb), p.updated_at
    from session_registry r
    left join pocket_sessions p on p.session_id = r.session_code
    where r.active
    order by r.created_at;
end $$;

-- ── 4. 실행 권한 (재부여, 무해) ──────────────────────────────
grant execute on function
  public.master_level(text),
  public.master_check(text),
  public.master_guard(text),
  public.master_guard_admin(text),
  public.backup_export(text)
to anon;

-- ============================================================
-- [실행 후 확인]
--   아래 쿼리로 새 코드가 제대로 먹었는지 확인 (값은 본인 새 코드로)
--     select public.master_level('여기에_새_최고관리자_코드');  -- 결과 2
--     select public.master_level('여기에_새_일반관리자_코드');  -- 결과 1
--     select public.master_level('mmeecsafe');                  -- 결과 0 (구코드 무효화됨)
--
-- [교체 후 할 일]
--   · 앱에서 관리자 모드 재로그인 (기존 30일 인증 캐시는 그대로 남아 있으므로,
--     확실히 하려면 사용 기기에서 관리자 로그아웃 후 새 코드로 재인증)
--   · apps-script-v3.gs 의 BACKUP_TOKEN 수정 → Apps Script 재배포
--   · 새 코드는 저장소·문서에 적지 말고 별도 보관
-- ============================================================
