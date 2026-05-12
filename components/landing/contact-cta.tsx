import { Mail, Phone } from 'lucide-react';

// TODO: 운영 전 실제 연락처로 교체
const CONTACT_PHONE = '031-000-0000';
const CONTACT_EMAIL = 'contact@yeseong.co.kr';

export function ContactCTA() {
  return (
    <section id="contact" className="relative overflow-hidden bg-brand-dark text-brand-dark-foreground">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: "url('/landing/cta-bg.jpg')" }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-brand-dark/50 via-brand-dark/45 to-brand-dark/35"
        aria-hidden
      />

      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center md:py-32">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">
          프로젝트 시작 준비되셨나요?
        </h2>
        <p className="mt-5 text-base text-white/75 md:text-lg">
          방수·도장·습식 시공 견적을 빠르게 안내해드립니다.
        </p>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href={`tel:${CONTACT_PHONE.replace(/-/g, '')}`}
            className="group flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-8 py-5 transition-all hover:border-brand/60 hover:bg-white/10"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <Phone className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-xs font-medium uppercase tracking-wider text-white/60">
                전화 문의
              </span>
              <span className="mt-0.5 block text-xl font-bold text-white md:text-2xl">
                {CONTACT_PHONE}
              </span>
            </span>
          </a>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="group flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-8 py-5 transition-all hover:border-brand/60 hover:bg-white/10"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <Mail className="h-5 w-5" />
            </span>
            <span className="text-left">
              <span className="block text-xs font-medium uppercase tracking-wider text-white/60">
                이메일 문의
              </span>
              <span className="mt-0.5 block text-lg font-bold text-white md:text-xl">
                {CONTACT_EMAIL}
              </span>
            </span>
          </a>
        </div>

        <p className="mt-10 text-xs text-white/50">
          평일 09:00 - 18:00 / 점심시간 12:00 - 13:00
        </p>
      </div>
    </section>
  );
}
