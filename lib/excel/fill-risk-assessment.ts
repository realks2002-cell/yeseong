import ExcelJS from 'exceljs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { grade, type Hazard } from '@/lib/risk-assessment/hazards';

const TEMPLATE_PATH = path.join(process.cwd(), 'public/templates/risk-assessment-template.xlsx');

export type FillTrade = {
  trade: string; // 대표 공종명 (방수/미장 등)
  actor: string; // 조치자(협력사 담당/팀장) 이름
  hazards: Hazard[];
};
export type FillParticipant = { trade: string; name: string };
export type FillTask = { trade: string; task: string; start: string; end: string };

export type RiskAssessmentInput = {
  chasu: number; // 평가 차수
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string; // 'YYYY-MM-DD'
  writeDate: string; // 'YYYY-MM-DD'
  meetDate: string; // 'YYYY-MM-DD'
  worksiteName: string;
  clientName: string; // 원청 (확인자 헤더)
  subcontractorName: string;
  bigTrade: string; // 대공종 (예: 건축)
  midTrade: string; // 중공종 (예: 습식공사)
  trades: FillTrade[]; // 서식 한도상 최대 2개 블록만 채움
  participants: FillParticipant[];
  schedule: FillTask[];
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function parseUTC(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmtDot(d: string): string {
  const dt = parseUTC(d);
  return `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, '0')}.${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function dayDiff(from: string, to: string): number {
  return Math.round((parseUTC(to).getTime() - parseUTC(from).getTime()) / 86400000);
}

// 주간공정표 공종 → 시작 행 (3행 병합 블록). 템플릿 고정 구조.
const SCHEDULE_ROW: Record<string, number> = {
  조적: 13, 미장: 16, 방수: 19, 타일: 22, 견출: 25 /* 석공사 자리 재사용 */,
};

const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export async function fillRiskAssessment(input: RiskAssessmentInput): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const buf = await fs.readFile(TEMPLATE_PATH);
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const month = String(parseUTC(input.writeDate).getUTCMonth() + 1).padStart(2, '0');
  const periodQ = `${fmtDot(input.periodStart)}\n~\n${fmtDot(input.periodEnd)}`;

  // ── 시트: 수시위험성평가(1차) ──
  const ws = wb.getWorksheet('수시위험성평가(1차)');
  if (ws) {
    ws.getCell('A1').value = `${input.chasu}차수 수시위험성평가서 (2026 . ${month}월)`;
    const md = parseUTC(input.meetDate);
    ws.getCell('G2').value = `■ 위험성평가 회의 일자 : ${md.getUTCFullYear()} 년      ${String(md.getUTCMonth() + 1).padStart(2, '0')}월    ${String(md.getUTCDate()).padStart(2, '0')}일`;
    ws.getCell('A3').value = `■ 평가차수(기간) :    (${input.periodStart}~ ${String(parseUTC(input.periodEnd).getUTCFullYear()).slice(2)}-${String(parseUTC(input.periodEnd).getUTCMonth() + 1).padStart(2, '0')}-${String(parseUTC(input.periodEnd).getUTCDate()).padStart(2, '0')})`;
    ws.getCell('A4').value = `■ 대 공 종 : ${input.bigTrade}`;
    ws.getCell('E4').value = `■ 중 공 종 : ${input.midTrade}`;
    ws.getCell('S4').value = `작성일자 : ${fmtDot(input.writeDate)}`;
    ws.getCell('R6').value = `확인자\n(${input.clientName})`;

    // 블록: 순번1 = rows 7~18, 순번2 = rows 19~30. 하위 위험요인 행: [+0,+3,+6,+9]
    const blocks = [
      { seqRow: 7, seq: 1, hz: [7, 10, 13, 16] },
      { seqRow: 19, seq: 2, hz: [19, 22, 25, 28] },
    ];
    blocks.forEach((b, bi) => {
      const t = input.trades[bi];
      if (!t) {
        // 블록 미사용 → 내용 비움 (서식 유지)
        ws.getCell(`E${b.seqRow}`).value = null;
        ws.getCell(`F${b.seqRow}`).value = null;
        ws.getCell(`G${b.seqRow}`).value = null;
        b.hz.forEach((r) => { ['I', 'K', 'L', 'M', 'N'].forEach((c) => (ws.getCell(`${c}${r}`).value = null)); });
        ws.getCell(`R${b.seqRow}`).value = null;
        return;
      }
      ws.getCell(`E${b.seqRow}`).value = b.seq;
      ws.getCell(`F${b.seqRow}`).value = t.trade;
      ws.getCell(`G${b.seqRow}`).value = `${t.trade}공\n(${t.actor}반)`;
      ws.getCell(`R${b.seqRow}`).value = t.actor;
      b.hz.forEach((r, hi) => {
        const h = t.hazards[hi];
        if (!h) { ['I', 'K', 'L', 'M', 'N'].forEach((c) => (ws.getCell(`${c}${r}`).value = null)); return; }
        ws.getCell(`I${r}`).value = h.risk;
        ws.getCell(`K${r}`).value = h.f;
        ws.getCell(`L${r}`).value = h.s;
        ws.getCell(`M${r}`).value = grade(h.f, h.s);
        ws.getCell(`N${r}`).value = h.ctrl;
      });
    });
    ws.getCell('Q7').value = periodQ;
  }

  // ── 시트: 회의록 ──
  const wm = wb.getWorksheet('(협력사)위험성평가 근로자 참여 회의록');
  if (wm) {
    wm.getCell('F3').value = fmtDot(input.meetDate);
    wm.getCell('G3').value = fmtDot(input.meetDate);
    const ps = parseUTC(input.periodStart), pe = parseUTC(input.periodEnd);
    wm.getCell('A5').value = `주요위험요인(${String(ps.getUTCFullYear()).slice(2)}. ${String(ps.getUTCMonth() + 1).padStart(2, '0')}. ${String(ps.getUTCDate()).padStart(2, '0')}~${String(pe.getUTCMonth() + 1).padStart(2, '0')}. ${String(pe.getUTCDate()).padStart(2, '0')})`;
    // A등급(높음) 위험요인 자동 발췌 (평가표에서 파생 → 매칭 정확)
    const top = input.trades
      .flatMap((t) => t.hazards.map((h) => ({ ...h, trade: t.trade })))
      .filter((h) => grade(h.f, h.s) === 'A')
      .slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const r = 7 + i;
      wm.getCell(`A${r}`).value = top[i] ? top[i].risk : null;
      wm.getCell(`D${r}`).value = top[i] ? top[i].ctrl : null;
    }
  }

  // ── 시트: 참석자 명단 ──
  const wp = wb.getWorksheet('위험성평가 근로자 참석자 명단');
  if (wp) {
    const md = parseUTC(input.meetDate);
    const dateStr = `날짜:   ${md.getUTCFullYear()}     년    ${String(md.getUTCMonth() + 1).padStart(2, '0')}    월  ${String(md.getUTCDate()).padStart(2, '0')}   일`;
    wp.getCell('F2').value = dateStr;
    wp.getCell('F3').value = dateStr;
    // 좌측(1~15): B=직종,C=성명 / 우측(16~30): F=직종,G=성명. 서명 공란.
    input.participants.slice(0, 30).forEach((p, i) => {
      if (i < 15) { wp.getCell(`B${5 + i}`).value = p.trade; wp.getCell(`C${5 + i}`).value = p.name; }
      else { wp.getCell(`F${5 + (i - 15)}`).value = p.trade; wp.getCell(`G${5 + (i - 15)}`).value = p.name; }
    });
  }

  // ── 시트: 주간공정표 (날짜·요일 재계산 + 공정 막대) ──
  const wsg = wb.getWorksheet('주간공정표');
  if (wsg) {
    wsg.getCell('A1').value = `[ ${month}월  예  정  공  정  표 ]`;
    wsg.getCell('A2').value = `○공사명 : ${input.worksiteName}`;
    wsg.getCell('E2').value = `( ${fmtDot(input.periodStart)} ~ ${fmtDot(input.periodEnd)} )`;
    wsg.getCell('D4').value = `${month}월`;
    // 날짜(행5) / 요일(행6): D(4)~R(18) = 15일
    for (let i = 0; i < 15; i++) {
      const col = 4 + i;
      const dt = new Date(parseUTC(input.periodStart).getTime() + i * 86400000);
      wsg.getCell(5, col).value = dt.getUTCDate();
      wsg.getCell(6, col).value = WEEKDAYS[dt.getUTCDay()];
    }
    // 기존 막대 제거: 템플릿 날짜칸은 solid fill(색칠)로 막대가 그려져 있으므로
    // 값뿐 아니라 배경색(fill)도 흰색으로 초기화해야 옛 막대가 사라진다.
    // ⚠ ExcelJS는 스타일 객체를 워크북 전역에서 참조 공유한다. `cell.fill =` 직접 대입은
    // 공유 스타일을 변형시켜 같은 스타일을 쓰는 다른 셀(다른 시트 포함)까지 물들인다.
    // → `cell.style = {...cell.style, fill}`로 셀마다 독립 스타일을 부여해야 안전하다.
    for (let r = 7; r <= 48; r++) for (let c = 4; c <= 18; c++) {
      const cell = wsg.getCell(r, c);
      cell.value = null;
      cell.style = { ...cell.style, fill: solidFill('FFFFFFFF') };
    }
    // 공정 막대 렌더 (기간 밖 작업은 스킵)
    for (const task of input.schedule) {
      const row = SCHEDULE_ROW[task.trade];
      if (!row) continue; // 매칭 공종 행 없으면 스킵
      const rawS = dayDiff(input.periodStart, task.start);
      const rawE = dayDiff(input.periodStart, task.end);
      if (rawE < 0 || rawS > 14) continue; // 평가기간(15일) 밖은 그리지 않음
      const si = Math.max(0, rawS);
      const ei = Math.min(14, rawE);
      for (let i = si; i <= ei; i++) {
        const c = wsg.getCell(row, 4 + i);
        c.style = { ...c.style, fill: solidFill('FF447D9B') };
      }
      const startCell = wsg.getCell(row, 4 + si);
      startCell.value = task.task || task.trade;
      startCell.font = { name: '맑은 고딕', size: 9, color: { argb: 'FFFFFFFF' }, bold: true };
      startCell.alignment = { horizontal: 'left', vertical: 'middle' };
      // 견출 등 템플릿 라벨과 다른 공종은 주요작업 라벨 갱신 (석공사 자리 재사용)
      if (task.trade === '견출') wsg.getCell(`C${row}`).value = '견출공사';
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return new Uint8Array(out as ArrayBuffer);
}

export function buildRaFilename(worksiteName: string, chasu: number): string {
  const short = worksiteName.replace(/\s*중\s*.*$/, '').trim().slice(0, 30);
  return `${short} ${chasu}차 위험성평가 예성건축.xlsx`;
}
