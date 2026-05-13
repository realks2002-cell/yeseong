-- 김대근(04883) 데이터 정정
-- raw text에서 구분/직종 컬럼이 누락되어 단가구분이 trade로, 월급이 wage_type으로 한 칸씩 밀려 들어감

update yeseong_workers
set
  default_wage    = 250000,
  default_trade   = null,
  skill_grade     = null,
  wage_type       = '2.일급',
  address         = null,
  bank_name       = '농협중앙회',
  account_number  = '172-12-521271',
  account_holder  = '김대근'
where employee_code = '04883';
