import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';

export default async function MobileGate() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? '/m/home' : '/m/signup');
}
