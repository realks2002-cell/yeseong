// 팀장 엑셀(_팀장.xlsx) 기준으로 yeseong_site_managers 정리
//   - 팀장 엑셀에 없는 site_manager는 삭제 후보
//   - 삭제 전 영향 분석: 팀원 수(team_leader_id 참조), 본인 가입 여부(auth_user_id), 현장 배정
//
// 실행: pnpm tsx scripts/cleanup-site-managers.ts [--apply]

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import ExcelJS from 'exceljs';
import { getServiceSupabase } from '../lib/supabase/server';

const FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

function readText(sheet: ExcelJS.Worksheet, r: number, c: number): string | null {
  const v = sheet.getRow(r).getCell(c).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim() || null;
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((x: any) => x.text).join('').trim() || null;
  return String(v).trim() || null;
}

async function loadExcelNames(): Promise<Set<string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const sheet = wb.getWorksheet('작업자 마스터')!;
  const names = new Set<string>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const name = readText(sheet, r, 2);
    if (name) names.add(name);
  }
  return names;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 ${apply ? '🚨 APPLY' : '👀 DRY-RUN'}\n`);

  const sb = getServiceSupabase();
  const excelNames = await loadExcelNames();
  console.log(`✓ 팀장 엑셀 ${excelNames.size}명: ${[...excelNames].join(', ')}\n`);

  const { data: managers, error } = await sb
    .from('yeseong_site_managers')
    .select('id, name, phone, auth_user_id, pin, default_trade');
  if (error) throw error;

  const toDelete = (managers ?? []).filter((m) => !excelNames.has(m.name));
  console.log(`✓ site_managers ${managers?.length}명 중 엑셀 외 ${toDelete.length}명\n`);

  if (toDelete.length === 0) {
    console.log('삭제 후보 없음. 종료.');
    return;
  }

  // 각 후보의 영향 분석
  console.log('이름        | auth | team원 | 현장배정 | 액션');
  console.log('─'.repeat(70));

  for (const m of toDelete) {
    const [{ count: memberCount }, { count: assignCount }] = await Promise.all([
      sb.from('yeseong_workers')
        .select('id', { count: 'exact', head: true })
        .eq('team_leader_id', m.id),
      sb.from('yeseong_site_manager_assignments')
        .select('worksite_id', { count: 'exact', head: true })
        .eq('site_manager_id', m.id),
    ]);

    const hasAuth = m.auth_user_id ? '✓' : '-';
    const action = '🗑️  삭제';
    console.log(
      `${m.name.padEnd(10)} | ${hasAuth.padEnd(4)} | ${String(memberCount ?? 0).padEnd(6)} | ${String(assignCount ?? 0).padEnd(8)} | ${action}`,
    );
    if (memberCount && memberCount > 0) {
      console.log(`  ⚠️  팀원 ${memberCount}명의 team_leader_id가 NULL 처리됨 (FK on delete set null)`);
    }

    if (apply) {
      // 1. 현장 배정 삭제 (cascade 없을 수 있음)
      const { error: aErr } = await sb
        .from('yeseong_site_manager_assignments')
        .delete()
        .eq('site_manager_id', m.id);
      if (aErr) { console.error(`    ✗ 배정 삭제: ${aErr.message}`); continue; }

      // 2. auth.users 삭제 (있으면)
      if (m.auth_user_id) {
        const { error: uErr } = await sb.auth.admin.deleteUser(m.auth_user_id);
        if (uErr) { console.error(`    ✗ auth user 삭제: ${uErr.message}`); }
      }

      // 3. site_manager 삭제 (workers.team_leader_id는 FK on delete set null)
      const { error: dErr } = await sb
        .from('yeseong_site_managers')
        .delete()
        .eq('id', m.id);
      if (dErr) { console.error(`    ✗ 팀장 삭제: ${dErr.message}`); continue; }

      console.log(`    ✓ 삭제 완료`);
    }
  }

  if (!apply) console.log('\n💡 실제 적용: pnpm tsx scripts/cleanup-site-managers.ts --apply');
}

main().catch((e) => { console.error(e); process.exit(1); });
