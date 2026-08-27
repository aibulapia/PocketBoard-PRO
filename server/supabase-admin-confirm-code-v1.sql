-- ============================================================
-- 관리 확인 코드 (초기화 + 회사명 수정 공용) — v2.55, 2026-08-24
-- ------------------------------------------------------------
-- ⚠️ 이 파일은 이미 운영 DB에 적용 완료됨 (기록용 보관, 다시 실행 안 해도 됨)
--
-- [최종 결정] 별도 코드를 새로 만들지 않고, 마스터(레벨3) 코드를
-- 그대로 재사용하기로 함. admin_confirm_check가 master_level 함수를
-- 그대로 참조하므로, 마스터 코드를 나중에 바꾸면(rotate-codes 파일 사용)
-- 이 함수도 자동으로 같이 바뀐다 — 값을 두 군데 따로 관리할 필요 없음.
--
-- 조건: 초기화·회사명 수정 버튼은 masterLevel >= 2(=레벨3, 마스터)에게만
--       화면에 보이고, 이 서버 함수도 같은 기준으로 한 번 더 확인한다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_confirm_check(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  select public.master_level(p_code) >= 2
$function$;

-- ── 되돌리기(필요 시) ────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.admin_confirm_check(text);
-- (되돌리면 index.html도 예전 방식으로 같이 되돌려야 정상 동작합니다)
