import { NextResponse } from 'next/server';
import { getServerSupabase, getServiceSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/auth/admin-guard';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

const OCR_LABEL: Record<string, string> = {
  pending: '분석 대기',
  done: '',
  failed: '인식 실패',
};

export async function GET(req: Request) {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const worksiteId = url.searchParams.get('worksite') || null;

  const admin = getServiceSupabase();
  let query = admin
    .from('yeseong_site_photos')
    .select('id, worker_id, worksite_id, photo_date, memo, receipt_store, receipt_amount, receipt_date, ocr_status, uploaded_at')
    .eq('category', 'expense')
    .order('photo_date', { ascending: true })
    .order('uploaded_at', { ascending: true });
  if (from) query = query.gte('photo_date', from);
  if (to) query = query.lte('photo_date', to);
  if (worksiteId) query = query.eq('worksite_id', worksiteId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const records = rows ?? [];

  const workerIds = [...new Set(records.map((r) => r.worker_id))];
  const worksiteIds = [...new Set(records.map((r) => r.worksite_id))];
  const [workersRes, worksitesRes] = await Promise.all([
    workerIds.length ? admin.from('yeseong_workers').select('id, name').in('id', workerIds) : Promise.resolve({ data: [] }),
    worksiteIds.length ? admin.from('yeseong_worksites').select('id, name').in('id', worksiteIds) : Promise.resolve({ data: [] }),
  ]);
  const workerName = new Map((workersRes.data ?? []).map((w) => [w.id, w.name]));
  const worksiteName = new Map((worksitesRes.data ?? []).map((w) => [w.id, w.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('비용처리');

  const headerRow = ws.addRow(['날짜', '상점', '금액', '현장', '팀장', '메모', '비고']);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD7D7D7' } } };
    cell.alignment = { vertical: 'middle' };
  });

  for (const r of records) {
    ws.addRow([
      r.receipt_date ?? r.photo_date,
      r.receipt_store ?? '',
      r.receipt_amount ?? '',
      worksiteName.get(r.worksite_id) ?? '',
      workerName.get(r.worker_id) ?? '',
      r.memo ?? '',
      OCR_LABEL[r.ocr_status ?? ''] ?? '',
    ]);
  }

  // 합계 행
  const total = records.reduce((s, r) => s + (r.receipt_amount ?? 0), 0);
  const totalRow = ws.addRow(['합계', '', total, '', '', '', '']);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.border = { top: { style: 'thin', color: { argb: 'FFD7D7D7' } } };
  });

  ws.columns = [
    { width: 12 }, // 날짜
    { width: 22 }, // 상점
    { width: 14, style: { numFmt: '#,##0' } }, // 금액
    { width: 22 }, // 현장
    { width: 10 }, // 팀장
    { width: 24 }, // 메모
    { width: 10 }, // 비고
  ];

  const buf = await wb.xlsx.writeBuffer();
  const filename = `비용처리_${from ?? ''}_${to ?? ''}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
