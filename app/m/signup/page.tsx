'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Camera, Check, Hammer } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { login } from '@/lib/mock/session';
import { isRegistered, verifyPin } from '@/lib/mock/users';

type Mode = 'phone' | 'login_pin' | 'signup_pin1' | 'signup_pin2' | 'signup_profile';

export default function SignupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState<string | undefined>();
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [name, setName] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasBank, setHasBank] = useState(false);

  const phoneValid = phone.replace(/\D/g, '').length >= 10;

  useEffect(() => {
    if (mode !== 'login_pin' || loginPin.length !== 4) return;
    if (verifyPin(phone, loginPin)) {
      login();
      router.replace('/m/home');
    } else {
      setLoginError('PIN이 맞지 않아요');
      setTimeout(() => {
        setLoginPin('');
        setLoginError(undefined);
      }, 1200);
    }
  }, [mode, loginPin, phone, router]);

  const onPhoneNext = () => {
    if (!phoneValid) return;
    setMode(isRegistered(phone) ? 'login_pin' : 'signup_pin1');
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
    if (mode === 'signup_profile') {
      setMode('signup_pin2');
      return;
    }
  };

  const submitProfile = () => {
    if (!name) return;
    login();
    router.replace('/m/home');
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
            valid={phoneValid}
            onNext={onPhoneNext}
          />
        )}

        {mode === 'login_pin' && (
          <PinStep
            title={
              <>
                다시 만나서 반가워요<br />
                PIN을 입력해주세요
              </>
            }
            value={loginPin}
            onChange={setLoginPin}
            errorMessage={loginError}
          />
        )}

        {mode === 'signup_pin1' && (
          <PinStep
            title={
              <>
                사용할 PIN<br />
                4자리를 만들어주세요
              </>
            }
            value={pin1}
            onChange={setPin1}
            onNext={() => setMode('signup_pin2')}
            disabledNext={pin1.length !== 4}
          />
        )}

        {mode === 'signup_pin2' && (
          <PinStep
            title={
              <>
                한 번 더<br />
                입력해주세요
              </>
            }
            value={pin2}
            onChange={setPin2}
            onNext={() => setMode('signup_profile')}
            disabledNext={pin2.length !== 4 || pin1 !== pin2}
            errorMessage={pin2.length === 4 && pin1 !== pin2 ? 'PIN이 일치하지 않아요' : undefined}
          />
        )}

        {mode === 'signup_profile' && (
          <ProfileStep
            name={name}
            setName={setName}
            hasPhoto={hasPhoto}
            setHasPhoto={setHasPhoto}
            hasBank={hasBank}
            setHasBank={setHasBank}
            onSubmit={submitProfile}
          />
        )}
      </div>
    </MobileShell>
  );
}

function ProgressDots({ mode }: { mode: Mode }) {
  if (mode === 'phone') return <span />;
  const isLogin = mode === 'login_pin';
  const total = isLogin ? 2 : 4;
  const current = isLogin
    ? 2
    : mode === 'signup_pin1'
    ? 2
    : mode === 'signup_pin2'
    ? 3
    : 4;
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={'h-2 w-7 rounded-full ' + (i < current ? 'bg-blue-900' : 'bg-zinc-200')}
        />
      ))}
    </div>
  );
}

function PhoneStep({
  phone,
  setPhone,
  valid,
  onNext,
}: {
  phone: string;
  setPhone: (v: string) => void;
  valid: boolean;
  onNext: () => void;
}) {
  return (
    <>
      <div className="mt-6 flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-900 text-white">
          <Hammer className="h-6 w-6" />
        </span>
        <span className="text-2xl font-bold text-zinc-900">예성건설</span>
      </div>

      <h1 className="mt-10 text-[40px] font-bold leading-tight text-zinc-900">
        전화번호를<br />
        입력해주세요
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

      <div className="mt-auto pt-10">
        <button
          onClick={onNext}
          disabled={!valid}
          className={
            'h-[78px] w-full rounded-2xl text-2xl font-bold transition ' +
            (valid ? 'bg-red-800 text-white active:scale-[0.98]' : 'bg-zinc-100 text-zinc-400')
          }
        >
          다음
        </button>
      </div>
    </>
  );
}

function PinStep({
  title,
  value,
  onChange,
  onNext,
  disabledNext,
  errorMessage,
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
            className={
              'h-5 w-5 rounded-full transition ' +
              (i < value.length ? 'bg-blue-900 scale-110' : 'bg-zinc-200')
            }
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

      {onNext && (
        <div className="mt-auto pt-10">
          <button
            onClick={onNext}
            disabled={disabledNext}
            className={
              'h-[78px] w-full rounded-2xl text-2xl font-bold transition ' +
              (disabledNext
                ? 'bg-zinc-100 text-zinc-400'
                : 'bg-red-800 text-white active:scale-[0.98]')
            }
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}

function ProfileStep({
  name,
  setName,
  hasPhoto,
  setHasPhoto,
  hasBank,
  setHasBank,
  onSubmit,
}: {
  name: string;
  setName: (v: string) => void;
  hasPhoto: boolean;
  setHasPhoto: (v: boolean) => void;
  hasBank: boolean;
  setHasBank: (v: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        본인 정보를<br />
        입력해주세요
      </h1>

      <div className="mt-10 space-y-7">
        <div>
          <label className="text-lg font-semibold text-zinc-500">이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </div>

        <PhotoButton label="본인 사진" uploaded={hasPhoto} onClick={() => setHasPhoto(true)} />
        <PhotoButton label="통장 사진" uploaded={hasBank} onClick={() => setHasBank(true)} />
      </div>

      <div className="mt-auto pt-10">
        <button
          onClick={onSubmit}
          disabled={!name}
          className={
            'flex h-[78px] w-full items-center justify-center gap-3 rounded-2xl text-2xl font-bold transition ' +
            (name ? 'bg-red-800 text-white active:scale-[0.98]' : 'bg-zinc-100 text-zinc-400')
          }
        >
          가입 완료
        </button>
      </div>
    </>
  );
}

function PhotoButton({
  label,
  uploaded,
  onClick,
}: {
  label: string;
  uploaded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex h-[88px] w-full items-center justify-between rounded-2xl px-6 text-left transition ' +
        (uploaded
          ? 'bg-blue-50 ring-2 ring-blue-900'
          : 'bg-white ring-1 ring-zinc-200 hover:ring-zinc-400')
      }
    >
      <div>
        <div className="text-xl font-bold text-zinc-900">{label}</div>
        <div className={'mt-1 text-sm font-semibold ' + (uploaded ? 'text-blue-900' : 'text-zinc-500')}>
          {uploaded ? '촬영 완료' : '탭하여 촬영'}
        </div>
      </div>
      {uploaded ? (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-900 text-white">
          <Check className="h-6 w-6" />
        </span>
      ) : (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-zinc-300 text-zinc-700">
          <Camera className="h-6 w-6" />
        </span>
      )}
    </button>
  );
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
