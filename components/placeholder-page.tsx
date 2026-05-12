import type { LucideIcon } from 'lucide-react';
import { AdminShell } from './admin-shell';
import { Card } from './ui/card';

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  comingFeatures: string[];
};

export function PlaceholderPage({ icon: Icon, title, description, comingFeatures }: Props) {
  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <Icon className="h-3.5 w-3.5" />
            <span>준비 중</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-500 mt-1">{description}</p>
        </div>

        <Card className="p-12 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 mb-4">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-700 mb-2">곧 추가될 기능입니다</h2>
          <p className="text-sm text-zinc-500 mb-6">아래 항목들이 이 화면에서 제공됩니다.</p>
          <ul className="inline-block text-left space-y-1.5 text-sm text-zinc-600">
            {comingFeatures.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-zinc-400 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
