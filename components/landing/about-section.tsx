import { FileText, Leaf } from 'lucide-react';

export function AboutSection() {
  return (
    <section id="about" className="bg-zinc-50 py-[3.15rem] md:py-[4.41rem]">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center md:gap-16">
        <div>
          <span className="inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">
            About Us
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            함께 만들어가는 더 나은 미래
          </h2>

          <div className="mt-6 space-y-5 text-base leading-relaxed text-zinc-700">
            <p>
              (주)예성건축은 2024년 창사 이래, 습식공사 및 도장공사 전문분야를 주력으로 꾸준히
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

            <div className="mt-5 flex justify-center">
              <a
                href="/(주)예성건축지명원_26.01.27.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-[0.4rem] rounded-full bg-blue-800 px-[1.2rem] py-[0.6rem] text-xs font-bold text-white transition-all hover:bg-blue-900"
              >
                <FileText className="h-[0.8rem] w-[0.8rem]" />
                회사소개서
              </a>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="mx-auto aspect-[4/5] w-[88%] overflow-hidden rounded-[5px] bg-zinc-200 shadow-xl">
            <img
              src="/10.png"
              alt="(주)예성건축 임직원과 사업장"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
