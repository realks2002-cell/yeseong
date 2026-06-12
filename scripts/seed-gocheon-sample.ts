// 고천초등학교 현장 샘플 노임대장 시드 (2026-05) — 설계 준수
//   - 작업자는 "고천 팀장의 팀원"에서만 선택 (작업자 팀장 추종 규칙)
//   - 월급 최대 3명 + 일급으로 총 10명 채움 (일당 0 제외)
//   - 슬롯 + 평일 1.0 / 토 0.5 / 일 제외 출역 (source='import', approved)
//   - 슬롯 subcontractor_id = 현장의 subcontractor_id (현장↔전문건설사 1:1)
//   - 기존 매사 데이터는 건드리지 않음
//
// 실행: pnpm tsx scripts/seed-gocheon-sample.ts
// 정리: pnpm tsx scripts/seed-gocheon-sample.ts --clean  (이 시드가 넣은 일급/월급 슬롯만 삭제, 매사 보존)
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { getServiceSupabase } from '../lib/supabase/server';

const YEAR_MONTH = '2026-05';
const [YEAR, MONTH] = YEAR_MONTH.split('-').map(Number);
const MONTH_LAST_DAY = new Date(YEAR, MONTH, 0).getDate();
const MONTH_START = `${YEAR_MONTH}-01`;
const MONTH_END = `${YEAR_MONTH}-${String(MONTH_LAST_DAY).padStart(2, '0')}`;
const TARGET_TOTAL = 10;
const N_MONTHLY_MAX = 3;

type Worker = { id: string; name: string; wage_type: string | null; default_wage: number | null; default_trade: string | null; phone: string | null };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function workdays(): Array<{ date: string; hours: number }> {
  const out: Array<{ date: string; hours: number }> = [];
  for (let day = 1; day <= MONTH_LAST_DAY; day++) {
    const dow = new Date(YEAR, MONTH - 1, day).getDay();
    if (dow === 0) continue; // 일요일 제외
    out.push({ date: `${YEAR_MONTH}-${String(day).padStart(2, '0')}`, hours: dow === 6 ? 0.5 : 1.0 });
  }
  return out;
}

async function findWorksite(sb: ReturnType<typeof getServiceSupabase>) {
  const { data } = await sb
    .from('yeseong_worksites')
    .select('id, name, subcontractor_id, is_active')
    .ilike('name', '%고천%');
  if (!data?.length) { console.error("✗ '고천' 현장을 찾지 못했습니다."); process.exit(1); }
  if (data.length > 1) { console.error('✗ 후보가 여러 개:', data.map((w) => w.name)); process.exit(1); }
  return data[0];
}

async function teamMembers(sb: ReturnType<typeof getServiceSupabase>, worksiteId: string): Promise<Worker[]> {
  const { data: assigns } = await sb
    .from('yeseong_site_manager_assignments')
    .select('yeseong_site_managers(id, phone)')
    .eq('worksite_id', worksiteId);
  const mgrs = (assigns ?? [])
    .map((a: { yeseong_site_managers: { id: string; phone: string } | null }) => a.yeseong_site_managers)
    .filter((m): m is { id: string; phone: string } => !!m);
  const mgrIds = mgrs.map((m) => m.id);
  const mgrPhones = new Set(mgrs.map((m) => m.phone));
  if (!mgrIds.length) { console.error('✗ 고천에 배정된 팀장이 없습니다.'); process.exit(1); }
  console.log(`고천 팀장 ${mgrIds.length}명`);

  const { data: members } = await sb
    .from('yeseong_workers')
    .select('id, name, wage_type, default_wage, default_trade, phone')
    .in('team_leader_id', mgrIds)
    .eq('is_active', true);
  return ((members ?? []) as Worker[]).filter((w) => !w.phone || !mgrPhones.has(w.phone));
}

