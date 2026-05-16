'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, HardHat } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone, normalizePhone, phoneToManagerEmail } from '@/lib/auth/phone-email';
import { KOREAN_BANKS } from '@/lib/constants/banks';
import { TRADES } from '@/lib/constants/trades';

type Mode =
  | 'phone'
  | 'login_pin'
  | 'signup_pin1'
  | 'signup_pin2'
  | 'signup_identity'
  | 'signup_rrn'
  | 'signup_foreign'
  | 'signup_address'
  | 'signup_account'
  | 'signup_work';

type CheckResult = {
  has_worker: boolean;
  worker_has_auth: boolean;
  worker_name: string | null;
  has_manager: boolean;
  missing: string[];
  prefilled: { name: string | null; is_foreign: boolean } | null;
};

const FIELD_TO_MODE: Record<string, Mode> = {
  identity: 'signup_identity',
  rrn: 'signup_rrn',
  foreign: 'signup_foreign',
  address: 'signup_address',
  account: 'signup_account',
  work: 'signup_work',
};

// 매니저는 belonging 없음. work까지가 마지막.
function buildFlow(missing: string[], isForeign: boolean): Mode[] {
  const flow: Mode[] = ['signup_pin1', 'signup_pin2'];
  for (const key of ['identity', 'rrn', 'foreign', 'address', 'account', 'work']) {
    if (key === 'foreign') {
      if (isForeign && (missing.includes('foreign') || missing.includes('rrn'))) {
        flow.push(FIELD_TO_MODE.foreign);
      }
      continue;
    }
    if (missing.includes(key)) flow.push(FIELD_TO_MODE[key]);
  }
  return flow;
}

