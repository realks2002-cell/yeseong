-- 사용자 제공 워커 데이터 보존용 추가 컬럼
-- 모두 nullable — 기존 행·코드 영향 0
-- 노임대장 fill에는 미사용 (마스터 데이터 보존 목적)

alter table yeseong_workers add column employee_code text;
alter table yeseong_workers add column name_english text;
alter table yeseong_workers add column wage_type text;          -- '일급' / '월급/일급'
alter table yeseong_workers add column first_work_date date;
alter table yeseong_workers add column nationality text;
alter table yeseong_workers add column visa_status text;        -- F-6-1.국민배우자 등
alter table yeseong_workers add column skill_grade text;        -- 기공 / 조공 / 보통인부

-- employee_code 중복 import 방지 (NULL은 자동 허용)
alter table yeseong_workers
  add constraint yeseong_workers_employee_code_unique unique (employee_code);