async function clean() {
  const sb = getServiceSupabase();
  const ws = await findWorksite(sb);
  const { data: period } = await sb
    .from('yeseong_payroll_periods')
    .select('id')
    .eq('worksite_id', ws.id)
    .eq('year_month', YEAR_MONTH)
    .maybeSingle();
  if (!period) { console.log('삭제할 period 없음'); return; }
  // 이 시드가 넣은 슬롯만 = 매사(월급/일급)가 아니면서 import 출역이 있는 슬롯. 기존 매사 데이터는 보존.
  const { data: slots } = await sb
    .from('yeseong_payroll_workers')
    .select('id, yeseong_workers(wage_type), yeseong_attendance(source)')
    .eq('period_id', period.id);
  const target = ((slots ?? []) as Array<{ id: string; yeseong_workers: { wage_type: string | null } | null; yeseong_attendance: Array<{ source: string }> }>)
    .filter((s) => s.yeseong_workers?.wage_type !== '월급/일급' && (s.yeseong_attendance ?? []).some((a) => a.source === 'import'))
    .map((s) => s.id);
  if (!target.length) { console.log('삭제할 시드 슬롯 없음'); return; }
  await sb.from('yeseong_attendance').delete().in('payroll_worker_id', target);
  await sb.from('yeseong_payroll_workers').delete().in('id', target);
  console.log(`✓ ${ws.name} ${YEAR_MONTH} 시드 슬롯 ${target.length}개 + 출역 삭제 (매사 데이터 보존)`);
}

async function seed() {
  const sb = getServiceSupabase();
  const ws = await findWorksite(sb);
  console.log(`현장: ${ws.name} (${ws.id}), subcontractor_id=${ws.subcontractor_id ?? '없음'}`);

  const team = await teamMembers(sb, ws.id);
  const monthlyPool = shuffle(team.filter((w) => w.wage_type === '월급'));
  const dailyPool = shuffle(team.filter((w) => (w.wage_type === '일급' || w.wage_type == null) && (w.default_wage ?? 0) > 0));
  const monthly = monthlyPool.slice(0, N_MONTHLY_MAX);
  const daily = dailyPool.slice(0, Math.max(0, TARGET_TOTAL - monthly.length));
  const picked = [...daily, ...monthly];
  if (!picked.length) { console.error('✗ 시드할 일급/월급 팀원이 없습니다.'); process.exit(1); }
  console.log(`시드 대상 ${picked.length}명 (일급 ${daily.length} / 월급 ${monthly.length})`);

  const { data: period, error: pErr } = await sb
    .from('yeseong_payroll_periods')
    .upsert({ worksite_id: ws.id, year_month: YEAR_MONTH, period_start: MONTH_START, period_end: MONTH_END }, { onConflict: 'worksite_id,year_month' })
    .select('id')
    .single();
  if (pErr || !period) { console.error('period upsert 실패:', pErr?.message); process.exit(1); }

  const { data: existingSlots } = await sb
    .from('yeseong_payroll_workers')
    .select('id, worker_id, slot_number')
    .eq('period_id', period.id);
  const slotByWorker = new Map((existingSlots ?? []).map((s) => [s.worker_id, s]));
  let nextSlot = Math.max(0, ...(existingSlots ?? []).map((s) => s.slot_number)) + 1;

  const days = workdays();
  let slotsCreated = 0;
  let attRows = 0;

  for (const w of picked) {
    let slotId: string;
    const existing = slotByWorker.get(w.id);
    if (existing) {
      slotId = existing.id;
    } else {
      if (nextSlot > 26) { console.warn(`  ⚠ slot 26 초과 — skip ${w.name}`); continue; }
      const { data: slot, error: sErr } = await sb
        .from('yeseong_payroll_workers')
        .insert({
          period_id: period.id,
          worker_id: w.id,
          slot_number: nextSlot++,
          daily_wage: w.default_wage ?? 0,
          trade: w.default_trade ?? null,
          subcontractor_id: ws.subcontractor_id ?? null,
        })
        .select('id')
        .single();
      if (sErr || !slot) { console.warn(`  ⚠ slot 실패 (${w.name}):`, sErr?.message); continue; }
      slotId = slot.id;
      slotsCreated++;
    }

    const rows = days.map((d) => ({
      payroll_worker_id: slotId,
      work_date: d.date,
      hours: d.hours,
      source: 'import',
      worksite_id: ws.id,
      subcontractor_id: ws.subcontractor_id ?? null,
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
    }));
    const { error: aErr } = await sb.from('yeseong_attendance').upsert(rows, { onConflict: 'payroll_worker_id,work_date' });
    if (aErr) { console.warn(`  ⚠ 출역 실패 (${w.name}):`, aErr.message); continue; }
    attRows += rows.length;
    console.log(`  • ${w.name} [${w.wage_type ?? '일급'}] 일당 ${(w.default_wage ?? 0).toLocaleString()} · 출역 ${rows.length}건`);
  }

  console.log(`\n✓ ${ws.name} ${YEAR_MONTH}: 신규 슬롯 ${slotsCreated} (일급 ${daily.length}/월급 ${monthly.length}), 출역 ${attRows}건`);
}

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((e) => { console.error(e); process.exit(1); });
