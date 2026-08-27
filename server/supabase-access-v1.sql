-- ============================================================
-- MMEEC 포켓보드 PRO — 접속 현황 기록 (v2.18 신규)
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ------------------------------------------------------------
-- ⚠️ 이 파일은 서버 설정용입니다. 웹에 배포하지 마세요.
-- ⚠️ 개인 식별 정보를 저장하지 않습니다.
--    · 기기ID는 브라우저가 만든 난수(UUID)이며 사람과 연결되지 않습니다.
--    · 이름·연락처·사번 등은 절대 기록하지 않습니다.
--    · 원본 로그는 30일 후 자동 정리 대상입니다(아래 cleanup 함수).
-- ============================================================

-- ── 1. 접속 로그 (기기 × 날짜 × 공장 단위로 1행) ────────────
create table if not exists public.app_access_log (
  device_id  text not null,
  day        date not null,
  factory    text not null default '',
  hits       int  not null default 1,
  updated_at timestamptz not null default now(),
  primary key (device_id, day, factory)
);
alter table public.app_access_log enable row level security;
-- anon 직접 접근 정책 없음 → 아래 RPC(security definer)로만 접근

create index if not exists app_access_log_day_idx on public.app_access_log (day);

-- ── 2. 접속 기록 (앱이 켜질 때 호출, 인증 불필요) ───────────
create or replace function public.log_access(p_device text, p_factory text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or length(p_device) < 8 or length(p_device) > 64 then
    return;  -- 잘못된 호출은 조용히 무시
  end if;
  insert into app_access_log (device_id, day, factory, hits, updated_at)
  values (p_device, (now() at time zone 'Asia/Seoul')::date, coalesce(left(p_factory, 20), ''), 1, now())
  on conflict (device_id, day, factory)
  do update set hits = app_access_log.hits + 1, updated_at = now();
end $$;

-- ── 3. 접속 통계 조회 (관리자 레벨2 전용) ────────────────────
--    최근 7일치를 날짜 × 공장별 기기 수로 집계해서 반환
create or replace function public.master_access_stats(p_code text)
returns table (day date, factory text, devices bigint)
language plpgsql security definer set search_path = public as $$
begin
  -- 레벨2(최고 관리자)만 통과. 구버전 스키마 호환을 위해 폴백 처리.
  begin
    perform public.master_guard_admin(p_code);
  exception when undefined_function then
    if not public.master_check(p_code) then
      raise exception 'unauthorized';
    end if;
  end;

  return query
    select l.day, l.factory, count(distinct l.device_id) as devices
    from app_access_log l
    where l.day >= ((now() at time zone 'Asia/Seoul')::date - 6)
    group by l.day, l.factory
    order by l.day desc, l.factory;
end $$;

-- ── 4. 오래된 로그 정리 (30일 초과분 삭제) ───────────────────
--    필요 시 Apps Script 등에서 주기적으로 호출하세요.
create or replace function public.cleanup_access_log(p_code text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.master_guard_admin(p_code);
  exception when undefined_function then
    if not public.master_check(p_code) then
      raise exception 'unauthorized';
    end if;
  end;
  delete from app_access_log where day < ((now() at time zone 'Asia/Seoul')::date - 30);
end $$;

-- ── 5. anon 실행 권한 ────────────────────────────────────────
grant execute on function
  public.log_access(text, text),
  public.master_access_stats(text),
  public.cleanup_access_log(text)
to anon;

-- ============================================================
-- 참고
--  * 이 스크립트는 재실행해도 안전합니다.
--  * app_access_log 생성 시 'Run and enable RLS' 선택하세요
--    (RPC로만 접근하므로 정상 동작합니다).
-- ============================================================