export default function ManagerSignupPage() {
  const router = useRouter();
  const sb = getBrowserSupabase();

  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [matchedName, setMatchedName] = useState<string | null>(null);

  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState<string | undefined>();
  const [loginBusy, setLoginBusy] = useState(false);

  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');

  const [name, setName] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [rrn, setRrn] = useState('');
  const [nameEnglish, setNameEnglish] = useState('');
  const [nationality, setNationality] = useState('');
  const [visaStatus, setVisaStatus] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCustom, setBankCustom] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [defaultWage, setDefaultWage] = useState('');
  const [defaultTrade, setDefaultTrade] = useState('');
  const [tradeCustom, setTradeCustom] = useState(false);

  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | undefined>();

  const [missingFields, setMissingFields] = useState<string[]>([
    'identity', 'rrn', 'address', 'account', 'work',
  ]);

  const phoneValid = normalizePhone(phone).length >= 10;
  const rrnValid = normalizePhone(rrn).length === 13;
  const wageValid = /^\d+$/.test(defaultWage) && Number(defaultWage) > 0 && Number(defaultWage) < 1_000_000;
  const accountValid = bankName.trim().length > 0
    && /^[\d-]{5,}$/.test(accountNumber)
    && accountHolder.trim().length > 0;

  // 로그인 PIN 자동 처리 (기존 매니저)
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
      const { data, error } = await sb.rpc('yeseong_check_phone_full', { p_phone: phone });
      if (error || !data) {
        setPhoneError(error?.message ?? '오류가 발생했어요');
        return;
      }
      const r = data as unknown as CheckResult;
      if (r.has_manager) {
        setMode('login_pin');
        return;
      }
      if (r.has_worker) {
        setMatchedName(r.worker_name);
        if (r.prefilled?.name) setName(r.prefilled.name);
        if (typeof r.prefilled?.is_foreign === 'boolean') setIsForeign(r.prefilled.is_foreign);
        setMissingFields(r.missing ?? []);
      } else {
        setMissingFields(r.missing ?? ['identity','rrn','address','account','work']);
      }
      setMode('signup_pin1');
    } finally {
      setPhoneBusy(false);
    }
  };

  const flow = buildFlow(missingFields, isForeign);

  const goNext = () => {
    const idx = flow.indexOf(mode);
    if (idx >= 0 && idx < flow.length - 1) setMode(flow[idx + 1]);
  };

  const goNextOrSubmit = () => {
    const idx = flow.indexOf(mode);
    if (idx === flow.length - 1) submitSignup();
    else goNext();
  };

  const back = () => {
    if (mode === 'phone') return;
    if (mode === 'login_pin' || mode === 'signup_pin1') {
      setLoginPin(''); setPin1(''); setMatchedName(null);
      setMode('phone'); return;
    }
    if (mode === 'signup_pin2') { setPin2(''); setMode('signup_pin1'); return; }
    const idx = flow.indexOf(mode);
    if (idx > 0) setMode(flow[idx - 1]);
  };

  const submitSignup = async () => {
    if (signupBusy) return;
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
      const { error: rpcErr } = await sb.rpc('yeseong_manager_signup_full', {
        p_phone: normalizePhone(phone),
        p_pin: pin1,
        p_name: name.trim(),
        p_rrn: rrn ? normalizePhone(rrn) : '',
        p_address: address.trim(),
        p_bank_name: bankName.trim(),
        p_account_number: accountNumber.trim(),
        p_account_holder: accountHolder.trim(),
        p_default_wage: defaultWage ? Number(defaultWage) : null,
        p_default_trade: defaultTrade.trim(),
        p_is_foreign: isForeign,
        p_name_english: nameEnglish.trim() || null,
        p_nationality: nationality.trim() || null,
        p_visa_status: visaStatus.trim() || null,
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
          <ProgressDots mode={mode} flow={flow} />
          <span className="w-12" />
        </div>

        {mode === 'phone' && (
          <PhoneStep
            phone={phone} setPhone={setPhone}
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
            title={
              matchedName ? (
                <>
                  {matchedName}님 환영합니다<br />
                  <span className="text-[24px] text-zinc-500">사용할 PIN 4자리를 만들어주세요</span>
                </>
              ) : (
                <>사용할 PIN<br />4자리를 만들어주세요</>
              )
            }
            value={pin1} onChange={setPin1}
            onNext={goNext}
            disabledNext={pin1.length !== 4}
          />
        )}

        {mode === 'signup_pin2' && (
          <PinStep
            title={<>한 번 더<br />입력해주세요</>}
            value={pin2} onChange={setPin2}
            onNext={goNextOrSubmit}
            disabledNext={pin2.length !== 4 || pin1 !== pin2 || signupBusy}
            errorMessage={signupError ?? (pin2.length === 4 && pin1 !== pin2 ? 'PIN이 일치하지 않아요' : undefined)}
            nextLabel={
              flow.indexOf('signup_pin2') === flow.length - 1
                ? (signupBusy ? '가입 중...' : '가입 완료')
                : '다음'
            }
          />
        )}

        {mode === 'signup_identity' && (
          <IdentityStep
            name={name} setName={setName}
            isForeign={isForeign} setIsForeign={setIsForeign}
            onNext={goNextOrSubmit}
          />
        )}

        {mode === 'signup_rrn' && (
          <RrnStep
            isForeign={isForeign}
            rrn={rrn} setRrn={setRrn}
            valid={rrnValid}
            onNext={goNextOrSubmit}
          />
        )}

        {mode === 'signup_foreign' && (
          <ForeignStep
            nameEnglish={nameEnglish} setNameEnglish={setNameEnglish}
            nationality={nationality} setNationality={setNationality}
            visaStatus={visaStatus} setVisaStatus={setVisaStatus}
            onNext={goNextOrSubmit}
          />
        )}

        {mode === 'signup_address' && (
          <AddressStep
            address={address} setAddress={setAddress}
            valid={address.trim().length > 0}
            onNext={goNextOrSubmit}
          />
        )}

        {mode === 'signup_account' && (
          <AccountStep
            bankName={bankName} setBankName={setBankName}
            bankCustom={bankCustom} setBankCustom={setBankCustom}
            accountNumber={accountNumber} setAccountNumber={setAccountNumber}
            accountHolder={accountHolder} setAccountHolder={setAccountHolder}
            valid={accountValid}
            onNext={goNextOrSubmit}
          />
        )}

        {mode === 'signup_work' && (
          <WorkStep
            defaultWage={defaultWage} setDefaultWage={setDefaultWage}
            defaultTrade={defaultTrade} setDefaultTrade={setDefaultTrade}
            tradeCustom={tradeCustom} setTradeCustom={setTradeCustom}
            valid={wageValid && defaultTrade.trim().length > 0}
            busy={signupBusy}
            error={signupError}
            onSubmit={submitSignup}
          />
        )}
      </div>
    </MobileShell>
  );
}

function ProgressDots({ mode, flow }: { mode: Mode; flow: Mode[] }) {
  if (mode === 'phone') return <span />;
  if (mode === 'login_pin') {
    return (
      <div className="flex gap-2">
        <span className="h-2 w-7 rounded-full bg-blue-900" />
        <span className="h-2 w-7 rounded-full bg-blue-900" />
      </div>
    );
  }
  const current = flow.indexOf(mode);
  const total = flow.length;
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={'h-2 w-4 rounded-full ' + (i <= current ? 'bg-blue-900' : 'bg-zinc-200')} />
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
  title, value, onChange, onNext, disabledNext, errorMessage, nextLabel,
}: {
  title: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onNext?: () => void;
  disabledNext?: boolean;
  errorMessage?: string;
  nextLabel?: string;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">{title}</h1>
      <div className="mt-16 flex items-center justify-center gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={'h-5 w-5 rounded-full transition ' + (i < value.length ? 'bg-blue-900 scale-110' : 'bg-zinc-200')} />
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
      {onNext && <NextButton valid={!disabledNext} onNext={onNext} label={nextLabel ?? '다음'} />}
    </>
  );
}

