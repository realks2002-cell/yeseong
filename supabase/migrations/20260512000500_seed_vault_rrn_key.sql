-- RRN 암호화 키 (vault.secrets) 자동 시드
-- yeseong_encrypt_rrn() / yeseong_decrypt_rrn() 동작에 필수
-- 키가 이미 있으면 NOOP — 절대 덮어쓰기 X (덮어쓰면 기존 암호 데이터 복호화 불가)

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'rrn_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'rrn_key',
      'RRN(주민등록번호) pgp_sym 암호화 키'
    );
  end if;
end $$;
