'use client';

import { Fingerprint, Lock, EyeOff, ArrowLeft, Key } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function PrivacyPage() {
  const pillars = [
    { 
      title: 'Data Sovereignty', 
      icon: <Fingerprint />,
      content: 'Your career narrative is yours. We use high-isolation tenancy on Neon Postgres to ensure no cross-leakage ever occurs.'
    },
    { 
      title: 'Brevo Privacy', 
      icon: <Lock />,
      content: 'Email verification is performed over encrypted tunnels. We never share your contact details with external scanners.'
    },
    { 
      title: 'Model Privacy', 
      icon: <EyeOff />,
      content: 'Your tailoring requests to OpenAI and HuggingFace are stateless. No fine-tuning is performed on your private career data.'
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] p-8 md:p-24 selection:bg-[#1c1917]/10 font-sans">
      <Link href="/" className="inline-flex items-center gap-2 text-[#78716c] hover:text-[#1c1917] transition-colors mb-12 group font-bold text-sm uppercase tracking-widest">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Back to Hub
      </Link>

      <div className="max-w-4xl">
        <h1 className="text-4xl md:text-7xl font-bold tracking-tighter mb-6">Privacy Core</h1>
        <p className="text-[#a8a29e] text-xl mb-20 max-w-2xl font-medium leading-relaxed italic border-l-4 border-[#e7e5e4] pl-8">The Career-Ops Zero-Trust Manifest. We believe professional growth shouldn&apos;t compromise personal data integrity.</p>

        <div className="space-y-20 mb-32">
          {pillars.map((p, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex gap-10 items-start"
            >
              <div className="p-5 bg-white rounded-2xl border border-[#e7e5e4] text-[#1c1917] shrink-0">{p.icon}</div>
              <div className="pt-2">
                <h3 className="text-3xl font-bold mb-3 tracking-tight">{p.title}</h3>
                <p className="text-[#78716c] leading-relaxed max-w-xl font-medium">{p.content}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="p-10 bg-white border border-[#e7e5e4] rounded-[2.5rem] flex items-center gap-8 shadow-2xl shadow-black/[0.02]">
          <Key className="text-[#1c1917] shrink-0" size={40} />
          <div>
            <h4 className="font-bold text-xl mb-1">Encrypted Secrets</h4>
            <p className="text-[#78716c] font-medium leading-relaxed">Your API keys are stored with AES-256 encryption. Our infrastructure never reads them in plain text outside of the secure execution runner.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
