-- ============================================================
-- 복수 공장 설정 현황 집계 (v2.54b, 2026-08-22)
-- ------------------------------------------------------------
-- 목적: 감독자가 "내 담당 공장"을 몇 개나 고르는지 파악.
--       기존에는 첫 번째 공장 1개만 기록돼 복수 선택 여부를 알 수 없었음.
-- 주의: 이 파일은 이미 운영 DB에 적용 완료됨 (기록용 보관).
-- ============================================================

-- 1) 고른 공장 전체를 담을 칸 추가 (기존 factory 칸은 그대로 유지)
ALTER TABLE public.app_access_log
  ADD COLUMN IF NOT EXISTS factories text NOT NULL DEFAULT '';

-- 2) 기록 함수 교체
--    구버전 앱은 인자 2개, 신버전 앱은 3개로 호출한다.
--    기본값을 준 3인자 함수 하나로 통일해야 호출이 모호해지지 않으므로
--    기존 2인자 함수를 지우고 새로 만든다.
DROP FUNCTION IF EXISTS public.log_access(text, text);

CREATE FUNCTION public.log_access(
  p_device    text,
  p_factory   text DEFAULT ''::text,
  p_factories text DEFAULT ''::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if p_device is null or length(p_device) < 8 or length(p_device) > 64 then
    return;  -- 잘못된 호출은 조용히 무시
  end if;

  insert into app_access_log (device_id, day, factory, factories, hits, updated_at)
  values (
    p_device,
    (now() at time zone 'Asia/Seoul')::date,
    coalesce(left(p_factory, 20), ''),
    coalesce(left(p_factories, 200), ''),
    1,
    now()
  )
  on conflict (device_id, day, factory)
  do update set
    hits = app_access_log.hits + 1,
    -- 구버전 앱이 빈 값으로 덮어써 기록이 사라지지 않도록,
    -- 새로 들어온 값이 비어 있으면 기존 값을 유지한다.
    factories = case
                  when coalesce(excluded.factories, '') = '' then app_access_log.factories
                  else excluded.factories
                end,
    updated_at = now();
end $function$;

-- 3) 조합 집계 함수 (마스터 전용)
--    기존 master_access_stats는 건드리지 않고 별도 함수로 추가 →
--    이 함수가 없는 구버전 서버에서도 접속현황 화면은 그대로 동작함.
CREATE OR REPLACE FUNCTION public.master_factory_combos(p_code text)
RETURNS TABLE(combo text, cnt bigint, devices bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  begin
    perform public.master_guard_admin(p_code);
  exception when undefined_function then
    if not public.master_check(p_code) then
      raise exception 'unauthorized';
    end if;
  end;

  return query
    with latest as (
      -- 기기별로 가장 최근에 기록된 공장 목록 1건만 사용
      select distinct on (l.device_id)
             l.device_id,
             l.factories
      from app_access_log l
      where l.day >= ((now() at time zone 'Asia/Seoul')::date - 6)
        and coalesce(l.factories, '') <> ''
      order by l.device_id, l.day desc, l.updated_at desc
    )
    select
      x.factories as combo,
      (length(x.factories) - length(replace(x.factories, ',', '')) + 1)::bigint as cnt,
      count(*)::bigint as devices
    from latest x
    group by x.factories
    order by cnt desc, devices desc, combo;
end $function$;

-- ── 되돌리기(필요 시) ──────────────────────────────
-- DROP FUNCTION IF EXISTS public.master_factory_combos(text);
-- DROP FUNCTION IF EXISTS public.log_access(text, text, text);
-- ALTER TABLE public.app_access_log DROP COLUMN IF EXISTS factories;
-- (그 뒤 기존 2인자 log_access를 다시 만들어야 함 — supabase-access-v1.sql 참고)
