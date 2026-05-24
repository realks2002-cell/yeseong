-- 팀장 마스터에 직종(default_trade) 컬럼 추가
--   팀장 엑셀(_팀장.xlsx)의 직종이 진실의 출처
--   기존: workers.default_trade를 phone 매칭으로 join — phone 오타·workers 미존재 시 매칭 실패
--   변경: site_managers에 직접 저장 (workers와 데이터 중복 허용)

alter table yeseong_site_managers
  add column if not exists default_trade text;

comment on column yeseong_site_managers.default_trade is '직종(공종). 팀장 엑셀에서 가져옴.';
