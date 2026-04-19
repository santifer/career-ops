'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  FileText, 
  LayoutDashboard, 
  Play, 
  Search, 
  Settings, 
  Terminal as TerminalIcon,
  LogOut,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut } from 'next-auth/react';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [cmdInput, setCmdInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [profileFormData, setProfileFormData] = useState<any>({
    candidate: { full_name: '', location: '', email: '', linkedin: '', github: '' },
    narrative: { headline: '', exit_story: '', superpowers: [] },
    targeting_keywords: { positive: [], negative: [] },
    openai_key: '',
    hf_token: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const runCommand = (query: string) => {
    setLogs(prev => [...prev, { type: 'stdout', content: `\ncareer-ops > ${query}\n` }]);
    setIsExecuting(true);
    
    const eventSource = new EventSource(`/api/exec?q=${encodeURIComponent(query)}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'done') {
        setIsExecuting(false);
        eventSource.close();
      } else {
        setLogs(prev => [...prev, data]);
      }
    };

    eventSource.onerror = () => {
      setLogs(prev => [...prev, { type: 'stderr', content: '\n✗ Connection lost or execution failed.' }]);
      setIsExecuting(false);
      eventSource.close();
    };
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim() || isExecuting) return;
    
    const q = cmdInput.trim();
    setHistory(prev => [q, ...prev].slice(0, 50));
    setHistoryIndex(-1);
    runCommand(q);
    setCmdInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIndex = historyIndex + 1;
      if (nextIndex < history.length) {
        setHistoryIndex(nextIndex);
        setCmdInput(history[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = historyIndex - 1;
      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setCmdInput(history[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setCmdInput('');
      }
    }
  };

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/data')
        .then(res => res.json())
        .then(d => {
          setData(d);
          setLoading(false);
        });
    };
    fetchData();
    const interval = setInterval(fetchData, 30000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetch('/api/settings')
        .then(res => res.json())
        .then(d => {
          setProfileFormData({
            candidate: d.resume_context?.candidate || { full_name: '', location: '', email: '', linkedin: '', github: '' },
            narrative: d.resume_context?.narrative || { headline: '', exit_story: '', superpowers: [] },
            targeting_keywords: d.targeting_keywords || { positive: [], negative: [] },
            openai_key: d.openai_key || '',
            hf_token: d.hf_token || ''
          });
        });
    }
  }, [activeTab]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_context: {
            candidate: profileFormData.candidate,
            narrative: profileFormData.narrative
          },
          targeting_keywords: profileFormData.targeting_keywords,
          openai_key: profileFormData.openai_key,
          hf_token: profileFormData.hf_token
        })
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const term = document.getElementById('terminal-logs');
    if (term) {
      term.scrollTo({
        top: term.scrollHeight,
        behavior: 'auto'
      });
    }
  }, [logs]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#faf9f6] text-[#1c1917]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="h-8 w-8 border-2 border-[#1c1917] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#faf9f6] text-[#1c1917] font-sans selection:bg-[#1c1917]/10">
      {/* Sidebar: Updated to warm stone/beige */}
      <aside className="w-64 border-r border-[#e7e5e4] bg-[#f5f5f4] flex flex-col h-screen overflow-hidden">
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="h-8 w-8 bg-[#1c1917] rounded-lg flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#1c1917]">Career-Ops <span className="text-[10px] text-[#a8a29e] font-mono">v2.0</span></span>
          </div>

          <nav className="space-y-1">
            <NavItem icon={<LayoutDashboard size={18}/>} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem icon={<Briefcase size={18}/>} label="Applications" active={activeTab === 'apps'} onClick={() => setActiveTab('apps')} />
            <NavItem icon={<Search size={18}/>} label="Job Pipeline" active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} />
            <NavItem icon={<FileText size={18}/>} label="Resume Manager" active={activeTab === 'cv'} onClick={() => setActiveTab('cv')} />
            <NavItem icon={<TerminalIcon size={18}/>} label="Terminal" active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} />
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-[#e7e5e4]">
          <NavItem icon={<Settings size={18}/>} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          <button 
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-[#78716c] hover:text-[#1c1917] hover:bg-white/50 group"
          >
            <LogOut size={18} className="opacity-70 group-hover:opacity-100 transition-opacity" />
            <span className="text-sm font-bold">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-12 bg-white">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-[#1c1917]">Welcome back, {data?.profile?.candidate?.full_name?.split(' ')[0]}</h1>
            <p className="text-[#a8a29e] font-medium mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex gap-4">
             <button className="px-5 py-2.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded-xl hover:bg-[#e7e5e4] transition-colors flex items-center gap-2 text-sm font-bold text-[#1c1917]">
                <Search size={16} />
                <span>Search</span>
             </button>
             <button 
                onClick={() => { setActiveTab('terminal'); runCommand('rank'); }}
                className="px-5 py-2.5 bg-[#1c1917] text-white font-bold rounded-xl hover:bg-[#27272a] transition-all flex items-center gap-2 shadow-lg"
              >
                <Play size={16} />
                <span>Quick Run</span>
             </button>
          </div>
        </header>

        <section className="grid grid-cols-4 gap-8 mb-12">
          <StatCard icon={<Clock size={20} className="text-[#1c1917]" />} label="Ongoing" value={data?.stats?.applied || 0} />
          <StatCard icon={<CheckCircle2 size={20} className="text-[#1c1917]" />} label="Interviews" value={data?.stats?.interviews || 0} />
          <StatCard icon={<FileText size={20} className="text-[#1c1917]" />} label="Saved PDFs" value={data?.pdfs?.length || 0} />
          <StatCard icon={<Search size={20} className="text-[#1c1917]" />} label="In Pipeline" value={data?.pipeline?.length || 0} />
        </section>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dash" className="space-y-12">
               {/* Onboarding Checklist */}
               {(!data?.profile?.candidate?.full_name || !data?.openai_key) && (
                 <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#f5f5f4] border border-[#e7e5e4] p-10 rounded-[2.5rem] relative overflow-hidden"
                 >
                   <div className="relative z-10 max-w-xl">
                      <h3 className="text-2xl font-bold mb-3 flex items-center gap-3 text-[#1c1917]">
                        <Zap className="text-[#1c1917]" size={22} />
                        Launch Checklist
                      </h3>
                      <p className="text-[#78716c] mb-8 font-medium">Complete these steps to activate your AI discovery engine.</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setActiveTab('settings')}
                          className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${data?.profile?.candidate?.full_name ? 'bg-white border-[#e7e5e4] text-[#1c1917]' : 'bg-white border-[#e7e5e4] hover:bg-[#f5f5f4]'}`}
                        >
                          <span className="text-sm font-bold">Profile Identity</span>
                          {data?.profile?.candidate?.full_name ? <CheckCircle2 size={16} className="text-emerald-500" /> : <ChevronRight size={16} />}
                        </button>

                        <button 
                          onClick={() => setActiveTab('settings')}
                          className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${data?.openai_key ? 'bg-white border-[#e7e5e4] text-[#1c1917]' : 'bg-white border-[#e7e5e4] hover:bg-[#f5f5f4]'}`}
                        >
                          <span className="text-sm font-bold">AI Credentials</span>
                          {data?.openai_key ? <CheckCircle2 size={16} className="text-emerald-500" /> : <ChevronRight size={16} />}
                        </button>
                      </div>
                   </div>
                 </motion.div>
               )}

               <div className="grid grid-cols-2 gap-12">
                  <div className="bg-[#f5f5f4] p-10 rounded-[2.5rem] border border-[#e7e5e4] aspect-video flex flex-col justify-between">
                     <div>
                       <h3 className="text-2xl font-bold mb-2 text-[#1c1917]">Application Funnel</h3>
                       <p className="text-[#a8a29e] font-medium">Real-time status tracking</p>
                     </div>
                     <div className="flex items-end gap-5 h-32">
                       <div className="flex-1 bg-[#1c1917] rounded-xl h-[80%]" />
                       <div className="flex-1 bg-[#1c1917]/60 rounded-xl h-[50%]" />
                       <div className="flex-1 bg-[#1c1917]/30 rounded-xl h-[20%]" />
                       <div className="flex-1 bg-[#1c1917]/10 rounded-xl h-[5%]" />
                     </div>
                  </div>
                  <div className="bg-white p-10 rounded-[2.5rem] border border-[#e7e5e4]">
                     <h3 className="text-2xl font-bold mb-8 text-[#1c1917]">Recent Activity</h3>
                     <div className="space-y-6 text-sm">
                       {data?.applications?.length > 0 ? data.applications.slice(0, 4).map((app: any, i: number) => (
                         <div key={i} className="flex items-center justify-between group">
                           <div className="flex items-center gap-4">
                              <div className="h-1.5 w-1.5 rounded-full bg-[#1c1917] animate-pulse" />
                              <span className="font-bold text-[#1c1917]">{app.company}</span>
                           </div>
                           <span className="text-[#a8a29e] font-mono uppercase text-[10px] tracking-widest">{new Date(app.applied_at).toLocaleDateString()}</span>
                         </div>
                       )) : (
                         <p className="text-[#a8a29e] italic font-medium">No recent activity detected.</p>
                       )}
                     </div>
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'apps' && (
            <motion.div key="apps" className="bg-white border border-[#e7e5e4] rounded-[2rem] overflow-hidden shadow-2xl shadow-black/[0.02]">
              <div className="p-8 border-b border-[#e7e5e4] bg-[#faf9f6]">
                <h2 className="text-xl font-bold text-[#1c1917]">Global Applications</h2>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#f5f5f4] border-b border-[#e7e5e4]">
                    <tr className="text-[#a8a29e] text-[10px] uppercase tracking-[0.2em] font-bold">
                      <th className="px-8 py-5">Company</th>
                      <th className="px-8 py-5">Role</th>
                      <th className="px-8 py-5">Date</th>
                      <th className="px-8 py-5">AI Score</th>
                      <th className="px-8 py-5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f4]">
                    {data?.applications?.map((app: any, i: number) => (
                      <tr key={i} className="hover:bg-[#faf9f6] transition-colors group">
                        <td className="px-8 py-6 font-bold text-[#1c1917]">{app.company}</td>
                        <td className="px-8 py-6 text-[#78716c] font-medium">{app.role}</td>
                        <td className="px-8 py-6 text-[#a8a29e] font-mono text-xs uppercase">{new Date(app.applied_at).toLocaleDateString()}</td>
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-3">
                              <div className="h-1 w-16 bg-[#e7e5e4] rounded-full overflow-hidden">
                                 <div className="h-full bg-[#1c1917]" style={{ width: `${app.score * 10 || 0}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-[#1c1917]">{app.score}</span>
                           </div>
                        </td>
                        <td className="px-8 py-6 text-[#1c1917]">
                           <button onClick={() => { setActiveTab('terminal'); runCommand(`apply ${app.app_id}`); }} className="p-2 border border-[#e7e5e4] rounded-lg hover:bg-[#1c1917] hover:text-white transition-all">
                             <Play size={14} />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'pipeline' && (
            <motion.div key="pipeline" className="bg-white border border-[#e7e5e4] rounded-[2rem] overflow-hidden shadow-2xl shadow-black/[0.02]">
              <div className="p-8 border-b border-[#e7e5e4] bg-[#faf9f6]">
                <h2 className="text-xl font-bold text-[#1c1917]">Live Job Pipeline</h2>
              </div>
              <div className="overflow-x-auto text-sm max-h-[600px]">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-[#f5f5f4] border-b border-[#e7e5e4]">
                    <tr className="text-[#a8a29e] text-[10px] uppercase tracking-[0.2em] font-bold">
                      <th className="px-8 py-5">Target / Company</th>
                      <th className="px-8 py-5">Job Title</th>
                      <th className="px-8 py-5">Score</th>
                      <th className="px-8 py-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f4]">
                    {data?.pipeline?.map((job: any, i: number) => (
                      <tr key={i} className="hover:bg-[#faf9f6] transition-colors">
                        <td className="px-8 py-6">
                           <div className="font-bold text-[#1c1917]">{job.company}</div>
                           <a href={job.url} target="_blank" className="text-[10px] font-bold text-[#a8a29e] hover:text-[#1c1917] transition-colors">{job.url.substring(0, 30)}...</a>
                        </td>
                        <td className="px-8 py-6 text-[#78716c] font-medium">{job.title || 'Unknown Role'}</td>
                        <td className="px-8 py-6 font-mono font-bold text-[#1c1917]">{job.score}</td>
                        <td className="px-8 py-6 flex gap-3">
                           <button onClick={() => { setActiveTab('terminal'); runCommand(`offer-match ${job.pipeline_id}`); }} className="px-4 py-2 bg-[#1c1917] text-white rounded-xl font-bold text-xs hover:bg-[#27272a] transition-all">Tailor</button>
                           <button onClick={() => { setActiveTab('terminal'); runCommand(`apply ${job.pipeline_id}`); }} className="px-4 py-2 bg-white border border-[#e7e5e4] text-[#1c1917] rounded-xl font-bold text-xs hover:bg-[#f5f5f4] transition-all">Apply</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'cv' && (
            <motion.div key="cv" className="grid grid-cols-3 gap-10">
               <div className="col-span-2 space-y-10">
                  <div className="bg-[#f5f5f4] p-10 border border-[#e7e5e4] rounded-[2.5rem]">
                     <h3 className="text-xl font-bold mb-6 text-[#1c1917] border-b border-[#e7e5e4] pb-4">Profile Narrative</h3>
                     <p className="text-[#1c1917] leading-relaxed font-medium italic pl-6 border-l-4 border-emerald-500/30">
                        "{data?.profile?.narrative?.exit_story}"
                     </p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    {data?.profile?.narrative?.superpowers?.map((s: any, i: number) => (
                      <div key={i} className="p-6 bg-white border border-[#e7e5e4] rounded-2xl text-xs font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#1c1917] transition-colors">
                         {s}
                      </div>
                    ))}
                  </div>
               </div>
               <div className="bg-[#faf9f6] border border-[#e7e5e4] rounded-[2.5rem] p-8 flex flex-col">
                  <h3 className="font-bold mb-8 text-[#1c1917] flex items-center justify-between">
                     Generated Docs
                     <FileText size={18} className="text-[#a8a29e]" />
                  </h3>
                  <div className="space-y-3 overflow-y-auto flex-1">
                    {data?.pdfs?.map((pdf: any, i: number) => (
                      <div key={i} className="p-4 bg-white rounded-xl border border-[#e7e5e4] hover:border-[#1c1917] transition-all flex items-center justify-between group">
                         <div className="truncate text-[10px] font-bold text-[#78716c] uppercase tracking-tighter group-hover:text-[#1c1917]">{pdf.name}</div>
                         < ChevronRight size={14} className="text-[#e7e5e4] group-hover:text-[#1c1917]" />
                      </div>
                    ))}
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'terminal' && (
            <motion.div key="terminal" className="bg-[#1c1917] rounded-[2rem] flex flex-col h-[600px] overflow-hidden shadow-2xl relative border-8 border-[#f5f5f4]">
              <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.03]">
                 <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-[#f59e0b] rounded-full" />
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em] font-bold">Career-Ops Output Console</span>
                 </div>
                 <button onClick={() => setLogs([])} className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest font-bold">Flush Buffers</button>
              </div>
              <div id="terminal-logs" className="flex-1 p-8 font-mono text-sm overflow-y-auto whitespace-pre-wrap bg-[#1c1917] text-white/80 scroll-smooth leading-relaxed">
                 {logs.length === 0 && !isExecuting ? (
                   <div className="text-white/10 italic">Awaiting secure handshake...</div>
                 ) : (
                   <div className="space-y-1">
                     {logs.map((log, i) => (
                       <div key={i} className={log.type === 'stderr' ? 'text-rose-400' : 'text-[#f59e0b]'}>
                          {log.content}
                       </div>
                     ))}
                     {isExecuting && (
                        <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="inline-block w-2 h-5 bg-[#f59e0b] ml-1" />
                     )}
                   </div>
                 )}
              </div>

              <div className="p-5 bg-white/[0.02] border-t border-white/5">
                 <div className="flex items-center gap-3">
                    <span className="text-[#f59e0b] font-bold font-mono">auth@career-ops:~$</span>
                    <form onSubmit={handleCommandSubmit} className="flex-1">
                       <input 
                         type="text"
                         value={cmdInput}
                         onChange={(e) => setCmdInput(e.target.value)}
                         onKeyDown={handleKeyDown}
                         placeholder="scan / apply <id> / help"
                         disabled={isExecuting}
                         className="w-full bg-transparent outline-none border-none text-white font-mono placeholder:text-white/5 caret-[#f59e0b]"
                         autoFocus
                       />
                    </form>
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" className="w-full max-w-5xl">
               <div className="flex justify-between items-end mb-12">
                 <div>
                   <h2 className="text-4xl font-bold text-[#1c1917] tracking-tight">System Configuration</h2>
                   <p className="text-[#a8a29e] mt-1 font-medium italic">Establishing your global professional identity.</p>
                 </div>
                 <button 
                   onClick={handleSaveSettings}
                   disabled={isSaving}
                   className={`px-10 py-4 rounded-2xl font-bold transition-all shadow-xl flex items-center gap-3 ${saveStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-[#1c1917] text-white hover:bg-[#27272a]'}`}
                 >
                   {saveStatus === 'saving' ? 'Syncing...' : saveStatus === 'success' ? <><CheckCircle2 size={18} /> Profile Locked</> : 'Save Changes'}
                 </button>
               </div>

               <div className="grid grid-cols-2 gap-10">
                 <ConfigSection title="Candidate Identity" icon={<LayoutDashboard size={18} className="text-[#1c1917]" />}>
                   <Input label="Full Name" value={profileFormData.candidate.full_name} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, full_name: v}})} />
                   <div className="grid grid-cols-2 gap-4">
                      <Input label="Site Location" value={profileFormData.candidate.location} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, location: v}})} />
                      <Input label="Secure Email" value={profileFormData.candidate.email} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, email: v}})} />
                   </div>
                 </ConfigSection>

                 <ConfigSection title="Core Narrative" icon={<FileText size={18} className="text-[#1c1917]" />}>
                   <Input label="Strategic Headline" value={profileFormData.narrative.headline} onChange={(v) => setProfileFormData({...profileFormData, narrative: {...profileFormData.narrative, headline: v}})} />
                   <div>
                      <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest mb-2 block">Executive Story</label>
                      <textarea 
                        rows={4}
                        value={profileFormData.narrative.exit_story}
                        onChange={(e) => setProfileFormData({...profileFormData, narrative: {...profileFormData.narrative, exit_story: e.target.value}})}
                        className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl p-4 outline-none focus:border-[#1c1917] transition-all text-sm font-medium leading-relaxed" 
                      />
                   </div>
                 </ConfigSection>

                 <ConfigSection title="Targeting Parameters" icon={<Search size={18} className="text-[#1c1917]" />}>
                   <Input label="Operational Keywords" value={profileFormData.targeting_keywords.positive.join(', ')} onChange={(v) => setProfileFormData({...profileFormData, targeting_keywords: {...profileFormData.targeting_keywords, positive: v.split(',').map(s => s.trim())}})} />
                 </ConfigSection>

                 <ConfigSection title="Intelligence Keys" icon={<ShieldCheck size={18} className="text-[#1c1917]" />}>
                   <Input label="OpenAI API Gateway" type="password" value={profileFormData.openai_key} onChange={(v) => setProfileFormData({...profileFormData, openai_key: v})} />
                 </ConfigSection>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-[#1c1917] text-white font-bold shadow-xl' : 'text-[#78716c] hover:text-[#1c1917] hover:bg-white/50'}`}>
      {icon}
      <span className="text-sm">{label}</span>
    </button>
  );
}

function StatCard({ icon, label, value }: { icon: any, label: string, value: any }) {
  return (
    <div className="p-8 rounded-[1.75rem] bg-white border border-[#e7e5e4] shadow-sm hover:shadow-xl hover:shadow-black/[0.02] transition-all group">
      <div className="flex items-center justify-between mb-8">
        <div className="p-2.5 bg-[#f5f5f4] rounded-xl group-hover:bg-[#1c1917] group-hover:text-white transition-colors">{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a8a29e]">{label}</span>
      </div>
      <div className="text-4xl font-bold tracking-tighter text-[#1c1917]">{value}</div>
    </div>
  );
}

function ConfigSection({ title, icon, children }: { title: string, icon: any, children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 space-y-6">
      <h3 className="font-bold text-lg flex items-center gap-3 text-[#1c1917] border-b border-[#f5f5f4] pb-6">{icon} {title}</h3>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string, type?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest block pl-1">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl p-4 outline-none focus:border-[#1c1917] transition-all text-sm font-bold text-[#1c1917]" 
        placeholder={placeholder}
      />
    </div>
  );
}
