-- yeseong_encrypt_rrn / yeseong_decrypt_rrn 의 search_path에 extensions 추가
-- pgp_sym_encrypt / pgp_sym_decrypt가 extensions 스키마에 있어서 호출 불가했음
-- (init.sql에서 search_path = public, vault만 있었음)

create or replace function yeseong_encrypt_rrn(plain text)
returns bytea
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'rrn_key' limit 1;
  if k is null then
    raise exception 'rrn_key not found in vault';
  end if;
  return pgp_sym_encrypt(plain, k);
end $$;

create or replace function yeseong_decrypt_rrn(cipher bytea)
returns text
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'rrn_key' limit 1;
  return pgp_sym_decrypt(cipher, k);
end $$;

revoke execute on function yeseong_decrypt_rrn(bytea) from public, anon, authenticated;
grant execute on function yeseong_decrypt_rrn(bytea) to service_role;
