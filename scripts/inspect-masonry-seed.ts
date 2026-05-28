// 매사 샘플 시드 전 현황 조사 (읽기 전용)
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

async function main() {
  const sb = getServiceSupabase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(none)';
  console.log('SUPABASE URL:', url);

  const [{ data: worksites }, { data: masonry }, { data: managers }, { data: priceAgg }] =
    await Promise.all([
      sb.from('yeseong_worksites').select('id, name, is_active').order('name'),
      sb
        .from('yeseong_workers')
        .select(
          'id, name, phone, default_trade, default_wage, default_worksite_id, team_leader_id, default_subcontractor_id, is_active, wage_type',
        )
        .eq('wage_type', '월급/일급')
        .order('name'),
      sb.from('yeseong_site_managers').select('id, name, phone, is_active').order('name'),
      sb.from('yeseong_masonry_prices').select('id, worksite_id, category, type_name, size_spec, unit, unit_price, is_active'),
    ]);

  console.log('\n=== 현장 (worksites) ===');
  for (const w of worksites ?? []) console.log(`  ${w.is_active ? '●' : '○'} ${w.name}  ${w.id}`);

  console.log(`\n=== 매사 작업자 (wage_type=월급/일급) : ${masonry?.length ?? 0}명 ===`);
  const siteName = new Map((worksites ?? []).map((w) => [w.id, w.name]));
  for (const m of masonry ?? []) {
    console.log(
      `  ${m.is_active ? '●' : '○'} ${m.name} | 직종:${m.default_trade ?? '-'} | 일당:${m.default_wage ?? '-'} | 현장:${siteName.get(m.default_worksite_id ?? '') ?? '(없음)'} | 팀장id:${m.team_leader_id ?? '-'} | phone:${m.phone ?? '-'} | id:${m.id}`,
    );
  }

  console.log(`\n=== 팀장 (site_managers) : ${managers?.length ?? 0}명 ===`);
  for (const mg of managers ?? []) console.log(`  ${mg.is_active ? '●' : '○'} ${mg.name} | phone:${mg.phone ?? '-'} | id:${mg.id}`);

  console.log('\n=== 매사 단가표(masonry_prices) 현장×분류별 집계 ===');
  const byKey = new Map<string, number>();
  for (const p of priceAgg ?? []) {
    if (!p.is_active) continue;
    const k = `${siteName.get(p.worksite_id ?? '') ?? p.worksite_id ?? '(공용)'} / ${p.category}`;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  if (byKey.size === 0) console.log('  (활성 단가 없음)');
  for (const [k, n] of byKey) console.log(`  ${k}: ${n}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
