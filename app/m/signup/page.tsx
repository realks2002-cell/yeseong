'use client';
import { useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors/message';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronDown, ChevronUp, Hammer, Check } from 'lucide-react';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { formatPhone, normalizePhone, phoneToEmail, pinToPassword } from '@/lib/auth/phone-email';
import { KOREAN_BANKS } from '@/lib/constants/banks';
import { GRADES } from '@/lib/constants/trades';

type Mode =
  | 'phone'
  | 'login_pin'
  | 'signup_consent'
  | 'signup_pin1'
  | 'signup_pin2'
  | 'signup_identity'
  | 'signup_rrn'
  | 'signup_leader'
  | 'signup_foreign'
  | 'signup_address'
  | 'signup_account'
  | 'signup_work';

const CONSENT_VERSION = '1.1';
// 동의 표시는 "이 설치(기기)"에 묶는다 — 재설치하면 플래그가 사라져 다시 뜬다.
const CONSENT_ACK_KEY = `consent-ack-${CONSENT_VERSION}`;

const SIGNUP_STEPS: Mode[] = [
  'signup_consent',
  'signup_pin1',
  'signup_pin2',
  'signup_identity',
  'signup_rrn',
  'signup_leader',
  'signup_foreign',
  'signup_address',
  'signup_account',
  'signup_work',
];

// 결측 단계 키 ↔ Mode 매핑 (PIN은 항상 받음)
const FIELD_TO_MODE: Record<string, Mode> = {
  identity: 'signup_identity',
  rrn: 'signup_rrn',
  leader: 'signup_leader',
  foreign: 'signup_foreign',
  address: 'signup_address',
  account: 'signup_account',
  work: 'signup_work',
};

function buildFlow(missing: string[], isForeign: boolean, isPartial: boolean): Mode[] {
  const flow: Mode[] = ['signup_consent', 'signup_pin1', 'signup_pin2'];
  for (const key of ['identity', 'rrn', 'leader', 'foreign', 'address', 'account', 'work']) {
    if (key === 'leader') {
      // 팀장 선택은 missing에 'leader'가 있을 때만 (신규 흐름 전용). partial 흐름은 변경 없음.
      if (missing.includes('leader')) flow.push(FIELD_TO_MODE.leader);
      continue;
    }
    if (key === 'foreign') {
      // partial이면 외국인 단계도 항상 보여줌 (Review 또는 Input).
      // 신규(간소 등록)는 외국인 추가정보를 받지 않고 관리자가 /workers에서 보완.
      if (isForeign && (isPartial || missing.includes('foreign'))) {
        flow.push(FIELD_TO_MODE.foreign);
      }
      continue;
    }
    // partial이면 모든 단계 흐름에 포함 (missing이면 InputStep, 아니면 ReviewStep)
    if (isPartial || missing.includes(key)) flow.push(FIELD_TO_MODE[key]);
  }
  return flow;
}

export default function SignupPage() {
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

  // 신원
  const [name, setName] = useState('');
  const [isForeign, setIsForeign] = useState(false);

  // 주민번호 / 외국인등록번호
  const [rrn, setRrn] = useState('');

  // 외국인 추가 (선택)
  const [nameEnglish, setNameEnglish] = useState('');
  const [nationality, setNationality] = useState('');
  const [visaStatus, setVisaStatus] = useState('');

  const [address, setAddress] = useState('');

  // 계좌
  const [bankName, setBankName] = useState('');
  const [bankCustom, setBankCustom] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  // 직무
  const [defaultWage, setDefaultWage] = useState('');
  const [skillGrade, setSkillGrade] = useState('');
  const [defaultTrade, setDefaultTrade] = useState('');
  const [tradeCustom, setTradeCustom] = useState(false);
  const [trades, setTrades] = useState<string[]>([]);

  // 팀장 (신규 가입 시 선택)
  const [teamLeaderId, setTeamLeaderId] = useState('');
  const [teamLeaders, setTeamLeaders] = useState<{ id: string; name: string }[]>([]);

  // 동의 (PIPA)
  const [consentPersonal, setConsentPersonal] = useState(false);
  const [consentRrn, setConsentRrn] = useState(false);
  const [consentLocation, setConsentLocation] = useState(false);
  const [consentForeignId, setConsentForeignId] = useState(false);
  const [consentThirdParty, setConsentThirdParty] = useState(false);

  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | undefined>();

  useEffect(() => {
    sb.rpc('yeseong_list_team_leaders').then(({ data }) => {
      if (Array.isArray(data)) setTeamLeaders(data as { id: string; name: string }[]);
    });
    sb.rpc('yeseong_list_trades').then(({ data }) => {
      if (Array.isArray(data)) setTrades((data as { name: string }[]).map((t) => t.name));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // phone 매칭 결과 — 어떤 단계만 진행할지
  const [missingFields, setMissingFields] = useState<string[]>([
    'identity', 'rrn', 'address', 'account', 'work',
  ]);

  // DB에 이미 있는 정보 (확인 단계용)
  type Prefilled = {
    rrn_prefix?: string | null;
    rrn_gender_digit?: string | null;
  } | null;
  const [prefilled, setPrefilled] = useState<Prefilled>(null);
  // 로그인 경로(기존 가입자)를 동의 화면 뒤에 이어붙일 때 true
  const [loginAfterConsent, setLoginAfterConsent] = useState(false);

  const phoneValid = normalizePhone(phone).length >= 10;
  const rrnValid = normalizePhone(rrn).length === 13;
  const wageValid = /^\d+$/.test(defaultWage) && Number(defaultWage) > 0 && Number(defaultWage) < 1_000_000;
  const accountValid = bankName.trim().length > 0
    && /^[\d-]{5,}$/.test(accountNumber)
    && accountHolder.trim().length > 0;

  // 로그인 PIN 자동 처리
  useEffect(() => {
    if (mode !== 'login_pin' || loginPin.length !== 4 || loginBusy) return;
    (async () => {
      setLoginBusy(true);
      setLoginError(undefined);
      const { error } = await sb.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password: pinToPassword(loginPin),
      });
      setLoginBusy(false);
      if (error) {
        // 자격증명 오류(실제 PIN 불일치)만 "PIN이 일치하지 않습니다." — 그 외(네트워크 등)는 실제 사유 노출
        const isInvalidCred = error.status === 400 || /invalid|credential/i.test(error.message ?? '');
        if (isInvalidCred) {
          setLoginError('PIN이 일치하지 않습니다.');
          setTimeout(() => { setLoginPin(''); setLoginError(undefined); }, 1800);
        } else {
          setLoginError(toUserMessage(error, '네트워크 연결을 확인해 주십시오.'));
          setLoginPin('');
        }
        return;
      }
      // 로그인 성공 — 동의 화면을 거쳤으면 재동의를 서버에 기록 (best-effort)
      try { await sb.rpc('yeseong_ack_consent', { p_version: CONSENT_VERSION }); } catch { /* 무시 */ }
      router.replace('/m/home');
    })();
  }, [mode, loginPin, phone, sb, router, loginBusy]);

  const onPhoneNext = async () => {
    if (!phoneValid || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneError(undefined);
    try {
      const res = await fetch('/api/m/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const j = await res.json();
      if (!res.ok) {
        setPhoneError(j.error ?? '오류가 발생했습니다.');
        return;
      }

      if (j.mode === 'login') {
        // 이미 가입된 번호도 이 설치에서 아직 동의 안 했으면 동의 화면부터 (재설치 시 다시 뜸)
        let acked = false;
        try { acked = localStorage.getItem(CONSENT_ACK_KEY) === '1'; } catch { /* 무시 */ }
        if (acked) {
          setMode('login_pin');
        } else {
          setLoginAfterConsent(true);
          setMode('signup_consent');
        }
        return;
      }
      setLoginAfterConsent(false);
      if (j.mode === 'signup_partial') {
        setMissingFields(j.missing ?? []);
        const p = j.prefilled ?? {};
        setPrefilled(p);
        if (p.name) setName(p.name);
        if (typeof p.is_foreign === 'boolean') setIsForeign(p.is_foreign);
        if (p.name_english) setNameEnglish(p.name_english);
        if (p.nationality) setNationality(p.nationality);
        if (p.visa_status) setVisaStatus(p.visa_status);
        if (p.address) setAddress(p.address);
        if (p.bank_name) setBankName(p.bank_name);
        if (p.account_number) setAccountNumber(p.account_number);
        if (p.account_holder) setAccountHolder(p.account_holder);
        if (typeof p.default_wage === 'number' && p.default_wage > 0) setDefaultWage(String(p.default_wage));
        if (p.skill_grade) setSkillGrade(p.skill_grade);
        if (p.default_trade) setDefaultTrade(p.default_trade);
      } else {
        // signup_new
        setMissingFields(j.missing ?? ['identity', 'rrn', 'address', 'account', 'work']);
        setPrefilled(null);
      }
      setMode('signup_consent');
    } finally {
      setPhoneBusy(false);
    }
  };

  // missingFields + isForeign 기반 동적 흐름. partial이면 모든 단계 Review로 보임.
  const flow = buildFlow(missingFields, isForeign, prefilled !== null);
  const isLast = flow.indexOf(mode) === flow.length - 1;

  const goNext = () => {
    const idx = flow.indexOf(mode);
    if (idx >= 0 && idx < flow.length - 1) setMode(flow[idx + 1]);
  };

  // 동의 화면 통과 시: 이 설치에 "동의함" 표시 → 로그인 경로면 PIN, 신규/부분이면 다음 단계
  const onConsentNext = () => {
    try { localStorage.setItem(CONSENT_ACK_KEY, '1'); } catch { /* 무시 */ }
    if (loginAfterConsent) setMode('login_pin');
    else goNext();
  };

  const back = () => {
    if (mode === 'phone') return;
    if (mode === 'login_pin' || mode === 'signup_consent') {
      setLoginPin('');
      setMode('phone');
      return;
    }
    if (mode === 'signup_pin1') {
      setPin1('');
      setMode('signup_consent');
      return;
    }
    if (mode === 'signup_pin2') {
      setPin2('');
      setMode('signup_pin1');
      return;
    }
    const idx = flow.indexOf(mode);
    if (idx > 0) setMode(flow[idx - 1]);
  };

  const submitSignup = async () => {
    if (signupBusy) return;
    setSignupBusy(true);
    setSignupError(undefined);
    try {
      const signupRes = await fetch('/api/m/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin: pin1 }),
      });
      if (!signupRes.ok) {
        const j = await signupRes.json().catch(() => ({}));
        setSignupError(j.error === 'already_registered' ? '이미 가입된 번호입니다' : '가입에 실패했습니다.');
        return;
      }

      const { error: signInErr } = await sb.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password: pinToPassword(pin1),
      });
      if (signInErr) {
        setSignupError('로그인에 실패했습니다.');
        return;
      }

      // RPC는 nullif로 빈 문자열을 NULL 취급하므로 매칭된 워커는 기존 값 유지
      const { error: rpcErr } = await sb.rpc('yeseong_mobile_signup_full', {
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
        p_skill_grade: skillGrade || null,
        p_consent_personal: consentPersonal,
        p_consent_rrn: consentRrn,
        p_consent_location: consentLocation,
        p_consent_foreign_id: consentForeignId,
        p_consent_third_party: consentThirdParty,
        p_consent_version: CONSENT_VERSION,
        p_team_leader_id: teamLeaderId || null,
      });
      if (rpcErr) {
        const msg = rpcErr.message;
        if (msg.includes('consent_personal_required')) setSignupError('개인정보 수집 동의가 필요합니다.');
        else if (msg.includes('consent_rrn_required')) setSignupError('주민등록번호 수집 동의가 필요합니다.');
        else if (msg.includes('consent_location_required')) setSignupError('위치정보 수집 동의가 필요합니다.');
        else if (msg.includes('consent_foreign_id_required')) setSignupError('외국인등록번호 수집 동의가 필요합니다.');
        else setSignupError('프로필 저장 실패: ' + msg);
        return;
      }

      router.replace('/m/home');
    } finally {
      setSignupBusy(false);
    }
  };

  // 마지막 단계인지에 따라 next or submit
  const goNextOrSubmit = () => {
    const idx = flow.indexOf(mode);
    if (idx === flow.length - 1) submitSignup();
    else goNext();
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

        {signupError && (
          <p className="mt-6 rounded-[5px] bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-600">
            {signupError}
          </p>
        )}

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
            title={<>비밀번호 입력</>}
            subtitle="앱 비밀번호를 입력하세요"
            value={loginPin}
            onChange={setLoginPin}
            errorMessage={loginError}
          />
        )}

        {mode === 'signup_consent' && (
          <ConsentStep
            consentPersonal={consentPersonal} setConsentPersonal={setConsentPersonal}
            consentRrn={consentRrn} setConsentRrn={setConsentRrn}
            consentLocation={consentLocation} setConsentLocation={setConsentLocation}
            consentForeignId={consentForeignId} setConsentForeignId={setConsentForeignId}
            consentThirdParty={consentThirdParty} setConsentThirdParty={setConsentThirdParty}
            onNext={onConsentNext}
          />
        )}

        {mode === 'signup_pin1' && (
          <PinStep
            title={<>비밀번호 설정</>}
            subtitle="앱에서 사용할 간편암호를 입력하세요"
            value={pin1}
            onChange={setPin1}
            onNext={goNext}
            disabledNext={pin1.length !== 4}
          />
        )}

        {mode === 'signup_pin2' && (
          <PinStep
            title={<>비밀번호 확인</>}
            subtitle="한 번 더 입력하세요"
            value={pin2}
            onChange={setPin2}
            onNext={goNext}
            disabledNext={pin2.length !== 4 || pin1 !== pin2}
            errorMessage={pin2.length === 4 && pin1 !== pin2 ? '비밀번호가 일치하지 않습니다.' : undefined}
          />
        )}

        {mode === 'signup_identity' && (
          missingFields.includes('identity') ? (
            <IdentityStep
              name={name}
              setName={setName}
              isForeign={isForeign}
              setIsForeign={setIsForeign}
              onNext={goNextOrSubmit}
            />
          ) : (
            <ReviewStep
              title="신원 확인"
              items={[
                { label: '성명', value: name },
                { label: '구분', value: isForeign ? '외국인' : '내국인' },
              ]}
              onNext={goNextOrSubmit}
            />
          )
        )}

        {mode === 'signup_rrn' && (
          missingFields.includes('rrn') ? (
            <RrnStep
              isForeign={isForeign}
              rrn={rrn}
              setRrn={setRrn}
              valid={rrnValid}
              onNext={goNextOrSubmit}
              isLast={isLast}
            />
          ) : (
            <ReviewStep
              title={isForeign ? '외국인등록번호 확인' : '주민번호 확인'}
              items={[
                {
                  label: '번호',
                  value: prefilled?.rrn_prefix
                    ? `${prefilled.rrn_prefix}-${prefilled.rrn_gender_digit ?? '*'}******`
                    : null,
                },
              ]}
              onNext={goNextOrSubmit}
            />
          )
        )}

        {mode === 'signup_leader' && (
          <LeaderStep
            teamLeaders={teamLeaders}
            teamLeaderId={teamLeaderId}
            setTeamLeaderId={setTeamLeaderId}
            onNext={goNextOrSubmit}
            isLast={isLast}
          />
        )}

        {mode === 'signup_foreign' && (
          missingFields.includes('foreign') ? (
            <ForeignStep
              nameEnglish={nameEnglish} setNameEnglish={setNameEnglish}
              nationality={nationality} setNationality={setNationality}
              visaStatus={visaStatus} setVisaStatus={setVisaStatus}
              onNext={goNextOrSubmit}
            />
          ) : (
            <ReviewStep
              title="외국인 추가정보 확인"
              items={[
                { label: '영문명', value: nameEnglish },
                { label: '국적', value: nationality },
                { label: '체류자격', value: visaStatus },
              ]}
              onNext={goNextOrSubmit}
            />
          )
        )}

        {mode === 'signup_address' && (
          missingFields.includes('address') ? (
            <AddressStep
              address={address}
              setAddress={setAddress}
              valid={address.trim().length > 0}
              onNext={goNextOrSubmit}
            />
          ) : (
            <ReviewStep
              title="주소 확인"
              items={[{ label: '주소', value: address }]}
              onNext={goNextOrSubmit}
            />
          )
        )}

        {mode === 'signup_account' && (
          missingFields.includes('account') ? (
            <AccountStep
              bankName={bankName} setBankName={setBankName}
              bankCustom={bankCustom} setBankCustom={setBankCustom}
              accountNumber={accountNumber} setAccountNumber={setAccountNumber}
              accountHolder={accountHolder} setAccountHolder={setAccountHolder}
              valid={accountValid}
              onNext={goNextOrSubmit}
            />
          ) : (
            <ReviewStep
              title="계좌 확인"
              items={[
                { label: '은행', value: bankName },
                { label: '계좌번호', value: accountNumber },
                { label: '예금주', value: accountHolder },
              ]}
              onNext={goNextOrSubmit}
            />
          )
        )}

        {mode === 'signup_work' && (
          missingFields.includes('work') ? (
            <WorkStep
              defaultWage={defaultWage} setDefaultWage={setDefaultWage}
              skillGrade={skillGrade} setSkillGrade={setSkillGrade}
              defaultTrade={defaultTrade} setDefaultTrade={setDefaultTrade}
              tradeCustom={tradeCustom} setTradeCustom={setTradeCustom}
              trades={trades}
              valid={wageValid && skillGrade.length > 0 && defaultTrade.trim().length > 0}
              onNext={goNextOrSubmit}
            />
          ) : (
            <ReviewStep
              title="직무 · 일당 확인"
              items={[
                { label: '구분', value: skillGrade },
                { label: '공종', value: defaultTrade },
                { label: '기본 일당', value: defaultWage ? `${Number(defaultWage).toLocaleString()}원` : null },
              ]}
              onNext={goNextOrSubmit}
              isLast
            />
          )
        )}

      </div>
    </MobileShell>
  );
}

