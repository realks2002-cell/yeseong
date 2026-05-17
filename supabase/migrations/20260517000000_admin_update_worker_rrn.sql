-- 관리자 RRN 업데이트 RPC
-- rrn_plain + rrn_prefix + rrn_gender_digit + rrn_encrypted 4개 컬럼을 일관 업데이트

create or replace function yeseong_admin_update_worker_rrn(
  p_id uuid,
  p_rrn_plain text
) returns void
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  rrn_clean text;
begin
  rrn_clean := replace(coalesce(p_rrn_plain, ''), '-', '');
  if length(rrn_clean) <> 13 or rrn_clean !~ '^\d{13}$' then
    raise exception '주민번호 형식 오류 (13자리 숫자 필요)';
  end if;

  update yeseong_workers
     set rrn_plain        = rrn_clean,
         rrn_prefix       = substring(rrn_clean from 1 for 6),
         rrn_gender_digit = substring(rrn_clean from 7 for 1),
         rrn_encrypted    = yeseong_encrypt_rrn(rrn_clean)
   where id = p_id;

  if not found then
    raise exception 'worker not found';
  end if;
end $$;

grant execute on function yeseong_admin_update_worker_rrn(uuid, text) to authenticated;
