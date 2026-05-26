-- 직종 → 매사 카테고리 매핑 확장 (미장 계열 직종 추가)
-- 현재 비표준 직종 중 카테고리가 명확한 미장 계열(미장·견출공·기계미장공·방통)을 '미장'으로 연결.
-- 데이터 표준화(비표준 직종 정리)는 클라이언트가 추후 진행. 불명확한 메지공·먹공·사춤은 보류.
create or replace function yeseong_trade_to_volume_category(p_trade text)
returns text language sql immutable
as $$
  select case
    when p_trade in ('조적','조적공') then '조적'
    when p_trade in ('미장공','미장','바닥미장','견출공','기계미장공','방통') then '미장'
    when p_trade in ('방수공','방수') then '방수'
    when p_trade in ('타일공','타일') then '타일'
    when p_trade in ('석공','석공사') then '석공사'
    else null
  end
$$;
