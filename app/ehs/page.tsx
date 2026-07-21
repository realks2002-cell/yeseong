'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import {
  Building2, Layers, CalendarDays, CalendarRange, FileCog, UsersRound, UserCheck,
  Check, Info, Pencil, AlertTriangle, Plus, X, RotateCcw, FileStack, Table2,
  ClipboardList, Users, Stamp, Sparkles, ShieldCheck,
} from 'lucide-react';

const TRADES = ['방수', '미장', '견출', '조적', '타일', '방통', '도장'];
const ACTORS: Record<string, string> = { 방수: '김용준', 미장: '국재현', 견출: '김인환' };
const BASE = '2026-07-07';
const dayIdx = (d: string) => {
  const diff = Math.round((new Date(d).getTime() - new Date(BASE).getTime()) / 86400000);
  return Math.max(0, Math.min(14, diff));
};
const BAR_COLORS = ['#447D9B', '#5a94af', '#FE7743', '#273F4F'];

type Task = { trade: string; task: string; start: string; end: string };

export default function EhsPage() {
  const [mode, setMode] = useState<'resume' | 'new'>('resume');
  const [selected, setSelected] = useState<Set<string>>(new Set(['방수', '미장', '견출']));
  const [format, setFormat] = useState<'detail' | 'iso'>('detail');
  const [tasks, setTasks] = useState<Task[]>([
    { trade: '방수', task: '옥상 시트방수', start: '2026-07-07', end: '2026-07-11' },
    { trade: '미장', task: '3층 벽체미장', start: '2026-07-10', end: '2026-07-16' },
    { trade: '견출', task: '벽체 면견출', start: '2026-07-14', end: '2026-07-21' },
  ]);

  const toggle = (t: string) => setSelected((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const days = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(new Date(BASE).getTime() + i * 86400000);
    return { d: d.getUTCDate(), w: ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()] };
  });

  return (
    <AdminShell>
      <div className="ehs">
        <div className="head">
          <h1><ShieldAlert2 />위험성평가 생성</h1>
          <p className="sub">현장을 선택하면 대부분 자동으로 채워집니다. 관리자는 노란 항목만 확인·입력하세요.</p>
          <div className="legend">
            <span><i className="sw ok" />예성 데이터에서 자동</span>
            <span><i className="sw warn" />관리자 입력·확인 필요</span>
          </div>
        </div>

        <div className="grid">
          <div className="col">
            {/* 진입 방식 */}
            <div className="modes">
              <button className={'mode' + (mode === 'resume' ? ' on' : '')} onClick={() => setMode('resume')}>
                <RotateCcw size={18} /><div><div className="mt">지난 차수 이어서</div><div className="md">차수·기간·공종 자동 복제 (2클릭)</div></div>
              </button>
              <button className={'mode' + (mode === 'new' ? ' on' : '')} onClick={() => setMode('new')}>
                <Plus size={18} /><div><div className="mt">새로 만들기</div><div className="md">현장·공종부터 선택 (3~4클릭)</div></div>
              </button>
            </div>

            {/* 현장 */}
            <div className="card">
              <h2><Building2 size={14} />현장</h2>
              <div className="body">
                <label>현장 선택 <span className="req">*</span></label>
                <select defaultValue="경북대">
                  <option value="경북대">경북대 캠퍼스 혁신파크 HUB동 건설공사 중 방수공사</option>
                  <option>오창 전고체전지</option>
                  <option>녹십자 송도</option>
                </select>
                <div className="facts">
                  <div className="fact"><span className="k">원청사</span><span className="v">포스코</span></div>
                  <div className="fact"><span className="k">협력사</span><span className="v">(주)예성건축</span></div>
                  <div className="fact"><span className="k">대공종 / 중공종</span><span className="v">건축 / 습식공사</span></div>
                  <div className="fact"><span className="k">주소</span><span className="v">대구 북구 대현동 25</span></div>
                </div>
                <div className="hint"><span className="auto"><Check size={10} />자동</span> 현장 마스터에서 원청·협력사·공종·주소를 불러왔습니다.</div>
              </div>
            </div>

            {/* 공종 */}
            <div className="card">
              <h2><Layers size={14} />대상 공종<span className="auto ml"><Check size={10} />배정 작업자 기준 자동선택</span></h2>
              <div className="body">
                <div className="chips">
                  {TRADES.map((t) => (
                    <button key={t} className={'chip' + (selected.has(t) ? ' on' : '')} onClick={() => toggle(t)}>
                      {selected.has(t) && <Check size={13} />}{t}{ACTORS[t] && <span className="a">· {ACTORS[t]}</span>}
                    </button>
                  ))}
                </div>
                <div className="hint"><Info size={12} />이 현장 배정 작업자(김용준·국재현·김인환)의 직종에서 방수·미장·견출을 자동 선택했습니다.</div>
              </div>
            </div>

            {/* 차수·일정 */}
            <div className="card">
              <h2><CalendarDays size={14} />차수 · 일정</h2>
              <div className="body">
                <div className="row">
                  <div className="fld"><label>평가 차수</label><input type="text" defaultValue="1차" /><div className="hint"><span className="auto"><Check size={10} />자동</span> 직전 +1</div></div>
                  <div className="fld"><label>평가기간 시작</label><input type="date" defaultValue="2026-07-07" /></div>
                  <div className="fld"><label>평가기간 종료</label><input type="date" defaultValue="2026-07-21" /><div className="hint"><span className="auto"><Check size={10} />자동</span> +14일</div></div>
                </div>
                <div className="row">
                  <div className="fld"><label>작성일</label><input type="date" defaultValue="2026-07-07" /><div className="hint"><span className="auto"><Check size={10} />자동</span> 오늘</div></div>
                  <div className="fld"><label>근로자 참여 회의일 <span className="req">*</span></label><input type="date" defaultValue="2026-07-07" /><div className="hint"><span className="need"><Pencil size={10} />확인</span> 실제 회의일</div></div>
                  <div className="fld" />
                </div>
              </div>
            </div>

            {/* 주간 공정 입력 */}
            <div className="card">
              <h2><CalendarRange size={14} />주간 공정 입력<span className="need ml"><Pencil size={10} />계획 입력</span></h2>
              <div className="body pad0">
                <table>
                  <thead><tr><th style={{ width: 84 }}>공종</th><th>주요 작업</th><th style={{ width: 130 }}>시작일</th><th style={{ width: 130 }}>종료일</th><th style={{ width: 32 }} /></tr></thead>
                  <tbody>
                    {tasks.map((t, i) => (
                      <tr key={i}>
                        <td>{t.trade}</td>
                        <td><input type="text" value={t.task} onChange={(e) => setTasks((s) => s.map((x, j) => j === i ? { ...x, task: e.target.value } : x))} /></td>
                        <td><input type="date" value={t.start} onChange={(e) => setTasks((s) => s.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} /></td>
                        <td><input type="date" value={t.end} onChange={(e) => setTasks((s) => s.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} /></td>
                        <td><button className="del" onClick={() => setTasks((s) => s.filter((_, j) => j !== i))}><X size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="addwrap">
                  <button className="add" onClick={() => setTasks((s) => [...s, { trade: [...selected][0] ?? '방수', task: '', start: '2026-07-07', end: '2026-07-21' }])}><Plus size={13} />작업 추가</button>
                </div>
                <div className="body">
                  <div className="hint"><Info size={12} />작업·시작·종료일만 입력하면 오창 서식 달력에 막대가 <b>자동으로 그려집니다</b> (날짜·요일 계산). 미리보기 ↓</div>
                  <div className="gantt">
                    <div className="grow ghead">
                      <div className="gc0">공종</div>
                      {days.map((d, i) => <div key={i} className="gc">{d.d}<br />{d.w}</div>)}
                    </div>
                    {tasks.map((t, i) => (
                      <div key={i} className="grow">
                        <div className="gc0 b">{t.trade}</div>
                        <div className="bar" style={{ gridColumn: `${dayIdx(t.start) + 2} / ${dayIdx(t.end) + 3}`, background: BAR_COLORS[i % BAR_COLORS.length] }}>{t.task}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 서식 */}
            <div className="card">
              <h2><FileCog size={14} />출력 서식<span className="auto ml"><Check size={10} />현장에 저장된 원청 서식</span></h2>
              <div className="body">
                <div className="opts">
                  <button className={'opt' + (format === 'detail' ? ' on' : '')} onClick={() => setFormat('detail')}>
                    <span className="r" /><div><div className="ot">상세 매트릭스형</div><div className="od">빈도×강도 · 공정표·회의록·참석자·결재 통합 (포스코/디어스 계열)</div></div>
                  </button>
                  <button className={'opt' + (format === 'iso' ? ' on' : '')} onClick={() => setFormat('iso')}>
                    <span className="r" /><div><div className="ot">ISO45001 간이형</div><div className="od">위험등급 고·중·저 3단계 (송도 계열)</div></div>
                  </button>
                </div>
                <div className="hint"><Info size={12} />원청이 지정하는 서식입니다. AI는 이 서식을 그대로 채우기만 하고 레이아웃은 변경하지 않습니다.</div>
              </div>
            </div>

            {/* 참석자 */}
            <div className="card">
              <h2><UsersRound size={14} />참석자<span className="auto ml"><Check size={10} />배정 작업자 자동</span></h2>
              <div className="body pad0">
                <table>
                  <thead><tr><th style={{ width: 40 }}>NO</th><th>직종</th><th>성명</th><th style={{ width: 120 }}>서명</th></tr></thead>
                  <tbody>
                    <tr><td>1</td><td>방수공</td><td>김용준</td><td className="sig">회의 시 자필</td></tr>
                    <tr><td>2</td><td>미장(벽미장)</td><td>국재현</td><td className="sig">회의 시 자필</td></tr>
                    <tr><td>3</td><td>견출공</td><td>김인환</td><td className="sig">회의 시 자필</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 결재라인 */}
            <div className="card warn">
              <h2><UserCheck size={14} />결재라인<span className="need ml"><AlertTriangle size={10} />입력 필요</span></h2>
              <div className="body">
                <div className="row">
                  <div className="fld"><label>관리감독자</label><input type="text" placeholder="이름 입력" /></div>
                  <div className="fld"><label>안전관리자</label><input type="text" placeholder="이름 입력" /></div>
                  <div className="fld"><label>현장소장</label><input type="text" placeholder="이름 입력" /></div>
                </div>
                <div className="hint"><Info size={12} />현장 담당자 정보가 아직 예성 DB에 없어 최초 1회 입력이 필요합니다. 입력하면 현장에 저장되어 다음 차수부터 자동 채워집니다.</div>
              </div>
            </div>
          </div>

          {/* 우측 프리뷰 */}
          <aside>
            <div className="clicks"><b>{mode === 'resume' ? '2 클릭' : '4 클릭'}</b>{mode === 'resume' ? '지난 차수 이어서 → 회의일 확인 → 생성' : '현장 → 공종 → 일정 → 생성'}</div>
            <div className="prev">
              <div className="ph"><FileStack size={15} />생성될 문서</div>
              <div className="pb">
                <div className="doc"><Table2 size={15} /><div><div className="dn">위험성평가서</div><div className="dm">방수·미장 위험요인 초안</div></div><span className="st">AI</span></div>
                <div className="doc"><ClipboardList size={15} /><div><div className="dn">근로자 참여 회의록</div><div className="dm">A등급 위험 자동 발췌</div></div><span className="st">AI</span></div>
                <div className="doc"><Users size={15} /><div><div className="dn">참석자 명단</div><div className="dm">직종·성명 자동, 서명 공란</div></div><span className="st">AI</span></div>
                <div className="doc"><Stamp size={15} /><div><div className="dn">결재</div><div className="dm">서명란 공란</div></div><span className="st">AI</span></div>
              </div>
            </div>
            <button className="cta"><Sparkles size={17} />AI 초안 생성</button>
            <div className="hint center"><ShieldCheck size={13} />위험도 판정·서명은 생성 후 관리자 확정</div>
          </aside>
        </div>

        <style jsx>{`
          .ehs{--pri:#447D9B;--prih:#366379;--bd:#D7D7D7;--muted:#F5F5F5;--mf:#6B7280;--dark:#273F4F;--acc:#FE7743;
            --ok:#059669;--okb:#ECFDF5;--okd:#A7F3D0;--wn:#B45309;--wnb:#FFFBEB;--wnd:#FDE68A;
            padding:24px;color:#091413;font-size:14px}
          .head h1{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;letter-spacing:-.02em}
          .head h1 :global(svg){width:22px;height:22px;color:var(--pri)}
          .sub{font-size:13px;color:var(--mf);margin-top:4px}
          .legend{display:flex;gap:14px;font-size:11px;color:var(--mf);margin-top:8px}
          .legend span{display:flex;align-items:center;gap:5px}
          .sw{width:11px;height:11px;border-radius:3px;display:inline-block}
          .sw.ok{background:var(--okb);border:1px solid var(--okd)}
          .sw.warn{background:var(--wnb);border:1px solid var(--wnd)}
          .grid{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start;max-width:1200px;margin-top:16px}
          .col{min-width:0}
          .modes{display:flex;gap:8px;margin-bottom:16px}
          .mode{flex:1;border:1px solid var(--bd);background:#fff;border-radius:5px;padding:12px 14px;cursor:pointer;display:flex;gap:10px;align-items:center;transition:.15s;text-align:left;font-family:inherit}
          .mode:hover{background:var(--muted)}
          .mode.on{border-color:var(--pri);box-shadow:0 0 0 2px rgba(68,125,155,.15)}
          .mode :global(svg){color:var(--pri);flex:none}
          .mt{font-size:13px;font-weight:600}
          .md{font-size:11px;color:var(--mf)}
          .card{background:#fff;border:1px solid var(--bd);border-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.03);margin-bottom:16px}
          .card.warn{border-color:var(--wnd)}
          .card h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--mf);padding:12px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px}
          .card h2 :global(svg){color:var(--pri)}
          .ml{margin-left:auto}
          .body{padding:16px}
          .body.pad0{padding:0}
          label{display:block;font-size:12px;font-weight:500;margin-bottom:6px}
          .req{color:var(--acc);font-weight:700}
          select,input[type=text],input[type=date]{width:100%;height:38px;border:1px solid var(--bd);border-radius:5px;background:#fff;padding:0 12px;font-size:13px;color:#091413;font-family:inherit;outline:none}
          select:focus,input:focus{border-color:var(--pri);box-shadow:0 0 0 3px rgba(68,125,155,.15)}
          .hint{font-size:11px;color:var(--mf);margin-top:6px;display:flex;align-items:center;gap:4px}
          .hint.center{justify-content:center}
          .hint :global(svg){flex:none}
          .auto{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;color:var(--ok);background:var(--okb);border:1px solid var(--okd);padding:1px 6px;border-radius:999px}
          .need{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;color:var(--wn);background:var(--wnb);border:1px solid var(--wnd);padding:1px 6px;border-radius:999px}
          .facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
          .fact{background:var(--okb);border:1px solid var(--okd);border-radius:5px;padding:6px 10px;font-size:12px}
          .fact .k{color:var(--mf);font-size:10px;display:block;margin-bottom:1px}
          .fact .v{font-weight:600;color:#065F46}
          .chips{display:flex;flex-wrap:wrap;gap:8px}
          .chip{border:1px solid var(--bd);background:#fff;border-radius:999px;padding:6px 13px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;transition:.12s;font-family:inherit;color:#091413}
          .chip:hover{background:var(--muted)}
          .chip.on{background:var(--pri);color:#fff;border-color:var(--pri);font-weight:600}
          .chip .a{color:#9CA3AF}
          .chip.on .a{color:rgba(255,255,255,.7)}
          .row{display:flex;gap:16px;flex-wrap:wrap}
          .fld{flex:1;min-width:150px;margin-bottom:14px}
          .row:last-child .fld{margin-bottom:0}
          .opts{display:flex;gap:12px}
          .opt{flex:1;display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bd);border-radius:5px;padding:12px 14px;cursor:pointer;background:#fff;text-align:left;font-family:inherit}
          .opt.on{border-color:var(--pri);background:rgba(68,125,155,.04)}
          .opt .r{width:16px;height:16px;border-radius:50%;border:2px solid var(--bd);margin-top:2px;flex:none;position:relative}
          .opt.on .r{border-color:var(--pri)}
          .opt.on .r::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--pri)}
          .ot{font-size:13px;font-weight:600}
          .od{font-size:11px;color:var(--mf);margin-top:2px}
          table{width:100%;border-collapse:collapse;font-size:12px}
          th{background:var(--muted);color:var(--mf);font-size:11px;font-weight:600;text-align:left;padding:7px 12px;border-bottom:1px solid var(--bd)}
          td{padding:8px 12px;border-bottom:1px solid var(--bd);vertical-align:middle}
          tr:last-child td{border-bottom:none}
          td input{height:30px}
          .sig{color:#9CA3AF;font-size:11px;font-style:italic}
          .del{border:none;background:none;color:#9CA3AF;cursor:pointer;display:inline-flex}
          .del:hover{color:#dc2626}
          .addwrap{padding:10px 16px;border-top:1px solid var(--bd)}
          .add{height:30px;border:1px dashed var(--bd);background:#fff;border-radius:5px;font-size:12px;padding:0 12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;color:var(--mf)}
          .gantt{margin-top:10px;border:1px solid var(--bd);border-radius:5px;overflow:hidden;font-size:10px}
          .grow{display:grid;grid-template-columns:64px repeat(15,1fr);border-top:1px solid var(--bd)}
          .grow.ghead{background:var(--muted);color:var(--mf);font-weight:600;border-top:none}
          .gc0{padding:6px;border-right:1px solid var(--bd)}
          .gc0.b{font-weight:600}
          .gc{padding:4px 2px;text-align:center}
          .bar{margin:3px;color:#fff;border-radius:3px;padding:2px 4px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          aside{position:sticky;top:24px;display:flex;flex-direction:column;gap:16px}
          .clicks{background:var(--okb);border:1px solid var(--okd);border-radius:5px;padding:12px 14px;font-size:12px;color:#065F46}
          .clicks b{font-size:20px;font-weight:800;display:block;margin-bottom:2px}
          .prev{background:#fff;border:1px solid var(--bd);border-radius:5px;overflow:hidden}
          .ph{background:var(--dark);color:#fff;padding:12px 16px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px}
          .pb{padding:14px 16px}
          .doc{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--muted);font-size:12px}
          .doc:last-child{border-bottom:none}
          .doc :global(svg){color:var(--pri);flex:none}
          .dn{font-weight:600}
          .dm{font-size:10px;color:var(--mf)}
          .st{margin-left:auto;font-size:10px;color:var(--ok);font-weight:600}
          .cta{width:100%;height:44px;background:var(--pri);color:#fff;border:none;border-radius:5px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:.15s;font-family:inherit}
          .cta:hover{background:var(--prih)}
          @media(max-width:920px){.grid{grid-template-columns:1fr}aside{position:static}}
        `}</style>
      </div>
    </AdminShell>
  );
}

function ShieldAlert2() {
  // 헤더 아이콘 (lucide ShieldAlert)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" /><path d="M12 16h.01" />
    </svg>
  );
}
