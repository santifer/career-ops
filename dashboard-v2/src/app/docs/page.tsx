'use client';

import { Search, ArrowLeft, Target, Cpu, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function DocsPage() {
  const sections = [
    { 
      title: 'Global Scanners', 
      icon: <Search />,
      content: 'Our continuous scraping engines ingest job data from Vercel, Greenhouse, LinkedIn, and specialized engineering portals 24/7.'
    },
    { 
      title: 'Agentic Tailoring', 
      icon: <Target />,
      content: 'LLM-driven optimization that cross-references your career narrative against real-time hiring manager signals found in JD semantic clusters.'
    },
    { 
      title: 'Infrastructure Sync', 
      icon: <Database />,
      content: 'Multi-tenant database architecture ensures that your data is strictly isolated and encrypted at rest with zero-trust protocols.'
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#1c1917] p-8 md:p-24 selection:bg-[#1c1917]/10 font-sans">
      <Link href="/" className="inline-flex items-center gap-2 text-[#78716c] hover:text-[#1c1917] transition-colors mb-12 group font-bold text-sm uppercase tracking-widest">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Back to Hub
      </Link>

      <div className="max-w-4xl">
        <h1 className="text-4xl md:text-7xl font-bold tracking-tighter mb-6">Documentation</h1>
        <p className="text-[#a8a29e] text-xl mb-20 max-w-2xl font-medium leading-relaxed italic border-l-4 border-[#e7e5e4] pl-8">The technical foundation of Career-Ops. Learn how we use agentic AI to build the ultimate career command center.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          {sections.map((s, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="space-y-6"
            >
              <div className="p-4 bg-[#f5f5f4] w-fit rounded-2xl border border-[#e7e5e4] text-[#1c1917]">{s.icon}</div>
              <h3 className="text-3xl font-bold tracking-tight">{s.title}</h3>
              <p className="text-[#78716c] leading-relaxed font-medium">{s.content}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-32 p-12 bg-white border border-[#e7e5e4] rounded-[2.5rem] shadow-2xl shadow-black/[0.02]">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
            <Cpu className="text-[#1c1917]" size={24} />
            AI Training Context
          </h2>
          <p className="text-[#78716c] text-lg leading-relaxed font-medium">Career-Ops uses a specialized RAG (Retrieval-Augmented Generation) pipeline that combines your career narrative with thousands of high-performing resume patterns to generate high-conversion applications on the fly.</p>
        </div>
      </div>
    </div>
  );
}
