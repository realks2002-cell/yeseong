-- wage_type prefix 숫자 제거 + 표기 정규화
-- 2.일급 → 일급
-- 4.월급/일급 → 월급
-- 1.월급 → 월급 (자연 매핑)

update yeseong_workers
set wage_type = case wage_type
  when '2.일급' then '일급'
  when '4.월급/일급' then '월급'
  when '1.월급' then '월급'
  else wage_type
end
where wage_type in ('2.일급', '4.월급/일급', '1.월급');
