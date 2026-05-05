'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const provider = searchParams.get('provider') || '';
  
  const [token, setToken] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!email) {
      router.push('/signup');
    }
  }, [email, router]);

  const handleInput = (index: number, value: string) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;

    const newToken = [...token];
    newToken[index] = value;
    
    setToken(newToken);

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !token[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (!/^\d+$/.test(pastedData)) return;

    const digits = pastedData.slice(0, 6).split('');
    const newToken = [...token];
    digits.forEach((digit, index) => {
      if (index < 6) newToken[index] = digit;
    });
    setToken(newToken);
    
    // Focus the appropriate input after paste
    const focusIndex = Math.min(digits.length, 5);
    const targetInput = document.getElementById(`otp-${focusIndex}`);
    targetInput?.focus();
  };

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalToken = token.join('');
    if (finalToken.length < 6) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: finalToken })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setIsSuccess(true);
      setTimeout(() => {
        if (provider === 'github') {
          router.push('/auth/continue?provider=github&callbackUrl=%2F%3Fwalkthrough%3D1');
          return;
        }
        router.push(`/auth/continue?provider=credentials&email=${encodeURIComponent(email)}&callbackUrl=%2F%3Fwalkthrough%3D1`);
      }, 2000);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  }, [email, provider, router, token]);

  const handleResend = async () => {
    if (!email || resendCooldown > 0 || isLoading) return;

    setError(null);
    try {
      const res = await fetch('/api/verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to resend verification code');
      setResendCooldown(30);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification code');
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (token.every(t => t !== '')) {
      handleSubmit();
    }
  }, [token, handleSubmit]);

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#f59e0b]/5 rounded-full blur-[150px]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-[#1c1917] rounded-2xl shadow-xl mb-6">
            <Mail className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Check your email</h1>
          <p className="text-[#a8a29e] font-medium text-sm">We&apos;ve sent a 6-digit code to <span className="text-[#1c1917] font-bold">{email}</span></p>
        </div>

        <div className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 shadow-2xl shadow-black/[0.02] relative overflow-hidden">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-10"
              >
                <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Email Verified</h2>
                <p className="text-[#a8a29e] mb-4 font-medium">Account activated. Redirecting...</p>
              </motion.div>
            ) : (
              <motion.div key="form">
                <div className="flex justify-between gap-3 mb-10">
                  {token.map((digit, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleInput(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      autoFocus={i === 0}
                      className="w-12 h-16 bg-[#faf9f6] border border-[#e7e5e4] rounded-2xl text-center text-2xl font-bold focus:border-[#1c1917] outline-none transition-all shadow-inner"
                    />
                  ))}
                </div>

                {error && (
                  <div className="text-rose-600 text-xs font-bold text-center bg-rose-50 py-3 rounded-2xl border border-rose-100 mb-8">
                    {error}
                  </div>
                )}

                <button 
                  onClick={() => handleSubmit()}
                  disabled={isLoading || token.some(t => !t)}
                  className="w-full bg-[#1c1917] text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                    <>
                      Verify Identity
                      <ArrowRight size={20} className="text-white/40" />
                    </>
                  )}
                </button>

                <div className="mt-8 text-center">
                  <button 
                    disabled={resendCooldown > 0}
                    onClick={handleResend}
                    className="text-[#a8a29e] text-[10px] font-bold uppercase tracking-widest hover:text-[#1c1917] transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <RefreshCw size={12} className={resendCooldown > 0 ? 'animate-spin' : ''} />
                    {resendCooldown > 0 ? `Retry in ${resendCooldown}s` : 'Resend Identity Code'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-10 text-center text-[#a8a29e] text-sm font-medium">
          Wrong email address?{' '}
          <Link href="/signup" className="text-[#1c1917] font-bold hover:underline underline-offset-4 decoration-[#e7e5e4]">
            Back to Registry
          </Link>
        </p>

        <div className="mt-12 flex items-center justify-center gap-3 text-[#e7e5e4]">
           <ShieldCheck size={16} />
           <span className="text-[9px] font-bold uppercase tracking-[0.25em]">SaaS Identity v2.0-modern</span>
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf9f6] flex items-center justify-center"><Loader2 className="animate-spin text-[#1c1917]" /></div>}>
      <VerifyContent />
    </Suspense>
  );
}
