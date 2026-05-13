-- 워커 INSERT 시 RRN 암호화 + prefix/gender 자동 추출
-- PostgREST에서 bytea 직접 INSERT가 까다로워 RPC로 일괄 처리

create or replace function yeseong_admin_insert_worker(
  p_name text,
  p_rrn_plain text,
  p_employee_code text default null,
  p_address text default null,
  p_bank_name text default null,
  p_account_number text default null,
  p_account_holder text default null,
  p_phone text default null,
  p_default_wage integer default 0,
  p_default_trade text default null
) returns uuid
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  new_id uuid;
  rrn_clean text;
begin
  rrn_clean := replace(p_rrn_plain, '-', '');
  if length(rrn_clean) <> 13 or rrn_clean !~ '^\d{13}$' then
    raise exception '주민번호 형식 오류 (13자리 숫자 필요)';
  end if;

  insert into yeseong_workers (
    employee_code, name,
    rrn_encrypted, rrn_prefix, rrn_gender_digit,
    address, bank_name, account_number, account_holder, phone,
    default_wage, default_trade
  ) values (
    p_employee_code, p_name,
    yeseong_encrypt_rrn(rrn_clean),
    substring(rrn_clean from 1 for 6),
    substring(rrn_clean from 7 for 1),
    p_address, p_bank_name, p_account_number, p_account_holder, p_phone,
    p_default_wage, p_default_trade
  )
  returning id into new_id;
  return new_id;
end $$;

grant execute on function yeseong_admin_insert_worker(
  text, text, text, text, text, text, text, text, integer, text
) to authenticated;
