-- 팀장(site_managers) phone nullable 화
--   관리자가 팀장 마스터에 사람을 먼저 등록하고
--   본인이 모바일에서 phone+pin으로 자기 정보 채우는 흐름 지원

alter table yeseong_site_managers alter column phone drop not null;

-- 기존 unique index 재정의: phone is null 인 행끼리는 중복 허용
drop index if exists yeseong_site_managers_phone_key;
create unique index yeseong_site_managers_phone_key
  on yeseong_site_managers (phone) where phone is not null;
