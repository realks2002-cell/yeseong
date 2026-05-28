-- 매사(masonry) 자유화 1/3 — 공종·단위 고정 목록 제약 해제
--   클라이언트가 공종(category)·항목·단위를 무제한 등록할 수 있도록
--   masonry_prices / masonry_volumes 의 category·unit CHECK 제거(자유 텍스트화).
--   중복 단가 방지 unique 인덱스와 컬럼 구조는 그대로 유지(기존 데이터 보존).
--   직종→공종 매핑 함수(yeseong_trade_to_volume_category)는
--   Phase 3(작업자 앱 직접 선택)에서 get_volumes 재작성과 함께 제거.

alter table yeseong_masonry_prices  drop constraint if exists yeseong_masonry_prices_category_check;
alter table yeseong_masonry_prices  drop constraint if exists yeseong_masonry_prices_unit_check;
alter table yeseong_masonry_volumes drop constraint if exists yeseong_masonry_volumes_category_check;
