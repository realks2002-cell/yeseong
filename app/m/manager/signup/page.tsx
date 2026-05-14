'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, HardHat } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone, normalizePhone, phoneToManagerEmail } from '@/lib/auth/phone-email';

type Mode = 'phone' | 'login_pin' | 'signup_pin1' | 'signup_pin2' | 'signup_name';

const SIGNUP_STEPS: Mode[] = ['signup_pin1', 'signup_pin2', 'signup_name'];

export default function ManagerSignupPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState<string | undefined>();
  const [loginBusy, setLoginBusy] = useState(false);

  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [name, setName] = useState('');

  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | undefined>();

  const phoneValid = normalizePhone(phone).length >= 10;

  useEffect(() => {
    if (mode !== 'login_pin' || loginPin.length !== 4 || loginBusy) return;
    (async () => {
      setLoginBusy(true);
      setLoginError(undefined);
      const { error } = await sb.auth.signInWithPassword({
        email: phoneToManagerEmail(phone),
        password: loginPin,
      });
      setLoginBusy(false);
      if (error) {
        setLoginError('PIN이 맞지 않아요');
        setTimeout(() => {
          setLoginPin('');
          setLoginError(undefined);
        }, 1200);
        return;
      }
      router.replace('/m/manager');
      router.refresh();
    })();
  }, [mode, loginPin, phone, sb, router, loginBusy]);

  const onPhoneNext = async () => {
    if (!phoneValid || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneError(undefined);
    try {
      const res = await fetch('/api/m/manager/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPhoneError(j.error ?? '오류가 발생했어요');
        return;
      }
      setMode(j.exists ? 'login_pin' : 'signup_pin1');
    } finally {
      setPhoneBusy(false);
    }
  };

  const goNext = () => {
    if (mode === 'signup_pin1') return setMode('signup_pin2');
    if (mode === 'signup_pin2') return setMode('signup_name');
  };

  const back = () => {
    if (mode === 'phone') return;
    if (mode === 'login_pin' || mode === 'signup_pin1') {
      setLoginPin('');
      setPin1('');
      setMode('phone');
      return;
    }
    if (mode === 'signup_pin2') {
      setPin2('');
      setMode('signup_pin1');
      return;
    }
    if (mode === 'signup_name') return setMode('signup_pin2');
  };

  const submitSignup = async () => {
    if (!name.trim() || signupBusy) return;
    setSignupBusy(true);
    setSignupError(undefined);
    try {
      const signupRes = await fetch('/api/m/manager/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: pin1 }),
      });
      if (!signupRes.ok) {
        const j = await signupRes.json().catch(() => ({}));
        setSignupError(j.error === 'already_registered' ? '이미 가입된 번호입니다' : '가입에 실패했어요');
        return;
      }

      const { error: signInErr } = await sb.auth.signInWithPassword({
        email: phoneToManagerEmail(phone),
        password: pin1,
      });
      if (signInErr) {
        setSignupError('로그인에 실패했어요');
        return;
      }

      const { error: rpcErr } = await sb.rpc('yeseong_manager_signup_or_link', {
        p_phone: normalizePhone(phone),
        p_name: name.trim(),
      });
      if (rpcErr) {
        setSignupError('프로필 저장 실패: ' + rpcErr.message);
        return;
      }

      router.replace('/m/manager/assignments?first=1');
      router.refresh();
    } finally {
      setSignupBusy(false);
    }
  };

  return (
    <MobileShell>
      <div className="flex h-full min-h-svh sm:min-h-[860px] flex-col px-7 pt-8 pb-10">
        <div className="flex items-center justify-between">
          <button
            onClick={back}
            className="-ml-2 inline-flex h-12 w-12 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 disabled:text-zinc-300"
            disabled={mode === 'phone'}
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <ProgressDots mode={mode} />
          <span className="w-12" />
        </div>

        {mode === 'phone' && (
          <PhoneStep
            phone={phone}
            setPhone={setPhone}
            valid={phoneValid && !phoneBusy}
            onNext={onPhoneNext}
            error={phoneError}
          />
        )}

        {mode === 'login_pin' && (
          <PinStep
            title={<>다시 만나서 반가워요<br />PIN을 입력해주세요</>}
            value={loginPin}
            onChange={setLoginPin}
            errorMessage={loginError}
          />
        )}

        {mode === 'signup_pin1' && (
          <PinStep
            title={<>사용할 PIN<br />4자리를 만들어주세요</>}
            value={pin1}
            onChange={setPin1}
            onNext={goNext}
            disabledNext={pin1.length !== 4}
          />
        )}

        {mode === 'signup_pin2' && (
          <PinStep
            title={<>한 번 더<br />입력해주세요</>}
            value={pin2}
            onChange={setPin2}
            onNext={goNext}
            disabledNext={pin2.length !== 4 || pin1 !== pin2}
            errorMessage={pin2.length === 4 && pin1 !== pin2 ? 'PIN이 일치하지 않아요' : undefined}
          />
        )}

        {mode === 'signup_name' && (
          <NameStep
            name={name}
            setName={setName}
            onSubmit={submitSignup}
            busy={signupBusy}
            error={signupError}
          />
        )}
      </div>
    </MobileShell>
  );
}

