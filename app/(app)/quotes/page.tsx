export default function QuotesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">PBC Quote Calculator</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-6">
          <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-3">페이지 준비 중</h2>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          견적 목록 화면을 구현 중입니다. 곧 사용 가능합니다.
        </p>
      </main>
    </div>
  )
}
