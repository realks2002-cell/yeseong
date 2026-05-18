import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

export async function GET() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('yeseong_workers')
    .select(`
      id, employee_code, name, name_english,
      rrn_plain, rrn_prefix, rrn_gender_digit,
      skill_grade, default_trade, default_wage, wage_type,
      bank_name, account_number, account_holder,
      phone, address, team_leader_id,
      is_foreign, nationality, visa_status,
      auth_user_id, pin, first_work_date
    `)
    .eq('is_active', true)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const workers = data ?? [];

  // 팀장 이름 lookup map (비활성 팀장도 포함)
  const leaderMap = new Map(workers.map((w) => [w.id, w.name]));
  const missingLeaderIds = workers
    .map((w) => w.team_leader_id)
    .filter((id): id is string => !!id && !leaderMap.has(id));
  if (missingLeaderIds.length > 0) {
    const { data: leaders } = await sb
      .from('yeseong_workers')
      .select('id, name')
      .in('id', [...new Set(missingLeaderIds)]);
    leaders?.forEach((l) => leaderMap.set(l.id, l.name));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('작업자 마스터');

  // 헤더
  const headers = [
    '사번', '성명', '영문명', '팀장', '구분', '직종',
    '주민번호', '외국인', '국적', '비자',
    '은행', '계좌번호', '예금주',
    '연락처', '주소', '기본일당', '급여형태',
    '첫 근무일', '앱가입', 'PIN',
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD7D7D7' } },
    };
    cell.alignment = { vertical: 'middle' };
  });

  // 데이터
  for (const w of workers) {
    const rrn = w.rrn_plain
      ? `${w.rrn_plain.replace(/\D/g, '').slice(0, 6)}-${w.rrn_plain.replace(/\D/g, '').slice(6)}`
      : (w.rrn_prefix && w.rrn_gender_digit ? `${w.rrn_prefix}-${w.rrn_gender_digit}******` : '');

    ws.addRow([
      w.employee_code ?? '',
      w.name,
      w.name_english ?? '',
      w.team_leader_id ? (leaderMap.get(w.team_leader_id) ?? '') : '',
      w.skill_grade ?? '',
      w.default_trade ?? '',
      rrn,
      w.is_foreign ? '외국인' : '',
      w.nationality ?? '',
      w.visa_status ?? '',
      w.bank_name ?? '',
      w.account_number ?? '',
      w.account_holder ?? '',
      w.phone ?? '',
      w.address ?? '',
      w.default_wage ?? 0,
      w.wage_type ?? '',
      w.first_work_date ?? '',
      w.auth_user_id ? '가입' : '',
      w.pin ?? '',
    ]);
  }

  // 칼럼 너비
  ws.columns = [
    { width: 10 }, // 사번
    { width: 12 }, // 성명
    { width: 14 }, // 영문명
    { width: 12 }, // 팀장
    { width: 8 },  // 구분
    { width: 10 }, // 직종
    { width: 18 }, // 주민번호
    { width: 8 },  // 외국인
    { width: 10 }, // 국적
    { width: 14 }, // 비자
    { width: 14 }, // 은행
    { width: 18 }, // 계좌번호
    { width: 10 }, // 예금주
    { width: 16 }, // 연락처
    { width: 30 }, // 주소
    { width: 12 }, // 기본일당
    { width: 10 }, // 급여형태
    { width: 12 }, // 첫 근무일
    { width: 8 },  // 앱가입
    { width: 8 },  // PIN
  ];

  const buf = await wb.xlsx.writeBuffer();
  const filename = `작업자마스터_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store',
    },
  });
}
