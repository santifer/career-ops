'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, User, Mail, Key, ArrowRight, Github, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setIsSuccess(true);
      // Redirect to verification page
      setTimeout(() => {
        router.push(`/verify?email=${encodeURIComponent(formData.email)}`);
      }, 2000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

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
            <Briefcase className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Initialize Account</h1>
          <p className="text-[#a8a29e] font-medium text-sm">Create your secure career command center</p>
        </div>

        <div className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 shadow-2xl shadow-black/[0.02] relative overflow-hidden">
          {isSuccess ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-10"
            >
              <div className="h-20 w-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <ShieldCheck className="h-10 w-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Identity Created</h2>
              <p className="text-[#a8a29e] mb-4 font-medium">Redirecting you to verify your email...</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Candidate Name</label>
                 <div className="relative group">
                   <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e] group-focus-within:text-[#1c1917] transition-colors" size={18} />
                   <input
                     name="name"
                     type="text"
                     value={formData.name}
                     onChange={(e) => setFormData({...formData, name: e.target.value})}
                     placeholder="John Doe"
                     required
                     className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
                   />
                 </div>
               </div>

               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Email Terminal</label>
                 <input
                   name="email"
                   type="email"
                   value={formData.email}
                   onChange={(e) => setFormData({...formData, email: e.target.value})}
                   placeholder="name@company.com"
                   required
                   className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 px-6 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
                 />
               </div>

               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-[0.2em] ml-1">Master Password</label>
                 <input
                   name="password"
                   type="password"
                   value={formData.password}
                   onChange={(e) => setFormData({...formData, password: e.target.value})}
                   placeholder="••••••••"
                   required
                   className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl py-4 px-6 outline-none focus:border-[#1c1917] transition-all font-bold placeholder:text-[#a8a29e]/50"
                 />
               </div>

               {error && (
                 <div className="flex items-center gap-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold">
                   <AlertCircle size={14} />
                   {error}
                 </div>
               )}

               <button 
                 type="submit"
                 disabled={isLoading}
                 className="w-full bg-[#1c1917] text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all shadow-xl disabled:opacity-50"
               >
                 {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                   <>
                     Create Account
                     <ArrowRight size={20} className="text-white/40" />
                   </>
                 )}
               </button>
            </form>
          )}
        </div>

        <p className="mt-10 text-center text-[#a8a29e] text-sm font-medium">
          Already have an account?{' '}
          <Link href="/login" className="text-[#1c1917] font-bold hover:underline underline-offset-4 decoration-[#e7e5e4]">
            Sign In
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
