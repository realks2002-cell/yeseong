-- 소장앱: 다현장 → 단일 현장으로 변경
--   1) 각 매니저의 가장 오래된 1건만 남기고 나머지 삭제
--   2) site_manager_id에 unique 제약 → 매니저당 1행만 허용

-- 1) 다중 매핑 정리
delete from yeseong_site_manager_assignments
 where id in (
   select id from (
     select id,
            row_number() over (partition by site_manager_id order by created_at asc, id asc) as rn
       from yeseong_site_manager_assignments
   ) t
   where t.rn > 1
 );

-- 2) 매니저당 1행 unique 제약
alter table yeseong_site_manager_assignments
  drop constraint if exists yeseong_site_manager_assignments_one_per_manager;

alter table yeseong_site_manager_assignments
  add constraint yeseong_site_manager_assignments_one_per_manager unique (site_manager_id);
