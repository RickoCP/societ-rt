export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-100 px-4 py-12 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950">
      {/* Decorative background blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/40 blur-3xl dark:bg-emerald-800/30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-teal-300/40 blur-3xl dark:bg-teal-800/30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-lime-200/30 blur-3xl dark:bg-emerald-900/20"
      />

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-3xl shadow-lg shadow-emerald-500/30">
            🏘️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            SocieT-RT
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Community Management Platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-emerald-900/5 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-900/80">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-600">
          © {new Date().getFullYear()} SocieT-RT · Kelola komunitas RT dengan mudah
        </p>
      </div>
    </div>
  );
}
