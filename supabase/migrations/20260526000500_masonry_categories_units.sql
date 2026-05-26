-- 매사 단가/물량: 카테고리(방수·타일·석공사)·단위(㎥·m·매·식·롤) 확장
--   미장형 카테고리(미장·방수·타일·석공사)는 단위를 선택해 단위별로 단가를 등록(단위가 구분자).
--   조적은 기존(벽돌종류+규격, 장당) 그대로 유지.

-- 1) 단가 마스터 — 카테고리·단위 CHECK 확장
alter table yeseong_masonry_prices drop constraint if exists yeseong_masonry_prices_category_check;
alter table yeseong_masonry_prices
  add constraint yeseong_masonry_prices_category_check
  check (category in ('조적','미장','방수','타일','석공사'));

alter table yeseong_masonry_prices drop constraint if exists yeseong_masonry_prices_unit_check;
alter table yeseong_masonry_prices
  add constraint yeseong_masonry_prices_unit_check
  check (unit in ('장','㎡','㎥','m','매','식','롤'));

-- 단위별 단가 허용 → 활성 unique 키에 unit 포함 (기존: category,type_name,size_spec)
drop index if exists yeseong_masonry_prices_unique;
create unique index yeseong_masonry_prices_unique
  on yeseong_masonry_prices (category, type_name, coalesce(size_spec, ''), unit)
  where is_active = true;

-- 2) 물량(성과) — 카테고리 CHECK 확장 (작업자 성과 입력 연동 대비)
alter table yeseong_masonry_volumes drop constraint if exists yeseong_masonry_volumes_category_check;
alter table yeseong_masonry_volumes
  add constraint yeseong_masonry_volumes_category_check
  check (category in ('조적','미장','방수','타일','석공사'));
