'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
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
  Shield,
  ShieldCheck,
  ChevronRight,
  X,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';

export default function Dashboard() {
  const { data: session, status } = useSession();
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
    search: { portals: ['linkedin', 'naukri', 'indeed', 'instahyre', 'flexiple', 'greenhouse', 'lever', 'japan-dev'] }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  const [spotlightRect, setSpotlightRect] = useState<{ top: number, left: number, width: number, height: number } | null>(null);
  const [accountInfo, setAccountInfo] = useState({ email: '', password: '', confirmPassword: '' });
  const [tagInputPositive, setTagInputPositive] = useState('');
  const [tagInputNegative, setTagInputNegative] = useState('');
  const [tagInputPortals, setTagInputPortals] = useState('');

  const steps = [
    { target: null, title: "Welcome to Alpha v2.0", content: "Your AI career command center is live. Let's configure your agent for maximum discovery.", icon: <Zap size={24}/> },
    { target: "nav-terminal", title: "The Command Engine", content: "The Terminal is where you control the agent. Type 'scan' to search 11+ job portals or 'tailor' to generate resumes.", icon: <TerminalIcon size={24}/> },
    { target: "nav-settings", title: "Your Training Ground", content: "Before you scan, you must train the AI. Let's head to Settings to define your professional identity.", icon: <Settings size={24}/> },
    { target: "config-narrative", title: "Core Narrative", content: "This is your AI Identity. The 'Executive Story' is used to automatically tailor every resume and cover letter we generate.", icon: <FileText size={24}/>, tab: 'settings' },
    { target: "config-targeting", title: "Hunting Strategy", content: "Targeting Parameters define your 'Hunting Logic'. Use keywords to tell the AI exactly which roles to prioritize or ignore.", icon: <Search size={24}/>, tab: 'settings' },
    { target: "nav-pipeline", title: "The Payoff", content: "Every job found is ranked 0-10 based on your strategy. Your best matches will appear here in the Pipeline.", icon: <BarChart3 size={24}/> }
  ];

  useEffect(() => {
    if (walkthroughStep !== null) {
      const step = steps[walkthroughStep];
      if (step?.tab) setActiveTab(step.tab);
      
      setTimeout(() => {
        if (step?.target) {
          const el = document.getElementById(step.target);
          if (el) {
            const rect = el.getBoundingClientRect();
            setSpotlightRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          setSpotlightRect(null);
        }
      }, step?.tab ? 300 : 0);
    }
  }, [walkthroughStep]);

  // Trigger walkthrough for both email+password and GitHub OAuth users
  useEffect(() => {
    if (status !== 'authenticated') return;

    const search = new URLSearchParams(window.location.search);
    const forceWalkthrough = search.get('walkthrough') === '1';
    if (forceWalkthrough) {
      setTimeout(() => setWalkthroughStep(0), 800);
      search.delete('walkthrough');
      const nextQuery = search.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
      return;
    }

    const userKey = session?.user?.email || session?.user?.id || 'default';
    const onboardingKey = `career_ops_onboarding_v2:${userKey}`;
    const hasSeenOnboarding = localStorage.getItem(onboardingKey);

    if (!hasSeenOnboarding) {
      setTimeout(() => setWalkthroughStep(0), 1200);
    }
  }, [status, session?.user?.email, session?.user?.id]);

  const completeOnboarding = () => {
    const userKey = session?.user?.email || session?.user?.id || 'default';
    localStorage.setItem(`career_ops_onboarding_v2:${userKey}`, 'true');
    setWalkthroughStep(null);
  };

  const runCommand = (query: string) => {
    setLogs(prev => [...prev, { type: 'stdout', content: `\ncareer-ops > ${query}\n` }]);
    setIsExecuting(true);
    
    const eventSource = new EventSource(`/api/exec?q=${encodeURIComponent(query)}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'done') {
        setIsExecuting(false);
        eventSource.close();
      } else if (data.type === 'clear') {
        setLogs([]);
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
            search: d.resume_context?.search || { portals: ['linkedin', 'naukri', 'indeed', 'instahyre', 'flexiple', 'greenhouse', 'lever', 'japan-dev'] }
          });
          setAccountInfo(prev => ({ ...prev, email: d.email || '' }));
        });
    }
  }, [activeTab]);

  const handleSaveSettings = async () => {
    if (accountInfo.password && accountInfo.password !== accountInfo.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_context: {
            candidate: profileFormData.candidate,
            narrative: profileFormData.narrative,
            search: profileFormData.search
          },
          targeting_keywords: profileFormData.targeting_keywords,
          email: accountInfo.email,
          password: accountInfo.password || undefined
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

  const firstNameFromProfile = data?.profile?.candidate?.full_name?.trim()?.split(/\s+/)?.[0];
  const firstNameFromSession =
    session?.user?.name?.trim()?.split(/\s+/)?.[0] ||
    session?.user?.email?.split('@')?.[0];
  const displayName = firstNameFromProfile || firstNameFromSession || null;

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
            <NavItem id="nav-dashboard" icon={<LayoutDashboard size={18}/>} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <NavItem id="nav-apps" icon={<Briefcase size={18}/>} label="Applications" active={activeTab === 'apps'} onClick={() => setActiveTab('apps')} />
            <NavItem id="nav-pipeline" icon={<Search size={18}/>} label="Job Pipeline" active={activeTab === 'pipeline'} onClick={() => setActiveTab('pipeline')} />
            <NavItem id="nav-cv" icon={<FileText size={18}/>} label="Resume Manager" active={activeTab === 'cv'} onClick={() => setActiveTab('cv')} />
            <NavItem id="nav-terminal" icon={<TerminalIcon size={18}/>} label="Terminal" active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} />
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-[#e7e5e4]">
          <NavItem id="nav-settings" icon={<Settings size={18}/>} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
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
            <h1 className="text-4xl font-bold tracking-tight text-[#1c1917]">
              {displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
            </h1>
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
               {(!data?.profile?.candidate?.full_name) && (
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
                      
                       <div className="grid grid-cols-1 gap-4">
                         <button 
                           onClick={() => setActiveTab('settings')}
                           className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${data?.profile?.candidate?.full_name ? 'bg-white border-[#e7e5e4] text-[#1c1917]' : 'bg-white border-[#e7e5e4] hover:bg-[#f5f5f4]'}`}
                         >
                           <span className="text-sm font-bold">Complete Profile Identity</span>
                           {data?.profile?.candidate?.full_name ? <CheckCircle2 size={16} className="text-emerald-500" /> : <ChevronRight size={16} />}
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
                   {data?.profile?.narrative?.exit_story ? (
                     <p className="text-[#1c1917] leading-relaxed font-medium italic pl-6 border-l-4 border-emerald-500/30">
                        "{data?.profile?.narrative?.exit_story}"
                     </p>
                   ) : (
                     <div className="py-4">
                       <p className="text-[#a8a29e] font-medium italic">No narrative defined yet.</p>
                       <button onClick={() => setActiveTab('settings')} className="mt-4 text-[#1c1917] text-xs font-bold uppercase tracking-widest hover:underline underline-offset-4">Configure Story →</button>
                     </div>
                   )}
                </div>
                <div className="grid grid-cols-2 gap-6">
                  {data?.profile?.narrative?.superpowers?.length > 0 ? (
                    data.profile.narrative.superpowers.map((s: any, i: number) => (
                      <div key={i} className="p-6 bg-white border border-[#e7e5e4] rounded-2xl text-xs font-bold uppercase tracking-widest text-[#a8a29e] hover:text-[#1c1917] transition-colors">
                         {s}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 p-6 bg-white/50 border border-dashed border-[#e7e5e4] rounded-2xl text-center">
                       <p className="text-[#a8a29e] text-xs font-bold uppercase tracking-widest">Awaiting Superpower Sync</p>
                    </div>
                  )}
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
            <motion.div key="terminal" className="bg-white rounded-[2rem] flex flex-col h-[600px] overflow-hidden shadow-2xl relative border border-[#e7e5e4]">
              <div className="p-5 border-b border-[#e7e5e4] flex justify-between items-center bg-[#f5f5f4]">
                 <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-[#f59e0b] rounded-full" />
                    <span className="text-[10px] font-mono text-[#57534e] uppercase tracking-[0.2em] font-bold">Career-Ops Output Console</span>
                 </div>
                 <button onClick={() => setLogs([])} className="text-[10px] text-[#78716c] hover:text-[#1c1917] transition-colors uppercase tracking-widest font-bold">Flush Buffers</button>
              </div>
              <div id="terminal-logs" className="flex-1 p-8 font-mono text-sm overflow-y-auto whitespace-pre-wrap bg-white text-[#292524] scroll-smooth leading-relaxed select-text cursor-text">
                 {logs.length === 0 && !isExecuting ? (
                   <div className="text-[#57534e] italic select-text">Awaiting secure handshake...</div>
                 ) : (
                   <div className="space-y-1">
                     {logs.map((log, i) => (
                      <div key={i} className={`select-text ${log.type === 'stderr' ? 'text-rose-700' : 'text-[#1c1917]'}`}>
                          {log.content}
                       </div>
                     ))}
                     {isExecuting && (
                        <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} className="inline-block w-2 h-5 bg-[#1c1917] ml-1" />
                     )}
                   </div>
                 )}
              </div>

              <div className="p-5 bg-[#f5f5f4] border-t border-[#e7e5e4]">
                 <div className="flex items-center gap-3">
                    <span className="text-[#1c1917] font-bold font-mono">auth@career-ops:~$</span>
                    <form onSubmit={handleCommandSubmit} className="flex-1">
                       <input 
                         type="text"
                         value={cmdInput}
                         onChange={(e) => setCmdInput(e.target.value)}
                         onKeyDown={handleKeyDown}
                         placeholder="scan / apply <id> / help"
                         disabled={isExecuting}
                         className="w-full bg-transparent outline-none border-none text-[#1c1917] font-mono placeholder:text-[#78716c] caret-[#1c1917] select-text"
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
                 <ConfigSection id="config-security" title="Account Security" icon={<Shield size={18} className="text-[#1c1917]" />}>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <Input label="Login Email" value={accountInfo.email} onChange={(v) => setAccountInfo({...accountInfo, email: v})} />
                     <div className="hidden md:block" />
                     <Input label="New Password" type="password" placeholder="Leave empty to keep current" value={accountInfo.password} onChange={(v) => setAccountInfo({...accountInfo, password: v})} />
                     <Input label="Confirm New Password" type="password" value={accountInfo.confirmPassword} onChange={(v) => setAccountInfo({...accountInfo, confirmPassword: v})} />
                   </div>
                 </ConfigSection>

                 <ConfigSection title="Candidate Identity" icon={<LayoutDashboard size={18} className="text-[#1c1917]" />}>
                   <Input label="Full Name" value={profileFormData.candidate.full_name} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, full_name: v}})} />
                   <div className="grid grid-cols-2 gap-4">
                      <Input label="Site Location" value={profileFormData.candidate.location} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, location: v}})} />
                      <Input label="Secure Email" value={profileFormData.candidate.email} onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, email: v}})} />
                   </div>
                 </ConfigSection>

                 <ConfigSection id="config-narrative" title="Core Narrative" icon={<FileText size={18} className="text-[#1c1917]" />}>
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

                 <ConfigSection id="config-targeting" title="Targeting Parameters" icon={<Search size={18} className="text-[#1c1917]" />}>
                    <div className="space-y-6">
                      <TagInput
                        label="Targeted Roles & Skills"
                        placeholder="Type a role or skill, press Enter..."
                        tags={profileFormData.targeting_keywords.positive}
                        inputValue={tagInputPositive}
                        onInputChange={setTagInputPositive}
                        onAdd={(tag) => setProfileFormData({...profileFormData, targeting_keywords: {...profileFormData.targeting_keywords, positive: [...profileFormData.targeting_keywords.positive, tag]}})}
                        onRemove={(i) => setProfileFormData({...profileFormData, targeting_keywords: {...profileFormData.targeting_keywords, positive: profileFormData.targeting_keywords.positive.filter((_: string, idx: number) => idx !== i)}})}
                        color="emerald"
                      />
                      <div className="pt-6 border-t border-[#f5f5f4]">
                        <TagInput
                          label="Exclusion Keywords"
                          placeholder="Type a keyword to exclude, press Enter..."
                          tags={profileFormData.targeting_keywords.negative}
                          inputValue={tagInputNegative}
                          onInputChange={setTagInputNegative}
                          onAdd={(tag) => setProfileFormData({...profileFormData, targeting_keywords: {...profileFormData.targeting_keywords, negative: [...profileFormData.targeting_keywords.negative, tag]}})}
                          onRemove={(i) => setProfileFormData({...profileFormData, targeting_keywords: {...profileFormData.targeting_keywords, negative: profileFormData.targeting_keywords.negative.filter((_: string, idx: number) => idx !== i)}})}
                          color="rose"
                        />
                      </div>
                    </div>
                 </ConfigSection>

                 <ConfigSection title="Portal Sources (Per User)" icon={<TerminalIcon size={18} className="text-[#1c1917]" />}>
                    <TagInput
                      label="Enabled Portals"
                      placeholder="linkedin, naukri, indeed, instahyre, flexiple..."
                      tags={profileFormData.search?.portals || []}
                      inputValue={tagInputPortals}
                      onInputChange={setTagInputPortals}
                      onAdd={(tag) => setProfileFormData({
                        ...profileFormData,
                        search: {
                          ...(profileFormData.search || {}),
                          portals: [...(profileFormData.search?.portals || []), tag.toLowerCase()]
                        }
                      })}
                      onRemove={(i) => setProfileFormData({
                        ...profileFormData,
                        search: {
                          ...(profileFormData.search || {}),
                          portals: (profileFormData.search?.portals || []).filter((_: string, idx: number) => idx !== i)
                        }
                      })}
                      color="stone"
                    />
                    <p className="text-xs text-[#78716c] font-medium">
                      Multi-tenant: every user should configure their own basics once in Settings.
                    </p>
                 </ConfigSection>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Walkthrough Overlay */}
      <AnimatePresence>
        {walkthroughStep !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none"
          >
            {/* Spotlight Hole */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-all duration-500"
              style={{
                clipPath: spotlightRect 
                  ? `polygon(0% 0%, 0% 100%, ${spotlightRect.left - 10}px 100%, ${spotlightRect.left - 10}px ${spotlightRect.top - 10}px, ${spotlightRect.left + spotlightRect.width + 10}px ${spotlightRect.top - 10}px, ${spotlightRect.left + spotlightRect.width + 10}px ${spotlightRect.top + spotlightRect.height + 10}px, ${spotlightRect.left - 10}px ${spotlightRect.top + spotlightRect.height + 10}px, ${spotlightRect.left - 10}px 100%, 100% 100%, 100% 0%)`
                  : 'none'
              }}
            />

            <div className="absolute inset-0 flex items-center justify-center p-6">
              <motion.div 
                key={walkthroughStep}
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] border border-[#e7e5e4] shadow-2xl max-w-sm w-full p-10 relative pointer-events-auto transition-all duration-500 max-h-[calc(100vh-2rem)] overflow-y-auto"
                style={spotlightRect ? {
                    position: 'absolute',
                    top: Math.min(window.innerHeight - 450, Math.max(20, spotlightRect.top + spotlightRect.height + 20)),
                    left: Math.min(window.innerWidth - 420, Math.max(20, spotlightRect.left))
                } : {}}
              >
                <div className="absolute top-0 right-0 p-6">
                  <button onClick={completeOnboarding} className="text-[#a8a29e] hover:text-[#1c1917] transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-widest">Skip</span>
                  </button>
                </div>

                <div className="mb-6">
                  <div className="h-12 w-12 bg-[#1c1917] rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-black/10">
                    <div className="text-white">{steps[walkthroughStep].icon}</div>
                  </div>

                  <h2 className="text-2xl font-bold text-[#1c1917] mb-3 tracking-tight">{steps[walkthroughStep].title}</h2>
                  <p className="text-[#78716c] font-medium leading-relaxed text-sm">{steps[walkthroughStep].content}</p>
                </div>

                <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#f5f5f4]">
                  <div className="flex gap-1.5">
                    {steps.map((_, s) => (
                      <div key={s} className={`h-1 w-1 rounded-full transition-all duration-500 ${walkthroughStep === s ? 'bg-[#1c1917] w-4' : 'bg-[#e7e5e4]'}`} />
                    ))}
                  </div>
                  <button 
                    onClick={() => walkthroughStep < steps.length - 1 ? setWalkthroughStep(walkthroughStep + 1) : completeOnboarding()}
                    className="px-6 py-3 bg-[#1c1917] text-white rounded-xl font-bold text-xs flex items-center gap-2 hover:bg-[#27272a] transition-all"
                  >
                    {walkthroughStep === steps.length - 1 ? 'Finish Tour' : 'Next Step'}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ id, icon, label, active, onClick }: { id?: string, icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button id={id} onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${active ? 'bg-[#1c1917] text-white font-bold shadow-xl' : 'text-[#78716c] hover:text-[#1c1917] hover:bg-white/50'}`}>
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

function ConfigSection({ id, title, icon, children }: { id?: string, title: string, icon: any, children: React.ReactNode }) {
  return (
    <div id={id} className="bg-white border border-[#e7e5e4] rounded-[2.5rem] p-10 space-y-6 scroll-mt-10">
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

function TagInput({ label, tags, inputValue, onInputChange, onAdd, onRemove, placeholder, color = 'stone' }: {
  label: string;
  tags: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
  color?: 'emerald' | 'rose' | 'stone';
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const tagColors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
  };

  const commit = () => {
    const val = inputValue.trim();
    if (val && !tags.includes(val)) {
      onAdd(val);
    }
    onInputChange('');
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onRemove(tags.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest block pl-1">{label}</label>
      <div
        className="min-h-[52px] w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl p-3 flex flex-wrap gap-2 items-center cursor-text focus-within:border-[#1c1917] transition-all"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <motion.span
            key={tag + i}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${tagColors[color]}`}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={11} />
            </button>
          </motion.span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            // Support pasting comma-separated values
            const val = e.target.value;
            if (val.includes(',')) {
              val.split(',').map(s => s.trim()).filter(Boolean).forEach(t => {
                if (!tags.includes(t)) onAdd(t);
              });
              onInputChange('');
            } else {
              onInputChange(val);
            }
          }}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={tags.length === 0 ? placeholder : '+ Add more'}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm font-bold text-[#1c1917] placeholder:text-[#a8a29e]/60"
        />
      </div>
      <p className="text-[10px] text-[#a8a29e] pl-1">Press <kbd className="px-1 py-0.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded text-[9px]">Enter</kbd> or <kbd className="px-1 py-0.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded text-[9px]">,</kbd> to add a tag</p>
    </div>
  );
}
