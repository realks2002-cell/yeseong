// 매사(성과) 노임대장 테스트용 샘플 물량 시드 — 실제 매사 단가표(masonry_prices) 기반
//   현장: 고천초등학교 / 팀장 성광주 팀 작업자 5명
//   각 작업자에 분류 1개씩 배정(조적·미장·방수·타일·석공사) → 그 분류의 활성 단가 항목으로 물량 생성
//   종류·규격·단위·단가는 모두 /masonry-prices 의 실제 활성 단가에서 가져옴 (지어낸 값 X)
//   approval_status='approved' (노임대장 RPC는 승인분만 반영)
//
// 실행: npx tsx scripts/seed-masonry-sample.ts
// 정리: npx tsx scripts/seed-masonry-sample.ts --clean  (시드한 물량 + 슬롯 삭제)
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

const WORKSITE_ID = '2e31de6b-fc0d-4a82-80b1-652907899823'; // 고천초등학교
const YEAR_MONTH = '2026-05';
const MONTH_START = `${YEAR_MONTH}-01`;
const MONTH_END = `${YEAR_MONTH}-31`;

// 성광주 팀 조적공 5명
const WORKER_IDS = [
  '169e4929-1818-4b72-9912-01195392d45d', // 김선영
  '4d37e76a-7035-4ed9-b805-dd67c1a0151b', // 김종태
  'e896ea98-2ef5-45b1-a616-28a777ffd9ef', // 김황래
  '2faae5c4-2a49-41a5-b201-0886c239c5a8', // 김회선
  '4ede952c-872f-4d90-bfb8-c96d90e58f4d', // 하태섭
];

// 분류 배정 순서 (활성 단가가 있는 것만 사용)
const CATEGORY_ORDER = ['조적', '미장', '방수', '타일', '석공사'];
const TARGET_AMOUNT = 1_200_000; // 항목당 목표 금액 → 수량 역산

type Price = { category: string; type_name: string | null; size_spec: string | null; unit: string; unit_price: number };

async function getPeriodId(sb: ReturnType<typeof getServiceSupabase>) {
  const { data } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', WORKSITE_ID)
    .eq('year_month', YEAR_MONTH)
    .maybeSingle();
  return data?.id as string | undefined;
}

async function clean() {
  const sb = getServiceSupabase();
  const periodId = await getPeriodId(sb);
  if (!periodId) return void console.log('정리할 기간 없음');
  const { data: slots } = await sb
    .from('yeseong_payroll_workers')
    .select('id')
    .eq('period_id', periodId)
    .in('worker_id', WORKER_IDS);
  const slotIds = (slots ?? []).map((s) => s.id);
  if (slotIds.length === 0) return void console.log('정리할 슬롯 없음');
  const { count: vCount } = await sb.from('yeseong_masonry_volumes').delete({ count: 'exact' }).in('payroll_worker_id', slotIds);
  const { count: sCount } = await sb.from('yeseong_payroll_workers').delete({ count: 'exact' }).in('id', slotIds);
  console.log(`✓ 매사 물량 ${vCount ?? 0}건, 슬롯 ${sCount ?? 0}개 삭제 (고천초 ${YEAR_MONTH})`);
}