function ConsentStep({
  consentPersonal, setConsentPersonal,
  consentRrn, setConsentRrn,
  consentLocation, setConsentLocation,
  consentForeignId, setConsentForeignId,
  consentThirdParty, setConsentThirdParty,
  onNext,
}: {
  consentPersonal: boolean;
  setConsentPersonal: (v: boolean) => void;
  consentRrn: boolean;
  setConsentRrn: (v: boolean) => void;
  consentLocation: boolean;
  setConsentLocation: (v: boolean) => void;
  consentForeignId: boolean;
  setConsentForeignId: (v: boolean) => void;
  consentThirdParty: boolean;
  setConsentThirdParty: (v: boolean) => void;
  onNext: () => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const allRequired = consentPersonal && consentRrn && consentLocation && consentForeignId;
  const allChecked = allRequired && consentThirdParty;
  const valid = consentPersonal && consentRrn && consentLocation; // 외국인 동의는 가입 마지막에 RPC가 강제

  const setAll = (v: boolean) => {
    setConsentPersonal(v);
    setConsentRrn(v);
    setConsentLocation(v);
    setConsentForeignId(v);
    setConsentThirdParty(v);
  };

  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        서비스 이용을<br />위해 동의해주세요
      </h1>
      <p className="mt-4 text-sm text-zinc-500">노임대장 작성·임금 지급을 위한 동의입니다.</p>

      <div className="mt-8">
        <ConsentRow
          label="모두 동의합니다"
          checked={allChecked}
          onToggle={() => setAll(!allChecked)}
          emphasis
        />
        <div className="my-3 h-px bg-zinc-100" />

        <ConsentItem
          openKey="personal" openCurrent={openKey} setOpen={setOpenKey}
          label="(필수) 개인정보 수집·이용 동의"
          checked={consentPersonal} onToggle={() => setConsentPersonal(!consentPersonal)}
          body={
            <>
              <p><b>수집 항목:</b> 이름, 전화번호, 주소, 계좌정보, 일당, 공종, 등급</p>
              <p><b>이용 목적:</b> 출역 관리, 임금 지급, 노임대장 작성</p>
              <p><b>보유 기간:</b> 퇴직 후 5년 (근로기준법 제42조)</p>
              <p className="text-zinc-500">동의를 거부할 권리가 있으나, 거부 시 서비스 이용이 제한됩니다.</p>
            </>
          }
        />

        <ConsentItem
          openKey="rrn" openCurrent={openKey} setOpen={setOpenKey}
          label="(필수) 주민등록번호 수집·이용 동의"
          checked={consentRrn} onToggle={() => setConsentRrn(!consentRrn)}
          body={
            <>
              <p><b>수집 항목:</b> 주민등록번호</p>
              <p><b>수집 근거:</b> 소득세법 제145조, 근로기준법 제48조</p>
              <p><b>이용 목적:</b> 노임대장 작성, 원천세 신고</p>
              <p><b>보유 기간:</b> 퇴직 후 5년</p>
              <p className="text-zinc-500">개인정보보호법 제24조의2에 따라 별도 동의를 받습니다.</p>
            </>
          }
        />

        <ConsentItem
          openKey="location" openCurrent={openKey} setOpen={setOpenKey}
          label="(필수) 위치정보 수집·이용 동의"
          checked={consentLocation} onToggle={() => setConsentLocation(!consentLocation)}
          body={
            <>
              <p><b>수집 항목:</b> GPS 좌표(위도·경도)</p>
              <p><b>이용 목적:</b> 현장 출역(도착) 자동 확인, 현장 이탈 여부 검증</p>
              <p><b>수집 시점:</b> 근무시간 중 주기적 수집 (앱 백그라운드·종료 시 포함)</p>
              <p><b>보유 기간:</b> 수집 후 5일 뒤 자동 삭제, 제3자 제공 없음</p>
              <p className="text-zinc-500">동의를 거부해도 출역 등록은 가능하나, 위치 자동 확인이 제한됩니다.</p>
            </>
          }
        />

        <ConsentItem
          openKey="foreign" openCurrent={openKey} setOpen={setOpenKey}
          label="(외국인 필수) 외국인등록번호 수집·이용 동의"
          checked={consentForeignId} onToggle={() => setConsentForeignId(!consentForeignId)}
          body={
            <>
              <p><b>수집 항목:</b> 외국인등록번호, 국적, 비자종류</p>
              <p><b>수집 근거:</b> 외국인근로자의 고용 등에 관한 법률</p>
              <p><b>이용 목적:</b> 외국인 노임대장 작성, 고용 신고</p>
              <p><b>보유 기간:</b> 퇴직 후 5년</p>
              <p className="text-zinc-500">외국인이신 경우에만 적용됩니다. 내국인은 영향 없습니다.</p>
            </>
          }
        />

        <ConsentItem
          openKey="third" openCurrent={openKey} setOpen={setOpenKey}
          label="(선택) 노임대장 제3자 제공 동의"
          checked={consentThirdParty} onToggle={() => setConsentThirdParty(!consentThirdParty)}
          body={
            <>
              <p><b>제공받는 자:</b> 발주처, 원청사, 고용노동부, 국세청</p>
              <p><b>제공 항목:</b> 노임대장에 포함된 개인정보</p>
              <p><b>제공 목적:</b> 공사 보고, 법정 신고</p>
              <p className="text-zinc-500">동의하지 않아도 가입은 가능합니다.</p>
            </>
          }
        />
      </div>

      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function ConsentRow({
  label, checked, onToggle, emphasis,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <span
        className={
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ' +
          (checked ? 'bg-navy text-white' : 'bg-zinc-200 text-zinc-400')
        }
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
      <span className={'flex-1 ' + (emphasis ? 'text-lg font-bold text-zinc-900' : 'text-base font-semibold text-zinc-800')}>
        {label}
      </span>
    </button>
  );
}

function ConsentItem({
  openKey, openCurrent, setOpen,
  label, checked, onToggle, body,
}: {
  openKey: string;
  openCurrent: string | null;
  setOpen: (k: string | null) => void;
  label: string;
  checked: boolean;
  onToggle: () => void;
  body: React.ReactNode;
}) {
  const isOpen = openCurrent === openKey;
  return (
    <div>
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span
            className={
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ' +
              (checked ? 'bg-navy text-white' : 'bg-zinc-200 text-zinc-400')
            }
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span className="text-sm font-semibold text-zinc-800">{label}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(isOpen ? null : openKey)}
          className="inline-flex h-8 w-8 items-center justify-center text-zinc-400"
          aria-label="약관 보기"
        >
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {isOpen && (
        <div className="mb-2 ml-9 space-y-1 rounded-[5px] bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700">
          {body}
        </div>
      )}
    </div>
  );
}

function ProgressDots({ mode, flow }: { mode: Mode; flow: Mode[] }) {
  if (mode === 'phone') return <span />;
  if (mode === 'login_pin') {
    return (
      <div className="flex gap-2">
        <span className="h-2 w-7 rounded-full bg-navy" />
        <span className="h-2 w-7 rounded-full bg-navy" />
      </div>
    );
  }
  const current = flow.indexOf(mode);
  const total = flow.length;
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={'h-2 w-4 rounded-full ' + (i <= current ? 'bg-navy' : 'bg-zinc-200')}
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
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[5px] bg-navy text-white">
          <Hammer className="h-6 w-6" />
        </span>
        <span className="text-2xl font-bold text-zinc-900">(주)예성건축</span>
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
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[36px] font-bold tracking-wide text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
        />
      </div>
      {error && <p className="mt-4 text-base font-semibold text-red-800">{error}</p>}
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function PinStep({
  title, subtitle, value, onChange, onNext, disabledNext, errorMessage,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onNext?: () => void;
  disabledNext?: boolean;
  errorMessage?: string;
}) {
  return (
    <>
      {/* 가운데 정렬: 타이틀 → 4칸 점 → 안내문구. input은 영역 위에 투명하게 겹쳐 OS 숫자 키보드 호출 */}
      <div className="relative flex flex-col items-center pt-24">
        <h1 className="text-2xl font-bold text-zinc-900 text-center">{title}</h1>
        <div className="mt-7 flex items-center justify-center gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={'h-4 w-4 rounded-full transition ' + (i < value.length ? 'bg-navy scale-110' : 'bg-zinc-200')}
            />
          ))}
        </div>
        {errorMessage ? (
          <p className="mt-5 text-center text-base font-semibold text-red-700">{errorMessage}</p>
        ) : subtitle ? (
          <p className="mt-5 text-center text-base text-zinc-400">{subtitle}</p>
        ) : null}
        <input
          type="password"
          inputMode="numeric"
          value={value}
          maxLength={4}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          autoFocus
          aria-label="비밀번호 입력"
          className="absolute inset-0 h-full w-full opacity-0 outline-none"
        />
      </div>
      {onNext && <NextButton valid={!disabledNext} onNext={onNext} label="다음" />}
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
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
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
  isForeign, rrn, setRrn, valid, onNext, isLast,
}: {
  isForeign: boolean;
  rrn: string;
  setRrn: (v: string) => void;
  valid: boolean;
  onNext: () => void;
  isLast?: boolean;
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
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-[28px] font-bold tracking-wide text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
        />
      </div>
      <NextButton valid={valid} onNext={onNext} label={isLast ? '가입 완료' : '다음'} />
    </>
  );
}

