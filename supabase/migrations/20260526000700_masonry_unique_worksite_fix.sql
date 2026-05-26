-- yeseong_masonry_prices unique 인덱스에 worksite_id 복원
-- 20260526000500에서 worksite_id가 누락되어 현장별 동일 종류·규격·단위 단가 등록이
-- 23505로 거부되던 회귀를 수정 (원래 20260520000000은 worksite_id를 포함했음)
drop index if exists yeseong_masonry_prices_unique;
create unique index yeseong_masonry_prices_unique
  on yeseong_masonry_prices (category, type_name, coalesce(size_spec, ''), unit, coalesce(worksite_id::text, ''))
  where is_active = true;
