function Block({ className = '' }: { className?: string }) {
  return <div className={`pbc-skeleton ${className}`} />
}

export default function QuotesLoading() {
  return (
    <main aria-busy="true">
      <header className="pbc-topbar">
        <Block className="h-5 w-44" />
        <div className="pbc-topbar__right">
          <Block className="h-10 w-32" />
        </div>
      </header>
      <div className="pbc-page">
        <span className="sr-only">Loading...</span>
        <div className="pbc-pagehead">
          <Block className="h-9 w-52" />
          <Block className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="pbc-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="pbc-stat" key={index}>
              <Block className="h-3 w-24" />
              <Block className="h-8 w-20" />
              <Block className="h-3 w-16" />
            </div>
          ))}
        </div>
        {/* 실제 /quotes 는 전폭 listcard(검색바 + 헤더행 + 견적 행 목록) — 같은 구조를 예고해 CLS를 줄인다 */}
        <div className="pbc-listcard">
          <div className="pbc-listbar">
            <Block className="h-10 w-full max-w-md" />
            <Block className="h-10 w-40" />
          </div>
          <div className="px-4 pb-5">
            <Block className="h-4 w-32" />
            {Array.from({ length: 7 }).map((_, index) => (
              <Block key={index} className="mt-3 h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