function ProgressDots({ mode }: { mode: Mode }) {
  if (mode === 'phone') return <span />;
  if (mode === 'login_pin') {
    return (
      <div className="flex gap-2">
        <span className="h-2 w-7 rounded-full bg-blue-900" />
        <span className="h-2 w-7 rounded-full bg-blue-900" />
      </div>
    );
  }
  const current = SIGNUP_STEPS.indexOf(mode);
  return (
    <div className="flex gap-2">
      {SIGNUP_STEPS.map((_, i) => (
        <span
          key={i}
          className={'h-2 w-7 rounded-full ' + (i <= current ? 'bg-blue-900' : 'bg-zinc-200')}
        />
      ))}
    </div>
  );
}

function PhoneStep({
  phone, setPhone, valid, onNext, error,
}: {
  phone: string;
  setPhone: (v: string) => void;
  valid: boolean;
  onNext: () => void;
  error?: string;
}) {
  return (
    <>
      <div className="mt-6 flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[5px] bg-blue-900 text-white">
          <HardHat className="h-6 w-6" />
        </span>
        <div>
          <p className="text-2xl font-bold text-zinc-900">(주)예성건축 소장</p>
          <p className="text-sm font-semibold text-zinc-500">현장 소장 전용</p>
        </div>
      </div>
      <h1 className="mt-10 text-[40px] font-bold leading-tight text-zinc-900">
        전화번호를<br />입력해주세요
      </h1>
      <div className="mt-12">
        <label className="text-lg font-semibold text-zinc-500">전화번호</label>
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          placeholder="010-1234-5678"
          autoFocus
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[36px] font-bold tracking-wide text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
        />
      </div>
      {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function PinStep({
  title, value, onChange, onNext, disabledNext, errorMessage,
}: {
  title: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onNext?: () => void;
  disabledNext?: boolean;
  errorMessage?: string;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">{title}</h1>
      <div className="mt-16 flex items-center justify-center gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={'h-5 w-5 rounded-full transition ' + (i < value.length ? 'bg-blue-900 scale-110' : 'bg-zinc-200')}
          />
        ))}
      </div>
      <input
        type="password"
        inputMode="numeric"
        value={value}
        maxLength={4}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        autoFocus
        className="mt-10 mx-auto w-44 border-b-[3px] border-zinc-200 bg-transparent pb-2 text-center text-[40px] font-bold tracking-[20px] text-zinc-900 outline-none focus:border-blue-900"
      />
      {errorMessage && (
        <p className="mt-6 text-center text-lg font-semibold text-red-800">{errorMessage}</p>
      )}
      {onNext && <NextButton valid={!disabledNext} onNext={onNext} label="다음" />}
    </>
  );
}

function NameStep({
  name, setName, onSubmit, busy, error,
}: {
  name: string;
  setName: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: string;
}) {
  const valid = name.trim().length > 0 && !busy;
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        성함을<br />입력해주세요
      </h1>
      <div className="mt-10">
        <label className="text-lg font-semibold text-zinc-500">이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          autoFocus
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
        />
      </div>
      {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}
      <NextButton valid={valid} onNext={onSubmit} label={busy ? '가입 중...' : '가입 완료'} />
    </>
  );
}

function NextButton({ valid, onNext, label }: { valid: boolean; onNext: () => void; label: string }) {
  return (
    <div className="mt-auto pt-10">
      <button
        onClick={onNext}
        disabled={!valid}
        className={
          'h-[78px] w-full rounded-[5px] text-2xl font-bold transition ' +
          (valid ? 'bg-blue-900 text-white active:scale-[0.98]' : 'bg-zinc-100 text-zinc-400')
        }
      >
        {label}
      </button>
    </div>
  );
}
