// 작업자마스터.xlsx 4열의 "팀장" 이름 vs 팀장 엑셀 명단 비교
//   workers 자신이 자기 팀장으로 누구를 지정했는지(작업자마스터 엑셀 4열)
//   그 팀장이 팀장 엑셀(_팀장.xlsx)에 있는지

import ExcelJS from 'exceljs';

const WORKERS_FILE = '/Users/kenny/Desktop/Task/Yeseong/2026.05.21.xlsx';
const LEADERS_FILE = '/Users/kenny/Desktop/Task/Yeseong/작업자마스터_팀장.xlsx';

function readText(sheet: ExcelJS.Worksheet, r: number, c: number): string | null {
  const v = sheet.getRow(r).getCell(c).value;
  if (v == null) return null;
  if (typeof v === 'object' && 'text' in v) return String((v as any).text).trim() || null;
  if (typeof v === 'object' && 'richText' in v) return (v as any).richText.map((x: any) => x.text).join('').trim() || null;
  return String(v).trim() || null;
}

async function main() {
  // 1. 작업자마스터.xlsx 4열의 팀장 이름 → 그 팀장이 데리고 있는 팀원
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(WORKERS_FILE);
  const sheet1 = wb1.getWorksheet('작업자 마스터')!;
  const leaderToMembers = new Map<string, string[]>();
  for (let r = 2; r <= sheet1.rowCount; r++) {
    const memberName = readText(sheet1, r, 2);
    const leaderName = readText(sheet1, r, 4);
    if (!memberName || !leaderName) continue;
    const arr = leaderToMembers.get(leaderName) ?? [];
    arr.push(memberName);
    leaderToMembers.set(leaderName, arr);
  }

  // 2. 팀장 엑셀의 팀장 이름
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(LEADERS_FILE);
  const sheet2 = wb2.getWorksheet('작업자 마스터')!;
  const leaderInXlsx = new Set<string>();
  for (let r = 2; r <= sheet2.rowCount; r++) {
    const name = readText(sheet2, r, 2);
    if (name) leaderInXlsx.add(name);
  }

  console.log(`작업자마스터.xlsx 4열의 distinct 팀장: ${leaderToMembers.size}명`);
  console.log(`팀장_xlsx 명단: ${leaderInXlsx.size}명\n`);

  console.log('작업자마스터.xlsx 4열에 적힌 팀장별 팀원 수:');
  console.log('─'.repeat(70));
  console.log('팀장        | 팀장xlsx 있음 | 팀원수 | 팀원');
  console.log('─'.repeat(70));
  const sorted = [...leaderToMembers.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [leader, members] of sorted) {
    const inXlsx = leaderInXlsx.has(leader) ? '✓' : '✗';
    console.log(`${leader.padEnd(10)} | ${inXlsx.padEnd(11)} | ${String(members.length).padEnd(6)} | ${members.join(', ')}`);
  }

  console.log('\n');
  console.log('팀장xlsx에만 있고 작업자마스터 4열에는 안 나오는 팀장:');
  console.log('─'.repeat(70));
  for (const l of leaderInXlsx) {
    if (!leaderToMembers.has(l)) console.log(`  ${l}`);
  }
}
main().catch(console.error);
