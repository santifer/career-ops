'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, Key, Mail, ArrowRight, Github, Loader2, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const isVerified = searchParams.get('verified') === 'true';
  const authError = searchParams.get('error');
  const autoGithub = searchParams.get('autogithub') === '1';
  const githubCallbackUrl = '/?walkthrough=1';
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoGithubStarted = useRef(false);

  const oauthErrorMessage =
    authError === 'github-email-missing'
      ? 'GitHub did not provide an email. Use a GitHub account with a verified public email.'
      : authError === 'github-auth-failed'
        ? 'GitHub sign-in failed. Please try again.'
        : null;

  useEffect(() => {
    if (!autoGithub || autoGithubStarted.current) return;
    autoGithubStarted.current = true;
    signIn('github', { callbackUrl: githubCallbackUrl });
  }, [autoGithub]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        if (result.error.includes("verify your email")) {
           router.push(`/verify?email=${encodeURIComponent(email)}`);
           return;
        }
        setError("Invalid credentials or access denied.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background Glows: Subtle warm tones */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#f59e0b]/5 rounded-full blur-[150px]" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 bg-[#1c1917] rounded-2xl shadow-xl mb-6">
            <Briefcase className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Welcome Back</h1>
          <p className="text-[#a8a29e] font-medium">Access your AI career command center</p>
        </div>

        {isVerified && !autoGithub && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 text-sm font-bold">
            <CheckCircle2 size={18} />
            Email verified successfully. You can now log in.
          </div>
        )}

        {autoGithub && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 text-sm font-bold">
            <Loader2 size={18} className="animate-spin" />
            Email verified. Redirecting to GitHub sign-in...
          </div>
        )}

        <div className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 shadow-2xl shadow-black/[0.02]">
          {oauthErrorMessage && (
            <div className="mb-6 flex items-center gap-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold">
              <AlertCircle size={14} />
              {oauthErrorMessage}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] group-focus-within:text-[#1c1917] transition-colors" size={18} />
                <input
                  name="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Password</label>
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] group-focus-within:text-[#1c1917] transition-colors" size={18} />
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
                />
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#1c1917] text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                <>
                  Sign In
                  <ArrowRight size={20} className="text-white/40" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-4 text-[#e7e5e4]">
             <div className="h-px w-full bg-[#e7e5e4]" />
             <span className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] whitespace-nowrap">Third Party</span>
             <div className="h-px w-full bg-[#e7e5e4]" />
          </div>

          <button 
            type="button"
            onClick={() => signIn('github', { callbackUrl: githubCallbackUrl })}
            className="w-full mt-6 bg-white border border-[#e7e5e4] text-[#1c1917] font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#faf9f6] transition-all"
          >
            <Github size={20} />
            Continue with GitHub
          </button>
        </div>

        <p className="mt-10 text-center text-[#a8a29e] text-sm font-medium">
          New to Career-Ops?{' '}
          <Link href="/signup" className="text-[#1c1917] font-bold hover:underline underline-offset-4 decoration-[#e7e5e4]">
            Create Account
          </Link>
        </p>

        <div className="mt-12 flex items-center justify-center gap-3 text-[#e7e5e4]">
           <Shield size={16} />
           <span className="text-[9px] font-bold uppercase tracking-[0.25em]">Secure Auth v2.0-modern</span>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf9f6] flex items-center justify-center"><Loader2 className="animate-spin text-[#1c1917]" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
