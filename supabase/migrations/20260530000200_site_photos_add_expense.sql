-- 팀장 비용·영수증 통합: yeseong_site_photos.category에 'expense' 추가
--   - 팀장 앱의 '비용' 탭을 '증빙' 메뉴 안으로 통합
--   - 자재·송장(materials)과 분리 — 회계/매칭 관점에서 다름 (자재=공급사 송장, 영수증=일반 지출 증빙)

alter table yeseong_site_photos
  drop constraint if exists yeseong_site_photos_category_check;

alter table yeseong_site_photos
  add constraint yeseong_site_photos_category_check
  check (category in ('tbm', 'materials', 'general', 'expense'));
