export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-8 py-10 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">PBC Quote Calculator</h1>
          <p className="mt-1 text-sm text-gray-500">사내 견적 자동화 도구</p>
        </div>

        <form className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-700 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          로그인 기능 구현 예정 — 페이지 준비 중
        </p>
      </div>
    </div>
  )
}