function LeaderStep({
  teamLeaders, teamLeaderId, setTeamLeaderId, onNext, isLast,
}: {
  teamLeaders: { id: string; name: string }[];
  teamLeaderId: string;
  setTeamLeaderId: (v: string) => void;
  onNext: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <h1 className="mt-8 text-[36px] font-bold leading-tight text-zinc-900">
        소속 팀장을<br />선택해주세요
      </h1>
      <p className="mt-4 text-sm text-zinc-500">팀장에 따라 현장·전문건설사가 자동 설정됩니다.</p>
      <div className="mt-8 grid grid-cols-3 gap-3 overflow-y-auto">
        {teamLeaders.length === 0 ? (
          <p className="col-span-3 text-zinc-400">등록된 팀장이 없습니다. 관리자에게 문의하세요.</p>
        ) : (
          teamLeaders.map((tl) => (
            <button
              key={tl.id}
              type="button"
              onClick={() => setTeamLeaderId(tl.id)}
              className={
                'relative flex aspect-square flex-col items-center justify-center rounded-[5px] px-2 text-center text-base font-bold leading-tight ring-2 transition break-keep ' +
                (teamLeaderId === tl.id ? 'bg-navy text-white ring-navy' : 'bg-white text-zinc-700 ring-zinc-200')
              }
            >
              <span className="line-clamp-2">{tl.name}</span>
              {teamLeaderId === tl.id && <Check className="absolute right-1.5 top-1.5 h-4 w-4" />}
            </button>
          ))
        )}
      </div>
      <NextButton valid={!!teamLeaderId} onNext={onNext} label={isLast ? '가입 완료' : '다음'} />
    </>
  );
}

