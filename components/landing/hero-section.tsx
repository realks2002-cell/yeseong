
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-brand-dark text-brand-dark-foreground">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/landing/hero.png')" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-6 py-[8.05rem] md:py-[11.5rem]">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-sky-300 px-4 py-1.5 text-sm font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
            방수·도장·습식 전문
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            신뢰할 수 있는
            <br />
            방수·습식 전문 건축 파트너
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
            포스코건설·현대엔지니어링·CJ건설과 공동특허를 출원한 검증된 기술력으로
            <br className="hidden md:block" />
            고품질 책임시공을 약속합니다.
          </p>
        </div>
      </div>
    </section>
  );
}
