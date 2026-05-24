-- 매사 단가를 현장별로 관리
-- yeseong_masonry_prices에 worksite_id 추가 + unique index 재구성
-- 시드: 고천초등학교 습식공사 시멘트벽돌 단가 2종 (일반 150원 / 주방 180원)

alter table yeseong_masonry_prices
  add column if not exists worksite_id uuid references yeseong_worksites(id) on delete cascade;

drop index if exists yeseong_masonry_prices_unique;

create unique index yeseong_masonry_prices_unique
  on yeseong_masonry_prices (
    category,
    type_name,
    coalesce(size_spec, ''),
    coalesce(worksite_id::text, '')
  )
  where is_active = true;

-- 시드: 고천초등학교 현장이 있으면 2건 INSERT (중복 무시)
-- 부위·규격은 '보통' / '특수' 2종으로 고정
insert into yeseong_masonry_prices (category, type_name, size_spec, unit, unit_price, worksite_id)
select '조적', '시멘트벽돌', '보통', '장', 150, ws.id
from yeseong_worksites ws
where ws.name like '고천초등학교%'
on conflict do nothing;

insert into yeseong_masonry_prices (category, type_name, size_spec, unit, unit_price, worksite_id)
select '조적', '시멘트벽돌', '특수', '장', 180, ws.id
from yeseong_worksites ws
where ws.name like '고천초등학교%'
on conflict do nothing;
