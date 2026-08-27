-- ============================================================
-- 접속현황 집계 개선 — v2.55, 2026-08-26
-- ------------------------------------------------------------
-- ⚠️ 이미 운영 DB에 적용 완료됨 (기록용 보관, 다시 실행 안 해도 됨)
--
-- 바뀐 점 두 가지:
--  (1) 마스터(role=2) 접속을 통계에서 제외 — 감독자·관리자만 집계
--  (2) 복수공장 설정 중복 집계 수정
--      같은 기기가 하루 중 "내 담당 공장"을 바꾸면 (device_id, day, factory)
--      조합이 달라져 그날 기록이 여러 줄 쌓임 → 실제 1대인데 2대처럼 세어짐.
--      기기·날짜별로 가장 최근(updated_at) 1건만 쓰도록 수정.
-- ============================================================

CREATE OR REPLACE FUNCTION public.master_factory_role_stats(p_code text)
RETURNS TABLE(day date, factory text, role smallint, devices bigint)
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
    select l.day, l.factory, l.role, count(distinct l.device_id)::bigint as devices
    from app_access_log l
    where l.day >= ((now() at time zone 'Asia/Seoul')::date - 6)
      and coalesce(l.factory, '') <> ''
      and l.role < 2                      -- 마스터 제외
    group by l.day, l.factory, l.role
    order by l.day desc, l.factory, l.role;
end $function$;

CREATE OR REPLACE FUNCTION public.master_factory_combos_by_day(p_code text)
RETURNS TABLE(day date, combo text, cnt bigint, devices bigint)
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
      -- 기기·날짜별로 가장 최근에 기록된 설정 1건만 사용 (중복 집계 방지)
      select distinct on (l.device_id, l.day)
             l.device_id, l.day, l.factories
      from app_access_log l
      where l.day >= ((now() at time zone 'Asia/Seoul')::date - 6)
        and coalesce(l.factories, '') <> ''
        and l.role < 2                    -- 마스터 제외
      order by l.device_id, l.day, l.updated_at desc
    )
    select x.day,
           x.factories as combo,
           (length(x.factories) - length(replace(x.factories, ',', '')) + 1)::bigint as cnt,
           count(distinct x.device_id)::bigint as devices
    from latest x
    where position(',' in x.factories) > 0   -- 복수 선택만
    group by x.day, x.factories
    order by x.day desc, cnt desc, devices desc, combo;
end $function$;
