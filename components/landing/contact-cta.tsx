import { ArrowRight, Mail, Phone } from 'lucide-react';

const CONTACT_PHONE = '031-8043-6927';
const CONTACT_EMAIL = 'hans@wtop.co.kr';

export function ContactCTA() {
  return (
    <section id="contact" className="bg-zinc-50 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold leading-snug tracking-tight text-zinc-900 md:text-4xl">
            검증된 시공으로 신뢰받는 건축 파트너,
            <br className="hidden md:block" />
            (주)예성건축과 함께하세요.
          </h2>
        </div>

        <div className="relative mt-10 overflow-hidden rounded-[5px] text-white shadow-xl md:mt-12">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/14.png')" }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-black/30" aria-hidden />

          <div className="relative px-8 py-16 text-center md:px-16 md:py-20">
            <p className="text-[1.365rem] text-white md:text-[1.56rem]">
              방수·도장·습식 시공 견적을 빠르고 정확하게 안내해드립니다.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={`tel:${CONTACT_PHONE.replace(/-/g, '')}`}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-zinc-900 transition-all hover:bg-zinc-100"
              >
                <Phone className="h-4 w-4" />
                <span>{CONTACT_PHONE}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <div className="inline-flex cursor-default items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur">
                <Mail className="h-4 w-4" />
                <span>{CONTACT_EMAIL}</span>
              </div>
            </div>

            <p className="mt-8 text-[1.17rem] text-white">
              평일 09:00 - 18:00 / 점심시간 12:00 - 13:00
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
