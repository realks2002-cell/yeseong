type Service = {
  title: string;
  description: string;
  image: string;
  imgClass?: string;
};

const SERVICES: Service[] = [
  {
    title: '방수공사',
    description: '공동특허 기반 방수 공법으로 누수 걱정 없는 시공을 제공합니다.',
    image: '/1.png',
  },
  {
    title: '도장공사',
    description: '외장·내장 전문 도장으로 마감 품질을 극대화합니다.',
    image: '/2.png',
  },
  {
    title: '습식공사',
    description: '타일·미장·조적 등 습식 마감 전문 시공을 수행합니다.',
    image: '/3.png',
  },
  {
    title: '공동특허 기술',
    description: '포스코·현대·CJ와 공동 개발한 방수공법을 보유하고 있습니다.',
    image: '/4.png',
  },
  {
    title: '책임 품질관리',
    description: '엄격한 시공관리와 책임시공으로 최고의 만족을 드립니다.',
    image: '/5.png',
  },
  {
    title: '지속 성장',
    description: '2024년 창사 이래 꾸준한 기술 연구와 시공 실적을 확장하고 있습니다.',
    image: '/16.png',
  },
];

export function ServicesGrid() {
  return (
    <section id="services" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">
            전문 시공 영역
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            현장이 검증한 시공 전문성
          </h2>
          <p className="mt-4 text-base text-zinc-600 md:text-lg">
            방수·도장·습식 전문 분야에서 축적한 노하우로 최상의 결과를 약속드립니다.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <article
              key={service.title}
              className="group overflow-hidden rounded-[5px] border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-zinc-100">
                <img
                  src={service.image}
                  alt={service.title}
                  className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${service.imgClass ?? ''}`}
                />
              </div>
              <div className="px-6 pb-7 pt-6">
                <h3 className="text-lg font-bold text-zinc-900">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {service.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
