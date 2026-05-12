'use client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from 'recharts';
import type {
  DailyHoursPoint,
  MonthlyTrendPoint,
  TradeBreakdownPoint,
  WorkerHoursPoint,
} from '@/lib/dashboard/aggregate';
import { formatKRW } from '@/lib/dashboard/aggregate';

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#0891b2', '#65a30d', '#db2777'];

export function DailyAttendanceChart({ data }: { data: DailyHoursPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={0} />
        <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 10, borderRadius: 6, padding: '6px 8px' }}
          formatter={(v) => [`${typeof v === 'number' ? v : 0} 공수`, '']}
          labelFormatter={(d) => `${d}일`}
        />
        <Bar dataKey="hours" fill="#2563eb" radius={[3, 3, 0, 0]}>
          <LabelList
            dataKey="hours"
            position="top"
            fontSize={9}
            fill="#3f3f46"
            formatter={(v) => {
              const n = typeof v === 'number' ? v : Number(v);
              return Number.isFinite(n) && n > 0 ? String(n) : '';
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TradeBreakdownChart({ data }: { data: TradeBreakdownPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart>공종 데이터 없음</EmptyChart>;
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <PieChart>
        <Pie
          data={data}
          dataKey="hours"
          nameKey="trade"
          innerRadius={40}
          outerRadius={68}
          paddingAngle={2}
          label={({ name, value }: { name?: string; value?: number }) => `${name ?? ''} ${value ?? 0}`}
          style={{ fontSize: 10 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 10, borderRadius: 6, padding: '6px 8px' }}
          formatter={(v, n) => [`${typeof v === 'number' ? v : 0} 공수`, String(n ?? '')]}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MonthlyTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart>월별 데이터 없음</EmptyChart>;
  }
  return (
    <ResponsiveContainer width="100%" height={175}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="yearMonth" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatKRW(v)} />
        <Tooltip
          contentStyle={{ fontSize: 10, borderRadius: 6, padding: '6px 8px' }}
          formatter={(v) => [`${typeof v === 'number' ? v.toLocaleString() : 0}원`, '추정 임금총액']}
        />
        <Line
          type="monotone"
          dataKey="estimatedWageTotal"
          stroke="#16a34a"
          strokeWidth={2}
          dot={{ r: 2.5 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WorkerHoursTopChart({ data }: { data: WorkerHoursPoint[] }) {
  if (data.length === 0) {
    return <EmptyChart>작업자 데이터 없음</EmptyChart>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 22)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 40, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={44} />
        <Tooltip
          contentStyle={{ fontSize: 10, borderRadius: 6, padding: '6px 8px' }}
          formatter={(v) => [`${typeof v === 'number' ? v : 0} 공수`, '']}
        />
        <Bar dataKey="hours" fill="#2563eb" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[190px] items-center justify-center text-xs text-zinc-400">
      {children}
    </div>
  );
}
