'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Hammer } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@iru.test');
  const [password, setPassword] = useState('');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mock 모드: 무조건 통과
    router.push('/dashboard');
  }

  return (
    <div className="min-h-svh flex items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <Hammer className="h-5 w-5" />
          </div>
          <CardTitle>이루건설 노임대장</CardTitle>
          <CardDescription>출역부 사진을 자동으로 양식에 채워줍니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">이메일</label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="password">비밀번호</label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="(Mock 모드: 아무거나)" />
            </div>
            <Button type="submit" className="w-full">로그인</Button>
            <p className="text-center text-xs text-zinc-500">
              현재 Mock 모드입니다. Supabase 연결 후 실제 인증으로 교체됩니다.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
