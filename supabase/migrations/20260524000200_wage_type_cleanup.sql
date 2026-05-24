-- wage_type 정합성 정리
-- 1) WAGE_TYPES 상수 변경에 맞춰 prefix가 남아있을 수 있는 값 정규화
-- 2) '시급' 카테고리 제거 → NULL (worker 마스터에서 재지정 필요)
-- 3) '월급/일급' 카테고리는 정규화 마이그레이션(20260512001000)에서 이미 '월급'으로
--    병합되었으므로 DB로는 복원 불가. 사용자가 worker 마스터에서 직접 재지정.

update yeseong_workers set wage_type = '월급' where wage_type = '1.월급';
update yeseong_workers set wage_type = '일급' where wage_type = '2.일급';
update yeseong_workers set wage_type = '월급/일급' where wage_type = '4.월급/일급';

update yeseong_workers set wage_type = null where wage_type in ('시급', '3.시급');
