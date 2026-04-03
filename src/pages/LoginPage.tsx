import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authClient } from '../lib/auth-client';

const LoginPage = () => {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    return fromState && fromState !== '/login' ? fromState : '/dashboard';
  }, [location.state]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    const response = await authClient.signIn.email(
      {
        email,
        password,
      },
      {
        onError: (ctx) => {
          setError(ctx.error.message || 'Unable to sign in.');
        },
        onSuccess: () => {
          navigate(redirectPath, { replace: true });
        },
      },
    );

    setIsSubmitting(false);

    if (!response.error) {
      navigate(redirectPath, { replace: true });
    }
  };

  if (!isSessionPending && session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <section className="w-full max-w-117.5 rounded-2xl border border-(--color-primary)/20 bg-(--color-surface) p-8 shadow-[0_10px_30px_rgba(0,48,73,0.10)] sm:p-9">
        <header className="text-center">
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] leading-[1.1] font-semibold text-(--color-primary)">
            Welcome back
          </h1>
          <p className="mt-2 text-base font-normal text-(--color-primary)/70">
            Please enter your details.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-7 grid gap-4.5">
          <label className="grid gap-2.5 text-[1.08rem] font-normal text-(--color-primary)/90">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              className="w-full rounded-2xl border-2 border-(--color-primary)/20 bg-(--color-surface) px-4 py-3 text-base font-normal text-(--color-primary) outline-none placeholder:text-(--color-primary)/35 focus:border-(--color-primary)"
              required
            />
          </label>

          <label className="grid gap-2.5 text-[1.08rem] font-normal text-(--color-primary)/90">
            Password
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border-2 border-(--color-primary)/20 bg-(--color-surface) px-4 py-3 pr-12 text-base font-normal text-(--color-primary) outline-none placeholder:text-(--color-primary)/35 focus:border-(--color-primary)"
                required
                minLength={8}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-2 inline-flex items-center rounded-md px-2 text-(--color-primary)/65 hover:text-(--color-primary)"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <div className="mt-0.5 flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-base font-normal text-(--color-primary)/80">
              <input
                type="checkbox"
                className="size-5 appearance-none rounded-[7px] border border-(--color-primary)/30 bg-(--color-surface) checked:border-(--color-primary) checked:bg-(--color-primary)"
              />
              <span>Remember for 30 days</span>
            </label>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-base font-normal text-(--color-primary) underline-offset-2 hover:underline"
            >
              Forgot password
            </button>
          </div>

          {error ? <p className="mt-1.5 text-[0.92rem] text-(--color-primary)">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 cursor-pointer rounded-2xl border-none bg-(--color-primary) px-3.5 py-3.5 text-base font-semibold text-white transition hover:bg-(--color-primary)/90 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-7 text-center text-[1.02rem] font-normal text-(--color-primary)/80">
          Don&apos;t have an account? <span className="font-semibold">Sign up</span>
        </p>
      </section>
    </main>
  );
};

export default LoginPage;
