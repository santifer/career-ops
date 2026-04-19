'use client';

import { Briefcase, ArrowRight, ShieldCheck, Play, Sparkles, Zap, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] flex flex-col relative overflow-hidden font-sans">
      {/* Background Subtle Organic Glows: Switched to warm, soft tones */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#f59e0b]/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#0ea5e9]/3 rounded-full blur-[120px]" />

      {/* Header */}
      <header className="z-20 px-8 py-6 flex justify-between items-center border-b border-[#e7e5e4] backdrop-blur-md sticky top-0 bg-[#faf9f6]/80">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-[#1c1917] rounded-lg flex items-center justify-center shadow-sm">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1c1917]">Career-Ops <span className="text-[10px] text-[#78716c] font-mono uppercase tracking-widest ml-1">SaaS v2</span></span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-bold text-[#78716c] hover:text-[#1c1917] transition-colors">
            Sign In
          </Link>
          <Link href="/signup" className="px-5 py-2.5 bg-[#1c1917] text-white font-bold rounded-xl hover:bg-[#27272a] transition-all shadow-md active:scale-95">
            Join Platform
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 max-w-5xl mx-auto w-full pt-20">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f5f5f4] border border-[#e7e5e4] text-[#78716c] text-[10px] font-bold uppercase tracking-widest mb-4">
            <Sparkles size={12} className="text-[#1c1917]" />
            Professional Career Infrastructure
          </div>
          
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter leading-tight text-[#1c1917]">
            Automate Your <br />
            <span className="text-[#a8a29e]">Career Ascension</span>
          </h1>

          <p className="text-[#78716c] text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            The sophisticated AI command center for professional growth. 
            Automated job scanning, agentic resume tailoring, and 
            real-time pipeline intelligence.
          </p>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-12">
            <Link 
              href="/signup" 
              className="w-full md:w-auto px-10 py-5 bg-[#1c1917] text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 hover:bg-[#27272a] transition-all shadow-xl active:scale-95 group"
            >
              Get Started for Free
              <ArrowRight className="group-hover:translate-x-1 transition-transform text-white/50" />
            </Link>
            <Link 
              href="/login" 
              className="w-full md:w-auto px-10 py-5 bg-white border border-[#e7e5e4] text-[#1c1917] font-bold text-lg rounded-2xl flex items-center justify-center gap-3 hover:bg-[#f5f5f4] transition-all active:scale-95"
            >
              Enter Command Center
            </Link>
          </div>
        </motion.div>

        {/* Feature Highlights: Switched to soft white cards with delicate borders */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-40 w-full mb-20"
        >
          <FeatureCard 
            icon={<Zap size={22} />} 
            title="Real-time Scanning" 
            desc="Continuous scraping of global job boards with high-precision AI ranking." 
          />
          <FeatureCard 
            icon={<Target size={22} />} 
            title="Agentic Tailoring" 
            desc="LLM-driven resume optimization that matches exact hiring manager signals." 
          />
          <FeatureCard 
            icon={<ShieldCheck size={22} />} 
            title="Secure Tenancy" 
            desc="Encrypted multi-tenant architecture keeps your career narrative private." 
          />
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="z-10 p-12 border-t border-[#e7e5e4] flex flex-col md:flex-row items-center justify-between gap-6 bg-[#f5f5f4]">
        <div className="text-[10px] font-bold text-[#78716c] uppercase tracking-[0.2em] flex items-center gap-2">
          <Play size={10} className="fill-[#78716c] text-[#78716c]" />
          Initialized v2.0-modern-beige
        </div>
        <div className="flex gap-8 text-[#a8a29e] text-[11px] font-bold uppercase tracking-widest">
          <Link href="/docs" className="hover:text-[#1c1917] transition-colors">Documentation</Link>
          <Link href="/privacy" className="hover:text-[#1c1917] transition-colors">Privacy Core</Link>
          <Link href="/status" className="hover:text-[#1c1917] transition-colors">Infra Status</Link>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="p-10 bg-white border border-[#e7e5e4] rounded-[2rem] text-left group hover:border-[#d4d4d8] hover:shadow-2xl hover:shadow-black/[0.02] transition-all">
      <div className="mb-6 p-4 bg-[#faf9f6] w-fit rounded-2xl group-hover:bg-[#f5f5f4] transition-colors text-[#1c1917]">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-[#1c1917]">{title}</h3>
      <p className="text-[#78716c] text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
