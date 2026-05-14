export function LandingFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-6 w-1 rounded-sm bg-brand" aria-hidden />
            <span className="text-base font-bold text-white">(주)예성건축</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed">
            녹색성장을 추구하는 건축 파트너.
            <br />
            방수·도장·습식 전문 시공.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">사업자 정보</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>법인명: 주식회사 (주)예성건축</li>
            <li>법인등록번호: 164911-0041303</li>
            <li>주소: 경기도 화성시 동탄영천로 150, A동 1135호(영천동)</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">연락</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>전화: 031-8043-6927</li>
            <li>이메일: hans@wtop.co.kr</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-800 px-6 py-5">
        <p className="mx-auto max-w-6xl text-center text-xs text-zinc-500">
          © 2026 (주)예성건축. All Rights Reserved.
        </p>
      </div>
    </footer>
  );
}
