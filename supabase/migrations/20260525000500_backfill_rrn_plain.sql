-- /workers 주민번호 표시 일관성 — 전체 표시로 통일 (사용자 결정)
-- 배경: rrn_plain 보유 행은 목록에서 주민번호 전체 표시, 미보유 행(암호문 rrn_encrypted +
--       prefix 만 있는 테스트/관리자 계정)은 마스킹(prefix-gender******) → 표시 불일치.
--       formatRrnDisplay 는 rrn_plain 이 있으면 전체, 없으면 마스킹하므로 데이터가 원인.
-- 조치: rrn_plain 이 NULL 인 행을 rrn_encrypted 복호화로 백필 → 전 행이 평문 보유 → 전체 표시 통일.
--       저장 형식은 canonical(13자리 숫자, yeseong_admin_update_worker_rrn 과 동일).
--       복호화 결과가 정확히 13자리일 때만 백필(이상값 방지).

update yeseong_workers w
   set rrn_plain = d.clean
  from (
    select id,
           regexp_replace(yeseong_decrypt_rrn(rrn_encrypted), '\D', '', 'g') as clean
      from yeseong_workers
     where rrn_plain is null
       and rrn_encrypted is not null
  ) d
 where w.id = d.id
   and length(d.clean) = 13;