function IdentityStep({
  name, setName, isForeign, setIsForeign, onNext,
}: {
  name: string;
  setName: (v: string) => void;
  isForeign: boolean;
  setIsForeign: (v: boolean) => void;
  onNext: () => void;
}) {
  const valid = name.trim().length > 0;
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        본인 정보를<br />입력해주세요
      </h1>
      <div className="mt-10 space-y-7">
        <div>
          <label className="text-lg font-semibold text-zinc-500">이름</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            autoFocus
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </div>
        <div>
          <label className="text-lg font-semibold text-zinc-500 mb-3 block">국적 구분</label>
          <div className="grid grid-cols-2 gap-3">
            <SelectChip selected={!isForeign} onClick={() => setIsForeign(false)} label="내국인" />
            <SelectChip selected={isForeign} onClick={() => setIsForeign(true)} label="외국인" />
          </div>
        </div>
      </div>
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function RrnStep({
  isForeign, rrn, setRrn, valid, onNext,
}: {
  isForeign: boolean;
  rrn: string;
  setRrn: (v: string) => void;
  valid: boolean;
  onNext: () => void;
}) {
  const label = isForeign ? '외국인등록번호' : '주민등록번호';
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        {label}를<br />입력해주세요
      </h1>
      <p className="mt-4 text-sm text-zinc-500">노임대장 출력에 사용됩니다.</p>
      <div className="mt-10">
        <label className="text-lg font-semibold text-zinc-500">{label}</label>
        <input
          type="text"
          inputMode="numeric"
          value={rrn}
          onChange={(e) => setRrn(formatRrn(e.target.value))}
          placeholder="000000-0000000"
          autoFocus
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold tracking-wide text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
        />
      </div>
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function ForeignStep({
  nameEnglish, setNameEnglish, nationality, setNationality, visaStatus, setVisaStatus, onNext,
}: {
  nameEnglish: string;
  setNameEnglish: (v: string) => void;
  nationality: string;
  setNationality: (v: string) => void;
  visaStatus: string;
  setVisaStatus: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        외국인 정보<br />(선택)
      </h1>
      <p className="mt-4 text-sm text-zinc-500">모두 비워도 가입할 수 있어요.</p>
      <div className="mt-8 space-y-6">
        <Field label="영문 이름">
          <input
            value={nameEnglish}
            onChange={(e) => setNameEnglish(e.target.value)}
            placeholder="WAI YAN SOE"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </Field>
        <Field label="국적">
          <input
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="중국 / 미얀마 / 베트남 등"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </Field>
        <Field label="비자 종류">
          <input
            value={visaStatus}
            onChange={(e) => setVisaStatus(e.target.value)}
            placeholder="F-4 / E-9 / H-2 등"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </Field>
      </div>
      <NextButton valid onNext={onNext} label="다음" />
    </>
  );
}

function AddressStep({
  address, setAddress, valid, onNext,
}: {
  address: string;
  setAddress: (v: string) => void;
  valid: boolean;
  onNext: () => void;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        주소를<br />입력해주세요
      </h1>
      <div className="mt-10">
        <label className="text-lg font-semibold text-zinc-500">주소</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="서울특별시 강남구 테헤란로 100"
          autoFocus
          rows={3}
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300 resize-none"
        />
      </div>
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function AccountStep({
  bankName, setBankName, bankCustom, setBankCustom,
  accountNumber, setAccountNumber,
  accountHolder, setAccountHolder,
  valid, onNext,
}: {
  bankName: string;
  setBankName: (v: string) => void;
  bankCustom: boolean;
  setBankCustom: (v: boolean) => void;
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  accountHolder: string;
  setAccountHolder: (v: string) => void;
  valid: boolean;
  onNext: () => void;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        계좌 정보를<br />입력해주세요
      </h1>
      <p className="mt-4 text-sm text-zinc-500">임금 입금에 사용됩니다.</p>
      <div className="mt-8 space-y-6">
        <Field label="은행">
          {bankCustom ? (
            <div className="mt-2 flex gap-2">
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="은행명 직접 입력"
                autoFocus
                className="flex-1 border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
              />
              <button
                type="button"
                onClick={() => { setBankCustom(false); setBankName(''); }}
                className="text-sm font-semibold text-zinc-500 underline"
              >
                목록
              </button>
            </div>
          ) : (
            <select
              value={bankName}
              onChange={(e) => {
                if (e.target.value === '__custom__') { setBankCustom(true); setBankName(''); }
                else setBankName(e.target.value);
              }}
              className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none"
            >
              <option value="">선택하세요</option>
              {KOREAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              <option value="__custom__">직접 입력...</option>
            </select>
          )}
        </Field>
        <Field label="계좌번호">
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="110-123-456789"
            inputMode="numeric"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold tracking-wider text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </Field>
        <Field label="예금주">
          <input
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="홍길동"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
        </Field>
      </div>
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function WorkStep({
  defaultWage, setDefaultWage,
  defaultTrade, setDefaultTrade, tradeCustom, setTradeCustom,
  valid, busy, error, onSubmit,
}: {
  defaultWage: string;
  setDefaultWage: (v: string) => void;
  defaultTrade: string;
  setDefaultTrade: (v: string) => void;
  tradeCustom: boolean;
  setTradeCustom: (v: boolean) => void;
  valid: boolean;
  busy: boolean;
  error?: string;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        직무 정보를<br />입력해주세요
      </h1>
      <div className="mt-8 space-y-6">
        <Field label="일당 (원)">
          <input
            value={defaultWage}
            onChange={(e) => setDefaultWage(e.target.value.replace(/\D/g, ''))}
            placeholder="270000"
            inputMode="numeric"
            autoFocus
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-2xl font-bold tabular-nums text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
          />
          {defaultWage && /^\d+$/.test(defaultWage) && (
            <p className="mt-1 text-sm text-zinc-500">{Number(defaultWage).toLocaleString()}원</p>
          )}
        </Field>
        <Field label="공종">
          {tradeCustom ? (
            <div className="mt-2 flex gap-2">
              <input
                value={defaultTrade}
                onChange={(e) => setDefaultTrade(e.target.value)}
                placeholder="공종 직접 입력"
                autoFocus
                className="flex-1 border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-blue-900 placeholder:text-zinc-300"
              />
              <button
                type="button"
                onClick={() => { setTradeCustom(false); setDefaultTrade(''); }}
                className="text-sm font-semibold text-zinc-500 underline"
              >
                목록
              </button>
            </div>
          ) : (
            <select
              value={defaultTrade}
              onChange={(e) => {
                if (e.target.value === '__custom__') { setTradeCustom(true); setDefaultTrade(''); }
                else setDefaultTrade(e.target.value);
              }}
              className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-blue-900 outline-none"
            >
              <option value="">선택하세요</option>
              {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__custom__">직접 입력...</option>
            </select>
          )}
        </Field>
      </div>
      {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}
      <NextButton valid={valid && !busy} onNext={onSubmit} label={busy ? '가입 중...' : '가입 완료'} />
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

function SelectChip({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'h-[68px] rounded-[5px] text-xl font-bold ring-2 transition ' +
        (selected ? 'bg-blue-900 text-white ring-blue-900' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-400')
      }
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-base font-semibold text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

function formatRrn(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}