async function seed() {
  const sb = getServiceSupabase();

  const { data: ws } = await sb.from('yeseong_worksites').select('id, name').eq('id', WORKSITE_ID).single();
  if (!ws) throw new Error('현장 없음');

  const { data: workers } = await sb
    .from('yeseong_workers')
    .select('id, name, default_wage, default_trade, default_subcontractor_id, wage_type')
    .in('id', WORKER_IDS);
  if (!workers || workers.length !== WORKER_IDS.length) throw new Error(`작업자 ${workers?.length ?? 0}/${WORKER_IDS.length}명만 조회됨`);
  for (const w of workers) if (w.wage_type !== '월급/일급') throw new Error(`${w.name}: 매사(월급/일급) 아님`);

  // 실제 활성 단가표 로드 → 분류별 그룹
  const { data: prices } = await sb
    .from('yeseong_masonry_prices')
    .select('category, type_name, size_spec, unit, unit_price')
    .eq('worksite_id', WORKSITE_ID)
    .eq('is_active', true);
  const byCat = new Map<string, Price[]>();
  for (const p of (prices ?? []) as Price[]) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(p);
  }
  const categories = CATEGORY_ORDER.filter((c) => byCat.has(c));
  if (categories.length === 0) throw new Error('활성 단가가 없습니다');

  const { data: period, error: pErr } = await sb
    .from('yeseong_payroll_periods')
    .upsert(
      { worksite_id: WORKSITE_ID, year_month: YEAR_MONTH, period_start: MONTH_START, period_end: MONTH_END },
      { onConflict: 'worksite_id,year_month' },
    )
    .select('id')
    .single();
  if (pErr || !period) throw new Error(`period upsert 실패: ${pErr?.message}`);

  const { data: existingSlots } = await sb
    .from('yeseong_payroll_workers')
    .select('id, worker_id, slot_number')
    .eq('period_id', period.id);
  const slotByWorker = new Map((existingSlots ?? []).map((s) => [s.worker_id, s]));
  let nextSlot = Math.max(0, ...(existingSlots ?? []).map((s) => s.slot_number)) + 1;

  const byId = new Map(workers.map((w) => [w.id, w]));
  let totalVolumes = 0;
  console.log(`현장: ${ws.name} / 기간: ${YEAR_MONTH} / 팀장: 성광주 / 작업자 ${WORKER_IDS.length}명`);
  console.log(`활성 단가 분류: ${categories.join(', ')}\n`);

  for (let i = 0; i < WORKER_IDS.length; i++) {
    const w = byId.get(WORKER_IDS[i])!;
    let slotId: string;
    const existing = slotByWorker.get(w.id);
    if (existing) {
      slotId = existing.id;
    } else {
      if (nextSlot > 32) throw new Error('슬롯 32 초과');
      const { data: slot, error: sErr } = await sb
        .from('yeseong_payroll_workers')
        .insert({
          period_id: period.id,
          worker_id: w.id,
          slot_number: nextSlot++,
          daily_wage: w.default_wage ?? 0,
          trade: w.default_trade ?? '조적공',
          subcontractor_id: w.default_subcontractor_id ?? null,
        })
        .select('id')
        .single();
      if (sErr || !slot) throw new Error(`slot insert 실패 (${w.name}): ${sErr?.message}`);
      slotId = slot.id;
    }

    // 분류 1개 배정 → 그 분류의 활성 단가 전체를 물량으로
    const category = categories[i % categories.length];
    const factor = 0.8 + i * 0.1; // 작업자별 수량 변동
    const items = byCat.get(category)!;
    const rows = items.map((p) => {
      const quantity = Math.max(1, Math.round((TARGET_AMOUNT * factor) / p.unit_price));
      return {
        payroll_worker_id: slotId,
        category: p.category,
        type_name: p.type_name,
        size_spec: p.size_spec,
        unit: p.unit,
        quantity,
        unit_price: p.unit_price,
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        note: null,
      };
    });

    await sb.from('yeseong_masonry_volumes').delete().eq('payroll_worker_id', slotId);
    const { error: vErr } = await sb.from('yeseong_masonry_volumes').insert(rows);
    if (vErr) throw new Error(`volumes insert 실패 (${w.name}): ${vErr.message}`);
    totalVolumes += rows.length;

    const sum = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
    const detail = rows.map((r) => `${r.type_name ?? r.category}${r.size_spec ? ' ' + r.size_spec : ''} ${r.quantity.toLocaleString()}${r.unit}×${r.unit_price.toLocaleString()}`).join(', ');
    console.log(`  • ${w.name} [${category}]: ${rows.length}종, ${sum.toLocaleString()}원\n    ${detail}`);
  }

  // 협력사 동기화: 이 기간 모든 슬롯의 subcontractor_id = 팀장 마스터(팀장 worker행) 협력사 — 이것만 우선
  //   (yeseong_worker_team_context 와 동일 로직: team_leader_id→팀장 phone→팀장 worker행 default_subcontractor_id)
  const { data: periodSlots } = await sb
    .from('yeseong_payroll_workers')
    .select('id, worker_id')
    .eq('period_id', period.id);
  const slotWorkerIds = [...new Set((periodSlots ?? []).map((s) => s.worker_id))];
  const { data: slotWorkers } = await sb
    .from('yeseong_workers')
    .select('id, team_leader_id, default_subcontractor_id')
    .in('id', slotWorkerIds);
  const wById = new Map((slotWorkers ?? []).map((w) => [w.id, w]));
  const tlIds = [...new Set((slotWorkers ?? []).map((w) => w.team_leader_id).filter(Boolean))] as string[];
  const { data: sms } = tlIds.length
    ? await sb.from('yeseong_site_managers').select('id, phone').in('id', tlIds)
    : { data: [] as { id: string; phone: string | null }[] };
  const smPhone = new Map((sms ?? []).map((m) => [m.id, m.phone]));
  const tlPhones = [...new Set((sms ?? []).map((m) => m.phone).filter(Boolean))] as string[];
  const { data: tlWorkers } = tlPhones.length
    ? await sb.from('yeseong_workers').select('phone, default_subcontractor_id').in('phone', tlPhones)
    : { data: [] as { phone: string; default_subcontractor_id: string | null }[] };
  const subByPhone = new Map((tlWorkers ?? []).map((w) => [w.phone, w.default_subcontractor_id]));

  const resolveSub = (workerId: string): string | null => {
    const w = wById.get(workerId);
    if (!w) return null;
    if (w.team_leader_id) {
      const ph = smPhone.get(w.team_leader_id);
      return ph ? subByPhone.get(ph) ?? null : null;
    }
    return w.default_subcontractor_id ?? null;
  };

  let synced = 0;
  for (const sl of periodSlots ?? []) {
    await sb.from('yeseong_payroll_workers').update({ subcontractor_id: resolveSub(sl.worker_id) }).eq('id', sl.id);
    synced++;
  }

  console.log(`\n✓ 매사 물량 ${totalVolumes}줄 삽입 (실제 단가표 기반, 승인 상태)`);
  console.log(`✓ 협력사 ${synced}개 슬롯을 팀장 추종값으로 동기화`);
}

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((e) => {
  console.error(e);
  process.exit(1);
});
