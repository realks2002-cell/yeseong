import { Award } from 'lucide-react';

const PARTNERS = [
  { name: '포스코건설', logo: '/landing/partners/posco.svg' },
  { name: '현대엔지니어링', logo: '/landing/partners/hde.svg' },
  { name: 'CJ건설', logo: '/landing/partners/cj.svg' },
];

export function PartnersShowcase() {
  return (
    <section id="partners" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
            <Award className="h-3.5 w-3.5" />
            공동특허 출원
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            검증된 신뢰, 함께한 파트너
          </h2>
          <p className="mt-4 text-base text-zinc-600 md:text-lg">
            주요 건설사와 공동 방수공법을 개발하고 공동특허를 출원했습니다.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {PARTNERS.map((partner) => (
            <div
              key={partner.name}
              className="flex h-32 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-8 transition-all hover:border-zinc-300 hover:bg-white hover:shadow-md"
            >
              <img
                src={partner.logo}
                alt={partner.name}
                className="h-12 w-auto opacity-80 transition-opacity hover:opacity-100"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
