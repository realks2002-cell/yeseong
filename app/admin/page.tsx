'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Hammer } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { idToEmail } from '@/lib/auth/id-email';

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!id.trim()) return setError('ID를 입력하세요');
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다');

    setLoading(true);
    const sb = getBrowserSupabase();
    const { error: authErr } = await sb.auth.signInWithPassword({
      email: idToEmail(id),
      password,
    });
    setLoading(false);

    if (authErr) {
      setError('ID 또는 비밀번호가 올바르지 않습니다');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Hammer className="h-5 w-5" />
          </div>
          <CardTitle>예성건설 노임대장</CardTitle>
          <CardDescription>관리자 로그인</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="id">ID</label>
              <Input
                id="id"
                type="text"
                autoComplete="username"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="admin"
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="password">비밀번호</label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
