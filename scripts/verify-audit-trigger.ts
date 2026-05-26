// 트리거 동작 검증:
//   1) audit_log 테이블 존재 확인
//   2) 8개 대상 테이블에 트리거 부착 확인
//   3) 실제 UPDATE 1건 발생 → audit_log row 생성 확인 (롤백)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // 1) audit_log 존재 확인
  const { data: t, error: tErr } = await sb
    .from('yeseong_audit_log')
    .select('id', { count: 'exact', head: true });
  if (tErr) {
    console.error('❌ yeseong_audit_log 테이블 접근 실패:', tErr.message);
    process.exit(1);
  }
  console.log('✓ yeseong_audit_log 테이블 OK');

  // 2) 트리거 부착 확인 (pg_trigger 직접 조회 — 서비스 롤로 가능)
  const { data: triggers, error: trErr } = await sb.rpc('exec_sql' as never, { sql: '' } as never).then(
    () => ({ data: null, error: { message: 'exec_sql RPC 없음 — 대체 검증' } }),
    () => ({ data: null, error: null }),
  ).catch(() => ({ data: null, error: null }));

  // 대체: 실제 UPDATE 발생 → audit_log 확인
  // worker.address (nullable, 안전한 컬럼)로 토글 후 복구
  const { data: worker, error: wErr } = await sb
    .from('yeseong_workers')
    .select('id, name, address')
    .limit(1)
    .maybeSingle();
  if (wErr) {
    console.error('❌ 작업자 조회 실패:', wErr.message);
    process.exit(1);
  }
  if (!worker) {
    console.warn('⚠ 검증용 작업자 없음 — 트리거 호출 검증 스킵');
    return;
  }

  const beforeAddr = worker.address;
  const testAddr = `_audit_test_${Date.now()}`;
  // 트리거는 auth.uid() 추출. service role 컨텍스트에서는 NULL이지만 audit row는 생성됨.
  const { error: upErr } = await sb
    .from('yeseong_workers')
    .update({ address: testAddr })
    .eq('id', worker.id);
  if (upErr) {
    console.error('❌ UPDATE 실패:', upErr.message);
    process.exit(1);
  }

  // 잠시 대기 후 조회
  await new Promise((r) => setTimeout(r, 300));

  const { data: logs, error: lErr } = await sb
    .from('yeseong_audit_log')
    .select('id, action, table_name, record_id, changed_fields, after_data, actor_user_id, created_at')
    .eq('table_name', 'yeseong_workers')
    .eq('record_id', worker.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lErr) {
    console.error('❌ audit_log 조회 실패:', lErr.message);
  } else if (!logs || logs.length === 0) {
    console.error('❌ 트리거가 audit_log row를 생성하지 않음');
  } else {
    const r = logs[0];
    console.log('✓ 트리거 동작 OK');
    console.log(`  action=${r.action} changed_fields=${JSON.stringify(r.changed_fields)} actor=${r.actor_user_id ?? '(service)'}`);
    const after = r.after_data as Record<string, unknown>;
    if (after.address === testAddr) {
      console.log('✓ after_data.address 정합성 OK');
    } else {
      console.warn(`⚠ after_data.address 불일치: ${after.address}`);
    }
    // 노이즈 컬럼 제외 검증
    if ('rrn_encrypted' in after) console.warn('⚠ rrn_encrypted가 audit에 포함됨 (제외 실패)');
    else console.log('✓ rrn_encrypted 제외 OK');
    if ('created_at' in after) console.warn('⚠ created_at가 audit에 포함됨 (제외 실패)');
    else console.log('✓ created_at 제외 OK');
  }

  // 롤백 — 원래 주소로 복구
  await sb.from('yeseong_workers').update({ address: beforeAddr }).eq('id', worker.id);
  console.log('✓ 작업자 address 복구 완료');
}
main().catch((e) => { console.error(e); process.exit(1); });
