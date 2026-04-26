'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, Mail, Shield } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send reset code');
        return;
      }
      setMessage('Reset code sent. Redirecting...');
      setTimeout(() => {
        router.push(`/reset-password?email=${encodeURIComponent(email)}`);
      }, 900);
    } catch {
      setError('Unexpected error while sending reset code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 shadow-2xl shadow-black/[0.02]">
        <div className="inline-flex items-center justify-center h-14 w-14 bg-[#1c1917] rounded-2xl shadow-xl mb-6">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Forgot Password</h1>
        <p className="text-[#78716c] font-medium mb-8">Use OTP only when resetting your password.</p>

        <button
          type="button"
          onClick={() => router.push('/login')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-[#78716c] hover:text-[#1c1917]"
        >
          <ArrowLeft size={16} />
          Back to login
        </button>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e]" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
              />
            </div>
          </div>

          {error && <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl p-3">{error}</p>}
          {message && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl p-3">{message}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#1c1917] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <>Send OTP <ArrowRight size={18} className="text-white/50" /></>}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#a8a29e] font-medium">
          Remembered it?{' '}
          <Link href="/login" className="text-[#1c1917] font-bold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
