// 엑셀(노임대장) 테스트용 풀 시드 — 현장 × 협력사 × 작업자 × 한 달 출역
//   - 각 현장: 작업자 10명 슬롯 (협력사 라운드로빈 분배)
//   - 이번 달 1~31일: 평일 1.0, 토 0.5, 일 제외
//   - source='import', approval_status='approved'
//
// 실행: pnpm tsx scripts/seed-full-payroll.ts
// 정리: pnpm tsx scripts/seed-full-payroll.ts --clean  (이번달 source='import' 모두 삭제)
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

const WORKERS_PER_WORKSITE = 10;
const YEAR_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();
const [YEAR, MONTH] = YEAR_MONTH.split('-').map(Number);
const MONTH_START = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`;
const MONTH_LAST_DAY = new Date(YEAR, MONTH, 0).getDate();
const MONTH_END = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(MONTH_LAST_DAY).padStart(2, '0')}`;

function workdaysInMonth(): Array<{ date: string; hours: number }> {
  const out: Array<{ date: string; hours: number }> = [];
  for (let day = 1; day <= MONTH_LAST_DAY; day++) {
    const d = new Date(YEAR, MONTH - 1, day);
    const dow = d.getDay(); // 0=일, 6=토
    if (dow === 0) continue;
    const iso = `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push({ date: iso, hours: dow === 6 ? 0.5 : 1.0 });
  }
  return out;
}

async function clean() {
  const sb = getServiceSupabase();
  const { error, count } = await sb
    .from('yeseong_attendance')
    .delete({ count: 'exact' })
    .eq('source', 'import')
    .gte('work_date', MONTH_START)
    .lte('work_date', MONTH_END);
  if (error) {
    console.error('clean failed:', error);
    process.exit(1);
  }
  console.log(`✓ ${YEAR_MONTH} import 출역 ${count ?? 0}건 삭제`);
}

async function seed() {
  const sb = getServiceSupabase();

  const [{ data: worksites }, { data: workers }, { data: subs }] = await Promise.all([
    sb.from('yeseong_worksites').select('id, name').eq('is_active', true).order('name'),
    sb.from('yeseong_workers').select('id, name, default_wage, default_trade').eq('is_active', true),
    sb.from('yeseong_subcontractors').select('id, name').eq('is_active', true).order('name'),
  ]);

  if (!worksites?.length || !workers?.length || !subs?.length) {
    console.error('데이터 부족:', { worksites: worksites?.length, workers: workers?.length, subs: subs?.length });
    process.exit(1);
  }

  const days = workdaysInMonth();
  console.log(`대상: ${YEAR_MONTH} (총 ${days.length} 작업일)`);
  console.log(`현장 ${worksites.length}곳, 작업자 ${workers.length}명, 협력사 ${subs.length}곳`);
  console.log(`각 현장에 ${WORKERS_PER_WORKSITE}명 슬롯 배정\n`);

  let workerCursor = 0;
  let totalSlots = 0;
  let totalAttendance = 0;

  for (const ws of worksites) {
    // period upsert
    const { data: period, error: pErr } = await sb
      .from('yeseong_payroll_periods')
      .upsert(
        { worksite_id: ws.id, year_month: YEAR_MONTH, period_start: MONTH_START, period_end: MONTH_END },
        { onConflict: 'worksite_id,year_month' }
      )
      .select('id')
      .single();
    if (pErr || !period) {
      console.error(`period upsert 실패 (${ws.name}):`, pErr?.message);
      continue;
    }

    const { data: existingSlots } = await sb
      .from('yeseong_payroll_workers')
      .select('id, worker_id, slot_number')
      .eq('period_id', period.id);
    const slotByWorker = new Map((existingSlots ?? []).map((s) => [s.worker_id, s]));
    let nextSlot = Math.max(0, ...(existingSlots ?? []).map((s) => s.slot_number)) + 1;

    // 이번 현장에 배정할 작업자 10명 (순환)
    const picked: Array<typeof workers[number]> = [];
    for (let i = 0; i < WORKERS_PER_WORKSITE; i++) {
      picked.push(workers[workerCursor % workers.length]);
      workerCursor++;
    }

    let wsAttendance = 0;
    for (let i = 0; i < picked.length; i++) {
      const w = picked[i];
      const sub = subs[i % subs.length];
      let slotId: string;

      const existing = slotByWorker.get(w.id);
      if (existing) {
        slotId = existing.id;
      } else {
        if (nextSlot > 26) {
          console.warn(`  ⚠ ${ws.name} slot 26 초과 — skip ${w.name}`);
          continue;
        }
        const { data: slot, error: sErr } = await sb
          .from('yeseong_payroll_workers')
          .insert({
            period_id: period.id,
            worker_id: w.id,
            slot_number: nextSlot++,
            daily_wage: w.default_wage ?? 270000,
            trade: w.default_trade ?? '관리',
            subcontractor_id: sub.id,
          })
          .select('id')
          .single();
        if (sErr || !slot) {
          console.warn(`  ⚠ slot insert 실패 (${ws.name} ${w.name}):`, sErr?.message);
          continue;
        }
        slotId = slot.id;
        totalSlots++;
      }

      // 작업자별 출역 패턴 미세 변동
      const skipRate = (i * 0.07) % 0.3; // 0~30% 결근
      const rows = days
        .filter((_, idx) => ((i + idx) % 100) / 100 >= skipRate)
        .map((d) => ({
          payroll_worker_id: slotId,
          work_date: d.date,
          hours: d.hours,
          source: 'import',
          worksite_id: ws.id,
          subcontractor_id: sub.id,
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
        }));

      if (rows.length === 0) continue;

      const { error: aErr } = await sb
        .from('yeseong_attendance')
        .upsert(rows, { onConflict: 'payroll_worker_id,work_date' });
      if (aErr) {
        console.warn(`  ⚠ attendance upsert 실패 (${ws.name} ${w.name}):`, aErr.message);
        continue;
      }
      wsAttendance += rows.length;
    }

    totalAttendance += wsAttendance;
    console.log(`  • ${ws.name}: 슬롯 ${picked.length}, 출역 ${wsAttendance}건`);
  }

  console.log(`\n✓ 신규 슬롯 ${totalSlots}, 출역 ${totalAttendance}건 (${YEAR_MONTH})`);
  console.log(`\n관리자 웹에서 노임대장 페이지 접속 → 현장×${YEAR_MONTH} 선택 → 엑셀 다운로드 가능`);
}

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((e) => {
  console.error(e);
  process.exit(1);
});
