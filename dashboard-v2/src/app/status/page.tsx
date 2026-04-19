'use client';

import { Zap, Server, Globe, ArrowLeft, CheckCircle2, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function StatusPage() {
  const systems = [
    { name: 'Core API Engine', status: 'Operational', latency: '42ms', uptime: '99.99%', icon: <Zap /> },
    { name: 'Brevo Mail Gateway', status: 'Operational', latency: '120ms', uptime: '100%', icon: <Activity /> },
    { name: 'Scoring Infrastructure', status: 'Operational', latency: '210ms', uptime: '99.95%', icon: <Server /> },
    { name: 'On-chain Data Feed', status: 'Degraded', latency: '1.2s', uptime: '98.2%', icon: <Globe /> },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] p-8 md:p-24 selection:bg-[#1c1917]/10 font-sans">
      <Link href="/" className="inline-flex items-center gap-2 text-[#78716c] hover:text-[#1c1917] transition-colors mb-12 group font-bold text-sm uppercase tracking-widest">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Back to Hub
      </Link>

      <div className="max-w-4xl">
        <h1 className="text-4xl md:text-7xl font-bold tracking-tighter mb-6">Infrastructure Status</h1>
        <p className="text-[#a8a29e] text-xl mb-20 max-w-2xl font-medium leading-relaxed italic border-l-4 border-[#e7e5e4] pl-8">Real-time pulse of the Career-Ops ecosystem. We maintain zero-trust, high-availability clusters across global nodes.</p>

        <div className="grid gap-6">
          {systems.map((s, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white border border-[#e7e5e4] p-8 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-2xl hover:shadow-black/[0.02] transition-all"
            >
              <div className="flex items-center gap-6">
                <div className="p-4 bg-[#f5f5f4] rounded-2xl text-[#1c1917]">{s.icon}</div>
                <div>
                  <h3 className="font-bold text-xl">{s.name}</h3>
                  <div className="flex gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e] mt-2">
                    <span>Latency: {s.latency}</span>
                    <span>Uptime: {s.uptime}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 py-3 bg-[#faf9f6] rounded-full border border-[#e7e5e4]">
                <div className={`h-2.5 w-2.5 rounded-full ${s.status === 'Operational' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${s.status === 'Operational' ? 'text-emerald-600' : 'text-amber-600'}`}>{s.status}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-24 p-8 border-t border-[#e7e5e4] flex flex-col md:flex-row items-center justify-between gap-6 opacity-40 text-sm font-bold uppercase tracking-widest text-[#78716c]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            All systems nominal (excluding blockchain feeds)
          </div>
          <div className="font-mono">Sync: {new Date().toLocaleTimeString()}</div>
        </div>
      </div>
    </div>
  );
}
