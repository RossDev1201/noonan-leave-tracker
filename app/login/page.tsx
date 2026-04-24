"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { ThemeToggle } from "@/app/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (!result?.ok) { setError("Invalid username or password."); return; }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-noonan-cream px-4 dark:bg-black">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8">
          <img src="/noonan-logo-red.svg" alt="Noonan Real Estate Agency" className="h-16 w-auto dark:hidden" />
          <img src="/noonan-logo-white.svg" alt="Noonan Real Estate Agency" className="h-16 w-auto hidden dark:block" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[3px] text-noonan-gray dark:text-noonan-warmgray">
            Leave &amp; Invoice Tracker
          </p>
        </div>

        {/* Card */}
        <div className="border border-noonan-lightgray bg-white px-8 py-8 dark:border-[#333] dark:bg-[#111]">
          {/* Red accent bar */}
          <div className="mb-6 h-1 w-12 bg-noonan-red" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-noonan-gray dark:text-noonan-warmgray">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-noonan-lightgray bg-noonan-cream px-3 py-2.5 text-sm text-black outline-none transition focus:border-noonan-red dark:border-[#333] dark:bg-[#0a0a0a] dark:text-noonan-cream dark:focus:border-noonan-red"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-noonan-gray dark:text-noonan-warmgray">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-noonan-lightgray bg-noonan-cream px-3 py-2.5 pr-10 text-sm text-black outline-none transition focus:border-noonan-red dark:border-[#333] dark:bg-[#0a0a0a] dark:text-noonan-cream dark:focus:border-noonan-red"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-noonan-gray hover:text-black dark:text-noonan-warmgray dark:hover:text-noonan-cream"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="border border-noonan-red/30 bg-noonan-red/10 px-3 py-2.5 text-xs font-medium text-noonan-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 bg-noonan-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-noonan-red-dark disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-widest text-noonan-gray dark:text-noonan-warmgray">
          Noonan Internal Portal &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
