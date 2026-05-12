import { Leaf } from 'lucide-react';

export function AboutSection() {
  return (
    <section id="about" className="bg-zinc-50 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center md:gap-16">
        <div>
          <span className="inline-block rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
            About Us
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            함께 만들어가는 더 나은 미래
          </h2>

          <div className="mt-6 space-y-5 text-base leading-relaxed text-zinc-700">
            <p>
              예성건설은 2024년 창사 이래, 습식공사 및 도장공사 전문분야를 주력으로 꾸준히
              성장해왔습니다. 포스코건설·현대엔지니어링·CJ건설과 함께 방수공법을 공동 개발하여
              공동특허를 출원하였으며, 지속적인 연구를 통해 방수·습식 공사 개발에 크게 이바지하고
              있습니다.
            </p>
            <p>
              앞으로도 국내외 어려운 시장 환경 속에서도, 고품질 책임 시공과 우수한 품질 서비스,
              탁월한 시공관리 능력을 바탕으로 최고의 만족을 드리도록 임직원이 혼연일체가 되어
              업무에 매진하겠습니다.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-bold text-zinc-900">
                  누구나 살기 좋은 세상, 녹색성장을 추구하는 인류기업
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  현재에 안주하지 않고 더 나은 미래를 위해 끊임없이 발로 뛰는 기업으로, 노력을
                  주저하지 않고 지속할 것을 약속드립니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-zinc-200 shadow-xl">
            <img
              src="/landing/about.jpg"
              alt="예성건설 임직원과 사업장"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 -left-6 hidden rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-zinc-200 md:block">
            <p className="text-3xl font-bold text-brand">2024+</p>
            <p className="mt-1 text-sm font-medium text-zinc-600">창사 이래 지속 성장</p>
          </div>
        </div>
      </div>
    </section>
  );
}
