import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">PBC Quote Calculator</h1>
          <p className="mt-1 text-sm text-gray-500">Internal quote automation tool</p>
        </div>

        <LoginForm />
      </div>
    </div>
  )
}