function ForeignStep({
  nameEnglish, setNameEnglish,
  nationality, setNationality,
  visaStatus, setVisaStatus,
  onNext,
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
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
          />
        </Field>
        <Field label="국적">
          <input
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            placeholder="중국 / 미얀마 / 베트남 등"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
          />
        </Field>
        <Field label="비자 종류">
          <input
            value={visaStatus}
            onChange={(e) => setVisaStatus(e.target.value)}
            placeholder="F-4 / E-9 / H-2 등"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
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
          className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300 resize-none"
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
                className="flex-1 border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
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
              className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-navy outline-none"
            >
              <option value="">선택하세요</option>
              {KOREAN_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
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
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold tracking-wider text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
          />
        </Field>
        <Field label="예금주">
          <input
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="홍길동"
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
          />
        </Field>
      </div>
      <NextButton valid={valid} onNext={onNext} label="다음" />
    </>
  );
}

function WorkStep({
  defaultWage, setDefaultWage,
  skillGrade, setSkillGrade,
  defaultTrade, setDefaultTrade, tradeCustom, setTradeCustom, trades,
  valid, onNext,
}: {
  defaultWage: string;
  setDefaultWage: (v: string) => void;
  skillGrade: string;
  setSkillGrade: (v: string) => void;
  defaultTrade: string;
  setDefaultTrade: (v: string) => void;
  tradeCustom: boolean;
  setTradeCustom: (v: boolean) => void;
  trades: string[];
  valid: boolean;
  onNext: () => void;
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
            className="mt-2 w-full border-b-[3px] border-zinc-200 bg-transparent pb-3 text-2xl font-bold tabular-nums text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
          />
          {defaultWage && /^\d+$/.test(defaultWage) && (
            <p className="mt-1 text-sm text-zinc-500">{Number(defaultWage).toLocaleString()}원</p>
          )}
        </Field>
        <Field label="구분">
          <select
            value={skillGrade}
            onChange={(e) => setSkillGrade(e.target.value)}
            className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-navy outline-none"
          >
            <option value="">선택하세요</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="공종">
          {tradeCustom ? (
            <div className="mt-2 flex gap-2">
              <input
                value={defaultTrade}
                onChange={(e) => setDefaultTrade(e.target.value)}
                placeholder="공종 직접 입력"
                autoFocus
                className="flex-1 border-b-[3px] border-zinc-200 bg-transparent pb-3 text-xl font-bold text-zinc-900 outline-none focus:border-navy placeholder:text-zinc-300"
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
              className="mt-2 w-full rounded-[5px] bg-white px-5 py-4 text-lg font-bold text-zinc-900 ring-2 ring-zinc-200 focus:ring-navy outline-none"
            >
              <option value="">선택하세요</option>
              {trades.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="__custom__">직접 입력...</option>
            </select>
          )}
        </Field>
      </div>
      <NextButton valid={valid} onNext={onNext} label="가입 완료" />
    </>
  );
}

function ReviewStep({
  title,
  items,
  onNext,
  isLast,
}: {
  title: string;
  items: { label: string; value: string | null }[];
  onNext: () => void;
  isLast?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-sm text-[#6B7280]">이미 등록된 정보입니다. 확인 후 다음을 눌러주세요.</p>
      </div>
      <div className="rounded-[8px] border border-[#D7D7D7] bg-[#F5F5F5] p-4">
        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it.label} className="flex items-start justify-between gap-3 text-sm">
              <span className="shrink-0 text-[#6B7280]">{it.label}</span>
              <span className="text-right text-[#091413]">{it.value && it.value.trim() !== '' ? it.value : '-'}</span>
            </div>
          ))}
        </div>
      </div>
      <NextButton valid={true} onNext={onNext} label={isLast ? '가입 완료' : '다음'} />
    </div>
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
          (valid ? 'bg-red-800 text-white active:scale-[0.98]' : 'bg-zinc-100 text-zinc-400')
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
        (selected ? 'bg-navy text-white ring-navy' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-400')
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
