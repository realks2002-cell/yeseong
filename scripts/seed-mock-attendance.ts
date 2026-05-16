// 소장 앱 검증용 pending 출역 mock 시드
// 각 현장에 작업자 5명씩 × 오늘 1건 = 약 75건 pending 생성
// 실행: pnpm tsx scripts/seed-mock-attendance.ts
//
// 정리: pnpm tsx scripts/seed-mock-attendance.ts --clean
//   → source='mobile' AND approval_status='pending' 데이터 모두 삭제
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const YEAR_MONTH = TODAY.slice(0, 7);
const MONTH_START = `${YEAR_MONTH}-01`;
const MONTH_END = (() => {
  const [y, m] = YEAR_MONTH.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const HOURS_DIST = [1, 1, 1, 0.5, 1.5]; // 정상 위주

async function clean() {
  const sb = getServiceSupabase();
  const { error, count } = await sb
    .from('yeseong_attendance')
    .delete({ count: 'exact' })
    .eq('source', 'mobile')
    .eq('approval_status', 'pending');
  if (error) {
    console.error('clean failed:', error);
    process.exit(1);
  }
  console.log(`✓ pending 출역 ${count ?? 0}건 삭제`);
}

async function seed() {
  const sb = getServiceSupabase();

  const [{ data: worksites }, { data: workers }, { data: subs }] = await Promise.all([
    sb.from('yeseong_worksites').select('id, name').eq('is_active', true).order('name'),
    sb.from('yeseong_workers').select('id, name, default_wage, default_trade').eq('is_active', true).limit(200),
    sb.from('yeseong_subcontractors').select('id, name').eq('is_active', true),
  ]);

  if (!worksites?.length || !workers?.length || !subs?.length) {
    console.error('worksites/workers/subcontractors 비어있음:', {
      worksites: worksites?.length, workers: workers?.length, subs: subs?.length,
    });
    process.exit(1);
  }

  console.log(`현장 ${worksites.length}곳, 작업자 ${workers.length}명, 협력사 ${subs.length}곳`);
  console.log(`work_date: ${TODAY}, year_month: ${YEAR_MONTH}`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let workerCursor = 0;

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
      console.error(`period upsert 실패 (${ws.name}):`, pErr);
      continue;
    }

    // 이번 현장에 작업자 5명 + 협력사 라운드로빈
    const pick = workers.slice(workerCursor, workerCursor + 5);
    workerCursor += 5;
    if (pick.length < 5) {
      // 작업자 부족 — 순환
      workerCursor = 0;
      pick.push(...workers.slice(0, 5 - pick.length));
    }

    // 기존 slot 조회
    const { data: existingSlots } = await sb
      .from('yeseong_payroll_workers')
      .select('id, worker_id, slot_number')
      .eq('period_id', period.id);
    const slotByWorker = new Map((existingSlots ?? []).map((s) => [s.worker_id, s]));
    let nextSlot = Math.max(0, ...(existingSlots ?? []).map((s) => s.slot_number)) + 1;

    for (let i = 0; i < pick.length; i++) {
      const w = pick[i];
      const sub = subs[i % subs.length];
      let slotId: string;

      const existing = slotByWorker.get(w.id);
      if (existing) {
        slotId = existing.id;
      } else {
        if (nextSlot > 26) {
          console.warn(`  ⚠ ${ws.name} slot 26 초과 — skip`);
          totalSkipped++;
          continue;
        }
        const { data: slot, error: sErr } = await sb
          .from('yeseong_payroll_workers')
          .insert({
            period_id: period.id,
            worker_id: w.id,
            slot_number: nextSlot++,
            daily_wage: w.default_wage ?? 270000,
            trade: w.default_trade ?? null,
            subcontractor_id: sub.id,
          })
          .select('id')
          .single();
        if (sErr || !slot) {
          console.warn(`  ⚠ slot insert 실패 (${ws.name} ${w.name}):`, sErr?.message);
          totalSkipped++;
          continue;
        }
        slotId = slot.id;
      }

      const hours = HOURS_DIST[i % HOURS_DIST.length];

      const { error: aErr } = await sb
        .from('yeseong_attendance')
        .upsert(
          {
            payroll_worker_id: slotId,
            work_date: TODAY,
            hours,
            source: 'mobile',
            worksite_id: ws.id,
            subcontractor_id: sub.id,
            approval_status: 'pending',
            approved_at: null,
            approved_by: null,
            rejection_reason: null,
          },
          { onConflict: 'payroll_worker_id,work_date' }
        );
      if (aErr) {
        console.warn(`  ⚠ attendance upsert 실패 (${ws.name} ${w.name}):`, aErr.message);
        totalSkipped++;
        continue;
      }
      totalInserted++;
    }

    console.log(`  • ${ws.name}: 5명 처리 (누적 ${totalInserted}건)`);
  }

  console.log(`\n✓ pending 출역 ${totalInserted}건 생성 (스킵 ${totalSkipped})`);
}

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((e) => {
  console.error(e);
  process.exit(1);
});
