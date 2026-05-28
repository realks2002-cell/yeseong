'use client';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

export type TrendPoint = { yearMonth: string; totalHours: number; wageTotal: number };
type Metric = 'hours' | 'wage';

function monthLabel(ym: string): string {
  return `${Number(ym.slice(5))}월`;
}

// 임금: 백만원 단위로 표시 (10백만 이상은 정수, 미만은 소수1자리)
function wageLabel(n: number): string {
  if (!n) return '';
  const m = n / 1_000_000;
  const s = m >= 10 ? Math.round(m).toLocaleString() : (Math.round(m * 10) / 10).toString();
  return `${s}백만`;
}

function wageAxis(n: number): string {
  return n ? `${Math.round(n / 1_000_000)}` : '0';
}

function hoursLabel(v: number): string {
  return v ? v.toLocaleString() : '';
}

type TooltipEntry = { value?: number };

function ChartTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value ?? 0;
  const color = metric === 'hours' ? '#447D9B' : '#FE7743';
  return (
    <div className="rounded-[5px] border border-[#D7D7D7] bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold text-[#091413]">{label}</p>
      <p className="flex items-center gap-1.5 tabular-nums">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[#6B7280]">{metric === 'hours' ? '총 공수' : '임금총액'}</span>
        <span className="ml-auto font-medium text-[#091413]">
          {metric === 'wage' ? `${v.toLocaleString()}원` : v.toLocaleString()}
        </span>
      </p>
    </div>
  );
}

const axisX = { fontSize: 11, fill: '#6B7280' };
const axisY = { fontSize: 10, fill: '#9CA3AF' };

export function TrendChart({ data, metric }: { data: TrendPoint[]; metric: Metric }) {
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.yearMonth) }));

  if (metric === 'hours') {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hoursBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#447D9B" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#447D9B" stopOpacity={0.5} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#EAEAEA" vertical={false} />
          <XAxis dataKey="label" tick={axisX} axisLine={{ stroke: '#D7D7D7' }} tickLine={false} />
          <YAxis tick={axisY} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<ChartTooltip metric="hours" />} cursor={{ fill: '#F5F5F5' }} />
          <Bar dataKey="totalHours" name="총 공수" fill="url(#hoursBar)" radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList dataKey="totalHours" position="top" formatter={(v) => hoursLabel(Number(v))} fill="#4B5563" fontSize={10} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 18, right: 32, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wageArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FE7743" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#FE7743" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#EAEAEA" vertical={false} />
        <XAxis dataKey="label" tick={axisX} axisLine={{ stroke: '#D7D7D7' }} tickLine={false} />
        <YAxis tick={axisY} axisLine={false} tickLine={false} width={36} tickFormatter={wageAxis} />
        <Tooltip content={<ChartTooltip metric="wage" />} cursor={{ stroke: '#FE7743', strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="wageTotal"
          name="임금총액"
          stroke="#FE7743"
          strokeWidth={2.5}
          fill="url(#wageArea)"
          dot={{ r: 3, fill: '#FE7743', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        >
          <LabelList dataKey="wageTotal" position="top" formatter={(v) => wageLabel(Number(v))} fill="#FE7743" fontSize={10} offset={8} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}
