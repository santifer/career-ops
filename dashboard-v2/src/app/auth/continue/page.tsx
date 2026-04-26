'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Loader2, Shield } from 'lucide-react';

function AuthContinueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const provider = searchParams.get('provider') || 'credentials';
  const callbackUrl = searchParams.get('callbackUrl') || '/?walkthrough=1';
  const email = searchParams.get('email') || '';

  const hasStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualAction, setShowManualAction] = useState(false);

  const content = useMemo(() => {
    if (provider === 'github') {
      return {
        title: 'Email Verified',
        subtitle: 'Connecting your GitHub identity and preparing your dashboard.',
        buttonLabel: 'Continue with GitHub',
      };
    }
    return {
      title: 'Email Verified',
      subtitle: 'Redirecting to sign in so you can access your dashboard.',
      buttonLabel: 'Go to Sign In',
    };
  }, [provider]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const fallbackTimer = window.setTimeout(() => {
      setShowManualAction(true);
    }, 5000);

    const continueAuth = async () => {
      try {
        if (provider === 'github') {
          await signIn('github', { callbackUrl });
          return;
        }
        const rawPendingSignup = sessionStorage.getItem('career_ops_pending_signup');
        if (rawPendingSignup) {
          const pendingSignup = JSON.parse(rawPendingSignup) as { email?: string; password?: string; ts?: number };
          const isFresh = typeof pendingSignup.ts === 'number' && Date.now() - pendingSignup.ts < 15 * 60 * 1000;
          const emailMatches = email ? pendingSignup.email === email : Boolean(pendingSignup.email);

          if (pendingSignup.email && pendingSignup.password && isFresh && emailMatches) {
            const result = await signIn('credentials', {
              email: pendingSignup.email,
              password: pendingSignup.password,
              redirect: false,
            });

            if (!result?.error) {
              sessionStorage.removeItem('career_ops_pending_signup');
              router.replace(callbackUrl);
              return;
            }
          }
        }
        router.replace('/login?verified=true');
      } catch (e) {
        console.error('Auth continue error:', e);
        setError('We could not continue authentication automatically.');
        setShowManualAction(true);
      }
    };

    continueAuth();
    return () => window.clearTimeout(fallbackTimer);
  }, [provider, callbackUrl, router]);

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#f59e0b]/5 rounded-full blur-[150px]" />

      <div className="w-full max-w-md z-10">
        <div className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 shadow-2xl shadow-black/[0.02] text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-[#1c1917] rounded-2xl shadow-xl mb-6">
            <Shield className="h-7 w-7 text-white" />
          </div>

          <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-2">{content.title}</h1>
          <p className="text-[#78716c] font-medium mb-6">{content.subtitle}</p>

          <div className="inline-flex items-center gap-3 rounded-2xl bg-[#faf9f6] border border-[#e7e5e4] px-5 py-3 text-sm font-bold text-[#1c1917]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecting...
          </div>

          {error && (
            <p className="mt-5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl p-3">
              {error}
            </p>
          )}

          {showManualAction && (
            <button
              type="button"
              onClick={() => {
                if (provider === 'github') {
                  signIn('github', { callbackUrl });
                  return;
                }
                router.replace('/login?verified=true');
              }}
              className="w-full mt-6 bg-[#1c1917] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all shadow-xl active:scale-[0.98]"
            >
              {content.buttonLabel}
              <ArrowRight size={18} className="text-white/50" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthContinuePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf9f6] flex items-center justify-center"><Loader2 className="animate-spin text-[#1c1917]" /></div>}>
      <AuthContinueContent />
    </Suspense>
  );
}
