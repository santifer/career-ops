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
  Zap,
  Upload,
  ExternalLink,
  Trash2,
  AlertTriangle,
  MoreVertical
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
    candidate: { full_name: '', location: '', email: '', phone: '', linkedin: '', github: '' },
    narrative: { headline: '', exit_story: '', superpowers: [] },
    experience: [],
    education: [],
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
  const [toast, setToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeImportStatus, setResumeImportStatus] = useState<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const [resumeImport, setResumeImport] = useState<any>(null);
  const [resumeImportMode, setResumeImportMode] = useState<'replace' | 'merge'>('merge');
  const [jobDetailsOpen, setJobDetailsOpen] = useState(false);
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [jobDetails, setJobDetails] = useState<any>(null);
  const [jobDetailsError, setJobDetailsError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; company: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const appendTerminalLine = (line: string) => {
    setLogs((prev) => [...prev, { type: 'stdout', content: `\n${line}\n` }]);
  };

  const q = searchQuery.trim().toLowerCase();
  const matches = (value: any) => {
    if (!q) return true;
    return String(value || '').toLowerCase().includes(q);
  };

  const filteredPipeline = (data?.pipeline || []).filter((job: any) =>
    matches(job.company) || matches(job.title) || matches(job.url) || matches(job.source) || matches(job.score)
  );
  const filteredApplications = (data?.applications || []).filter((app: any) =>
    matches(app.company) || matches(app.role) || matches(app.url) || matches(app.status) || matches(app.score)
  );
  const filteredDocs = (data?.pdfs || []).filter((doc: any) =>
    matches(doc.company) || matches(doc.title) || matches(doc.name)
  );

  useEffect(() => {
    if (!isSearchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isSearchOpen]);

  const formatCompletionMessage = (meta: any) => {
    const script: string = String(meta?.lastBackgroundActionScript || '');
    const status: string = String(meta?.lastBackgroundStatus || '');
    const label =
      script === 'scratch-scan.mjs'
        ? 'Scan'
        : script === 'rank-pipeline.mjs'
          ? 'Rank'
          : script === 'agentic-tailor.mjs'
            ? 'Tailor'
            : script === 'auto-apply.mjs'
              ? 'Apply'
              : 'Background job';
    const outcome =
      status === 'success'
        ? 'completed'
        : status === 'cancelled'
          ? 'cancelled'
          : 'failed';

    const hint =
      label === 'Tailor' && outcome === 'completed'
        ? ' [FILE] PDF ready in Resume Manager → Generated Docs'
        : '';
    return { toast: `[OK] ✔ ${label} ${outcome}${hint}`, terminal: `[OK] ✔ ${label} ${outcome}${hint}` };
  };

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

  // Track last seen background completion event (so we can show toast even if it completed while user was away)
  useEffect(() => {
    if (status !== 'authenticated') return;
    const userKey = session?.user?.email || session?.user?.id || 'default';
    const key = `career_ops_last_seen_bg_event:${userKey}`;
    try {
      const seen = localStorage.getItem(key);
      if (seen === null) localStorage.setItem(key, '0');
    } catch {
      // ignore storage failures
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
    // Ctrl+C to clear current line (terminal-style)
    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (cmdInput.trim()) {
        appendTerminalLine(`^C`);
        setCmdInput('');
        setHistoryIndex(-1);
      } else if (isExecuting) {
        appendTerminalLine(`^C`);
        appendTerminalLine(`[ERR] Command execution cannot be interrupted. Please wait for completion.`);
      }
      return;
    }

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
      fetch('/api/data?t=' + Date.now(), { cache: 'no-store' })
        .then(res => res.json())
        .then(d => {
          setData((prevData: any) => {
            const userKey = session?.user?.email || session?.user?.id || 'default';
            const lastSeenKey = `career_ops_last_seen_bg_event:${userKey}`;

            // Toast even on first load (if webhook completed while user was away)
            try {
              const nextMeta = d?.meta || {};
              const nextEventId = Number(nextMeta.lastBackgroundEventId || 0);
              const lastSeen = Number(localStorage.getItem(lastSeenKey) || 0);
              if (nextEventId > 0 && nextEventId > lastSeen) {
                const msg = formatCompletionMessage(nextMeta);
                setToast({ show: true, message: msg.toast });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine(msg.terminal);
                localStorage.setItem(lastSeenKey, String(nextEventId));
              }
            } catch {
              // ignore storage failures
            }

            if (prevData) {
              // Reliable background completion signals (GitHub Actions / cron)
              const prevMeta = prevData.meta || {};
              const nextMeta = d.meta || {};
              // Completion toast (even when 0 jobs were added/ranked)
              // Trigger on event id change OR completed_at change (more robust across reloads/localStorage).
              if (
                (nextMeta.lastBackgroundEventId &&
                  nextMeta.lastBackgroundEventId !== prevMeta.lastBackgroundEventId) ||
                (nextMeta.lastBackgroundCompletedAt &&
                  nextMeta.lastBackgroundCompletedAt !== prevMeta.lastBackgroundCompletedAt)
              ) {
                const msg = formatCompletionMessage(nextMeta);
                setToast({ show: true, message: msg.toast });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine(msg.terminal);
                try {
                  localStorage.setItem(lastSeenKey, String(Number(nextMeta.lastBackgroundEventId || 0)));
                } catch {
                  // ignore
                }
              }
              if (
                typeof prevMeta.jobsTotal === 'number' &&
                typeof nextMeta.jobsTotal === 'number' &&
                nextMeta.jobsTotal > prevMeta.jobsTotal
              ) {
                setToast({ show: true, message: '[OK] ✔ Scan completed — new jobs added' });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine('[OK] ✔ Scan completed. New jobs added');
              } else if (
                typeof prevMeta.jobsRanked === 'number' &&
                typeof nextMeta.jobsRanked === 'number' &&
                nextMeta.jobsRanked > prevMeta.jobsRanked
              ) {
                setToast({ show: true, message: '[OK] ✔ Rank completed — scores updated' });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine('[OK] ✔ Rank completed. Scores updated');
              }

              if (prevData.pdfs && d.pdfs && d.pdfs.length > prevData.pdfs.length) {
                setToast({ show: true, message: '[OK] ✔ Tailor completed — resume generated' });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine('[OK] ✔ Tailor completed. New document generated');
              } else if (prevData.applications && d.applications && d.applications.length > prevData.applications.length) {
                setToast({ show: true, message: '[OK] ✔ Apply completed — application recorded' });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine('[OK] ✔ Apply completed. Application recorded');
              } else if (prevData.pipeline && d.pipeline) {
                const prevScores = prevData.pipeline.map((j: any) => j.score || 0).join(',');
                const newScores = d.pipeline.map((j: any) => j.score || 0).join(',');
                if (d.pipeline.length > prevData.pipeline.length) {
                setToast({ show: true, message: '[OK] ✔ Scan completed — pipeline updated' });
                setTimeout(() => setToast({ show: false, message: '' }), 5000);
                appendTerminalLine('[OK] ✔ Scan completed. Pipeline updated');
                } else if (prevScores !== newScores) {
                  setToast({ show: true, message: '[OK] ✔ Rank completed — pipeline scores updated' });
                  setTimeout(() => setToast({ show: false, message: '' }), 5000);
                  appendTerminalLine('[OK] ✔ Rank completed. Pipeline scores updated');
                }
              }
            }
            return d;
          });
          setLoading(false);
        });
    };
    fetchData();
    // Poll every 5 seconds to ensure near-instant updates when GitHub Actions finish
    const interval = setInterval(fetchData, 5000); 
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
            experience: d.resume_context?.experience || [],
            education: d.resume_context?.education || [],
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
              experience: profileFormData.experience,
              education: profileFormData.education,
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

  const normalizeExperience = (arr: any[]) =>
    (Array.isArray(arr) ? arr : []).filter(Boolean).map((e) => ({
      company: String(e?.company || '').trim(),
      role: String(e?.role || '').trim(),
      period: String(e?.period || '').trim(),
      location: String(e?.location || '').trim(),
      bullets: Array.isArray(e?.bullets) ? e.bullets.map((b: any) => String(b || '').trim()).filter(Boolean) : [],
    }));

  const normalizeEducation = (arr: any[]) =>
    (Array.isArray(arr) ? arr : []).filter(Boolean).map((e) => ({
      school: String(e?.school || '').trim(),
      degree: String(e?.degree || '').trim(),
      period: String(e?.period || '').trim(),
      location: String(e?.location || '').trim(),
    }));

  const mergeUniqueByKey = (base: any[], incoming: any[], keyFn: (v: any) => string) => {
    const out: any[] = [];
    const seen = new Set<string>();
    const push = (v: any) => {
      const k = keyFn(v);
      if (!k) return;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    };
    base.forEach(push);
    incoming.forEach(push);
    return out;
  };

  const handleResumeImportFile = async (file: File) => {
    setResumeImportStatus('uploading');
    setResumeImport(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/resume/import', { method: 'POST', body: fd });
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload: any = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        const msg =
          (isJson ? payload?.error : String(payload || '')) ||
          `Import failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      // API returns both top-level and extracted.*; prefer extracted for shape stability.
      setResumeImport(payload?.extracted || payload);
      setResumeImportStatus('ready');
    } catch (e: any) {
      setResumeImportStatus('error');
      setResumeImport({ error: e?.message || 'Import failed' });
    }
  };

  const applyResumeImport = () => {
    const nextExp = normalizeExperience(resumeImport?.experience || []);
    const nextEdu = normalizeEducation(resumeImport?.education || []);
    setProfileFormData((prev: any) => {
      const prevExp = normalizeExperience(prev?.experience || []);
      const prevEdu = normalizeEducation(prev?.education || []);
      const exp =
        resumeImportMode === 'replace'
          ? nextExp
          : mergeUniqueByKey(prevExp, nextExp, (e) => `${e.company}::${e.role}::${e.period}`.toLowerCase());
      const education =
        resumeImportMode === 'replace'
          ? nextEdu
          : mergeUniqueByKey(prevEdu, nextEdu, (e) => `${e.school}::${e.degree}::${e.period}`.toLowerCase());
      return { ...prev, experience: exp, education };
    });
    setToast({ show: true, message: '[OK] ✔ Resume import applied to Experience/Education — hit Save Changes to persist' });
    setTimeout(() => setToast({ show: false, message: '' }), 5000);
  };

  const openJobDetails = async (jobId: number) => {
    setJobDetailsOpen(true);
    setJobDetails(null);
    setJobDetailsError(null);
    setJobDetailsLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load job');
      setJobDetails(json);
    } catch (e: any) {
      setJobDetailsError(e?.message || 'Failed to load job');
    } finally {
      setJobDetailsLoading(false);
    }
  };

  const openDeleteConfirm = (id: number, company: string, title: string) => {
    setDeleteTarget({ id, company, title });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteJob = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/job/${deleteTarget.id}/delete`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to delete');

      // Refresh data
      const refreshRes = await fetch('/api/data');
      if (refreshRes.ok) {
        const freshData = await refreshRes.json();
        setData(freshData);
      }

      setToast({ show: true, message: `[OK] ✔ Deleted ${deleteTarget.company} — ${deleteTarget.title}` });
      setTimeout(() => setToast({ show: false, message: '' }), 3000);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setToast({ show: true, message: `[ERR] ✗ Delete failed: ${e?.message || 'Unknown error'}` });
      setTimeout(() => setToast({ show: false, message: '' }), 5000);
    } finally {
      setDeleteLoading(false);
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
            {data?.meta?.lastRunId && (
              <div className="mt-3 text-[10px] font-mono text-[#a8a29e] uppercase tracking-[0.2em]">
                Last run: <span className="text-[#1c1917] font-bold">{String(data.meta.lastRunScript || '').replace('.mjs', '')}</span>{' '}
                <span className="text-[#a8a29e]">·</span>{' '}
                <span className="text-[#1c1917] font-bold">{String(data.meta.lastRunStatus || '')}</span>{' '}
                {data?.meta?.lastRunUrl && (
                  <>
                    <span className="text-[#a8a29e]">·</span>{' '}
                    <a
                      href={data.meta.lastRunUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 hover:text-[#1c1917]"
                    >
                      logs
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4">
             <button
               onClick={() => setIsSearchOpen((v) => !v)}
               className={`px-5 py-2.5 border rounded-xl transition-colors flex items-center gap-2 text-sm font-bold ${
                 isSearchOpen || searchQuery.trim()
                   ? 'bg-white border-[#1c1917] text-[#1c1917]'
                   : 'bg-[#f5f5f4] border border-[#e7e5e4] hover:bg-[#e7e5e4] text-[#1c1917]'
               }`}
             >
                <Search size={16} />
                <span>{searchQuery.trim() ? 'Searching' : 'Search'}</span>
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

        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-10"
            >
              <div className="flex items-center gap-3 bg-[#faf9f6] border border-[#e7e5e4] rounded-2xl px-4 py-3">
                <Search size={16} className="text-[#a8a29e]" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search pipeline, applications, docs..."
                  className="flex-1 bg-transparent outline-none text-sm font-medium text-[#1c1917] placeholder:text-[#a8a29e]"
                />
                {searchQuery.trim() && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-1.5 rounded-xl border border-[#e7e5e4] text-[10px] font-bold uppercase tracking-widest text-[#1c1917] hover:bg-white transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-2 text-[10px] font-mono text-[#a8a29e] uppercase tracking-[0.2em]">
                Results: {filteredPipeline.length} pipeline · {filteredApplications.length} applications · {filteredDocs.length} docs
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10 sm:mb-12">
          <StatCard
            icon={<Clock size={18} className="text-white" />}
            label="Ongoing"
            value={data?.stats?.applied || 0}
            color="stone"
          />
          <StatCard
            icon={<CheckCircle2 size={18} className="text-white" />}
            label="Interviews"
            value={data?.stats?.interviews || 0}
            color="emerald"
          />
          <StatCard
            icon={<FileText size={18} className="text-white" />}
            label="Saved PDFs"
            value={data?.pdfs?.length || 0}
            color="blue"
          />
          <StatCard
            icon={<Search size={18} className="text-white" />}
            label="In Pipeline"
            value={data?.pipeline?.length || 0}
            color="amber"
          />
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
                    {filteredApplications.map((app: any, i: number) => (
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setActiveTab('terminal'); runCommand(`apply ${app.job_id} --deep`); }}
                              className="p-2 border border-[#e7e5e4] rounded-lg hover:bg-[#1c1917] hover:text-white transition-all"
                            >
                              <Play size={14} />
                            </button>
                            {app?.url && (
                              <a
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 border border-[#e7e5e4] rounded-lg hover:bg-[#f5f5f4] transition-all"
                                title="Open posting"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            {app?.job_id && (
                              <button
                                onClick={() => openJobDetails(Number(app.job_id))}
                                className="p-2 border border-[#e7e5e4] rounded-lg hover:bg-[#f5f5f4] transition-all"
                                title="Details"
                              >
                                <FileText size={14} />
                              </button>
                            )}
                          </div>
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
                    {filteredPipeline.map((job: any, i: number) => (
                      <tr key={i} className="hover:bg-[#faf9f6] transition-colors">
                        <td className="px-8 py-6">
                           <div className="font-bold text-[#1c1917]">{job.company}</div>
                           {job?.url ? (
                             <a
                               href={job.canonical_url || job.url}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="text-[10px] font-bold text-[#a8a29e] hover:text-[#1c1917] transition-colors inline-flex items-center gap-2"
                             >
                               <ExternalLink size={12} />
                               <span>{String(job.canonical_url || job.url).substring(0, 34)}...</span>
                             </a>
                           ) : (
                             <span className="text-[10px] font-bold text-[#a8a29e]">—</span>
                           )}
                        </td>
                        <td className="px-8 py-6 text-[#78716c] font-medium">{job.title || 'Unknown Role'}</td>
                        <td className="px-8 py-6 font-mono font-bold text-[#1c1917]">{job.score}</td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            {job?.is_tailored && (
                              <span className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                                Tailored
                              </span>
                            )}
                            <button
                              onClick={() => { setActiveTab('terminal'); runCommand(`tailor ${job.pipeline_id} --deep`); }}
                              className="px-4 py-2 bg-[#1c1917] text-white rounded-xl font-bold text-xs hover:bg-[#27272a] transition-all"
                            >
                              Tailor
                            </button>
                            <button
                              onClick={() => { setActiveTab('terminal'); runCommand(`apply ${job.pipeline_id} --deep`); }}
                              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                                job?.is_tailored
                                  ? 'bg-white border border-[#e7e5e4] text-[#1c1917] hover:bg-[#f5f5f4]'
                                  : 'bg-white border border-[#e7e5e4] text-[#1c1917] hover:bg-[#f5f5f4]'
                              }`}
                            >
                              {job?.is_tailored ? 'Apply (optional)' : 'Apply'}
                            </button>
                            <button
                              onClick={() => openJobDetails(Number(job.pipeline_id))}
                              className="px-4 py-2 bg-[#f5f5f4] border border-[#e7e5e4] text-[#1c1917] rounded-xl font-bold text-xs hover:bg-[#e7e5e4] transition-all"
                            >
                              Details
                            </button>
                          </div>
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
               <div className="bg-[#faf9f6] border border-[#e7e5e4] rounded-[2rem] sm:rounded-[2.5rem] p-3 sm:p-6 lg:p-8 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[#1c1917] rounded-xl">
                        <FileText size={16} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-[#1c1917] text-sm sm:text-base">Generated Documents</h3>
                        <p className="text-[10px] text-[#a8a29e] hidden sm:block">Tailored resumes and cover letters</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-white border border-[#e7e5e4] rounded-full text-[10px] sm:text-xs font-bold text-[#78716c]">
                      {filteredDocs.length} {filteredDocs.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <div className="space-y-3 overflow-y-auto flex-1">
                    {filteredDocs.length === 0 ? (
                      <div className="text-center py-12 px-4">
                        <div className="w-16 h-16 mx-auto mb-4 bg-[#f5f5f4] rounded-2xl flex items-center justify-center">
                          <FileText size={24} className="text-[#a8a29e]" />
                        </div>
                        <p className="text-sm font-medium text-[#78716c]">No documents yet</p>
                        <p className="text-xs text-[#a8a29e] mt-1">Run tailor to generate resumes</p>
                      </div>
                    ) : (
                      filteredDocs.map((doc: any, i: number) => (
                        <div
                          key={i}
                          className="group bg-white rounded-2xl border border-[#e7e5e4] hover:border-[#1c1917] hover:shadow-lg transition-all duration-200 overflow-hidden"
                        >
                          {/* Card Header */}
                          <div className="p-3 sm:p-4 border-b border-[#f5f5f4] bg-gradient-to-r from-white to-[#faf9f6]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  <span className="truncate text-sm font-bold text-[#1c1917]">
                                    {doc.company}
                                  </span>
                                </div>
                                <div className="truncate text-xs text-[#78716c] pl-4">
                                  {doc.title}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {doc?.url && (
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg hover:bg-[#f5f5f4] transition-all text-[#78716c] hover:text-[#1c1917]"
                                    title="Open job posting"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                                <button
                                  onClick={() => openDeleteConfirm(Number(doc.id), doc.company, doc.title)}
                                  className="p-2 rounded-lg hover:bg-rose-50 transition-all text-[#a8a29e] hover:text-rose-600"
                                  title="Delete job and documents"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="p-2 sm:p-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {/* Resume PDF */}
                              {doc.has_resume_pdf ? (
                                <a
                                  href={`/api/view/${doc.id}?format=pdf&download=1`}
                                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-bold hover:bg-[#27272a] hover:shadow-md transition-all"
                                >
                                  <FileText size={14} />
                                  <span>Resume</span>
                                </a>
                              ) : (
                                <span className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#f5f5f4] text-[#a8a29e] text-xs font-bold cursor-not-allowed">
                                  <FileText size={14} />
                                  <span>—</span>
                                </span>
                              )}

                              {/* Cover Letter PDF */}
                              {doc.has_cover_letter_pdf ? (
                                <a
                                  href={`/api/view/${doc.id}?type=cl&format=pdf&download=1`}
                                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#1c1917] text-white text-xs font-bold hover:bg-[#27272a] hover:shadow-md transition-all"
                                >
                                  <FileText size={14} />
                                  <span>Cover</span>
                                </a>
                              ) : (
                                <span className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#f5f5f4] text-[#a8a29e] text-xs font-bold cursor-not-allowed">
                                  <FileText size={14} />
                                  <span>—</span>
                                </span>
                              )}

                              {/* HTML */}
                              <a
                                href={`/api/view/${doc.id}?download=1`}
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e7e5e4] text-[#1c1917] text-xs font-bold hover:bg-[#f5f5f4] hover:border-[#1c1917] transition-all"
                              >
                                <FileText size={14} />
                                <span>HTML</span>
                              </a>

                              {/* View */}
                              <a
                                href={`/api/view/${doc.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#e7e5e4] text-[#78716c] text-xs font-bold hover:bg-[#f5f5f4] hover:text-[#1c1917] hover:border-[#1c1917] transition-all"
                              >
                                <ExternalLink size={14} />
                                <span>View</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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
                   <div className="select-text">
                     <pre className="font-mono text-[10px] sm:text-xs text-[#a8a29e] mb-6 leading-tight">
{`   _____                           ____            
  / ___/___ _________  ___  _____ / __ \\____  _____
 / /__ / __ \`/ ___/ _ \\/ _ \\/ ___// / / / __ \\/ ___/
/ /___/ /_/ / /  /  __/  __/ /   / /_/ / /_/ (__  ) 
\\____/\\__,_/_/   \\___/\\___/_/    \\____/ .___/____/  
                                     /_/            
System Initialized — v2.0`}
                     </pre>
                     <div className="text-[#78716c] space-y-2 mb-4">
                       <p><strong className="text-[#57534e]">1. scan --deep</strong> <span className="text-[#a8a29e]">→</span> Auto-discover new job matches</p>
                       <p><strong className="text-[#57534e]">2. rank --deep</strong> <span className="text-[#a8a29e]">→</span> Score and rank discovered roles</p>
                       <p><strong className="text-[#57534e]">3. tailor &lt;id&gt; --deep</strong> <span className="text-[#a8a29e]">→</span> Generate hyper-custom Resumes & Cover Letters</p>
                       <p><strong className="text-[#57534e]">4. apply &lt;id&gt; --deep</strong> <span className="text-[#a8a29e]">→</span> Automatically apply to role</p>
                       <br/>
                       <p><strong className="text-[#57534e]">help</strong>        <span className="text-[#a8a29e]">→</span> View full command reference</p>
                       <br/>
                       <p className="text-[#a8a29e]"><kbd className="px-1 py-0.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded text-[9px]">↑</kbd> <kbd className="px-1 py-0.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded text-[9px]">↓</kbd> History • <kbd className="px-1 py-0.5 bg-[#f5f5f4] border border-[#e7e5e4] rounded text-[9px]">Ctrl+C</kbd> Clear line</p>
                     </div>
                     <div className="text-[#a8a29e] italic mt-4">Awaiting input...</div>
                   </div>
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
                         placeholder="scan / apply <id> / help (Ctrl+C to clear)"
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
                   {/* Profile Completion Indicator */}
                   {(() => {
                     const fields = ['full_name', 'email', 'location', 'phone', 'linkedin'];
                     const filled = fields.filter(f => profileFormData.candidate?.[f]?.trim()).length;
                     const percent = Math.round((filled / fields.length) * 100);
                     return (
                       <div className="mb-5 bg-[#faf9f6] rounded-2xl p-4 border border-[#e7e5e4]">
                         <div className="flex items-center justify-between mb-2">
                           <span className="text-xs font-bold text-[#1c1917] uppercase tracking-wider">Profile Completion</span>
                           <span className={`text-xs font-bold ${percent === 100 ? 'text-emerald-600' : 'text-[#78716c]'}`}>{percent}%</span>
                         </div>
                         <div className="h-2 bg-[#e7e5e4] rounded-full overflow-hidden">
                           <div
                             className={`h-full rounded-full transition-all duration-500 ${percent === 100 ? 'bg-emerald-500' : 'bg-[#1c1917]'}`}
                             style={{ width: `${percent}%` }}
                           />
                         </div>
                         <p className="text-[10px] text-[#a8a29e] mt-2">
                           {percent === 100 ? '✓ All essential fields completed' : `${5 - filled} field${5 - filled === 1 ? '' : 's'} remaining for a complete profile`}
                         </p>
                       </div>
                     );
                   })()}

                   {/* Essential Info Card */}
                   <div className="bg-white rounded-2xl border border-[#e7e5e4] p-4 mb-4">
                     <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#f5f5f4]">
                       <div className="w-8 h-8 bg-[#1c1917] rounded-lg flex items-center justify-center">
                         <span className="text-white text-xs font-bold">01</span>
                       </div>
                       <span className="text-sm font-bold text-[#1c1917]">Essential Information</span>
                       <span className="text-[10px] text-rose-500 font-medium ml-auto">Required</span>
                     </div>

                     <div className="space-y-4">
                       <Input
                         label="Full Name"
                         value={profileFormData.candidate.full_name}
                         onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, full_name: v}})}
                         placeholder="John Doe"
                         required
                       />
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <Input
                           label="Email Address"
                           type="email"
                           value={profileFormData.candidate.email}
                           onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, email: v}})}
                           placeholder="john@example.com"
                           required
                         />
                         <Input
                           label="Phone Number"
                           type="tel"
                           value={profileFormData.candidate.phone}
                           onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, phone: v}})}
                           placeholder="+1 (555) 123-4567"
                         />
                       </div>
                       <Input
                         label="Location"
                         value={profileFormData.candidate.location}
                         onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, location: v}})}
                         placeholder="San Francisco, CA"
                         hint="City, State/Country format"
                       />
                     </div>
                   </div>

                   {/* Online Presence Card */}
                   <div className="bg-white rounded-2xl border border-[#e7e5e4] p-4">
                     <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#f5f5f4]">
                       <div className="w-8 h-8 bg-[#78716c] rounded-lg flex items-center justify-center">
                         <span className="text-white text-xs font-bold">02</span>
                       </div>
                       <span className="text-sm font-bold text-[#1c1917]">Online Presence</span>
                       <span className="text-[10px] text-[#a8a29e] font-medium ml-auto">Recommended</span>
                     </div>

                     <div className="space-y-4">
                       <Input
                         label="LinkedIn Profile"
                         value={profileFormData.candidate.linkedin}
                         onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, linkedin: v}})}
                         placeholder="linkedin.com/in/johndoe"
                         hint="Just the path: linkedin.com/in/username"
                       />
                       <Input
                         label="GitHub / Portfolio"
                         value={profileFormData.candidate.github}
                         onChange={(v) => setProfileFormData({...profileFormData, candidate: {...profileFormData.candidate, github: v}})}
                         placeholder="github.com/johndoe or johndoe.com"
                         hint="Used as portfolio link on resume"
                       />
                     </div>
                   </div>

                   {/* Quick Preview */}
                   {profileFormData.candidate.full_name && (
                     <div className="mt-4 bg-[#faf9f6] rounded-2xl p-4 border border-[#e7e5e4]">
                       <p className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-wider mb-2">Resume Header Preview</p>
                       <div className="text-sm font-bold text-[#1c1917]">{profileFormData.candidate.full_name}</div>
                       <div className="text-xs text-[#78716c] mt-1">
                         {[
                           profileFormData.candidate.location,
                           profileFormData.candidate.email,
                           profileFormData.candidate.phone
                         ].filter(Boolean).join(' • ') || 'Add location, email, and phone'}
                       </div>
                       {(profileFormData.candidate.linkedin || profileFormData.candidate.github) && (
                         <div className="text-[10px] text-[#a8a29e] mt-2">
                           {[
                             profileFormData.candidate.linkedin && `linkedin.com/in/${profileFormData.candidate.linkedin.replace(/^.*\//, '')}`,
                             profileFormData.candidate.github && (profileFormData.candidate.github.includes('/') ? profileFormData.candidate.github : `github.com/${profileFormData.candidate.github}`)
                           ].filter(Boolean).join(' • ')}
                         </div>
                       )}
                     </div>
                   )}
                 </ConfigSection>

                 <ConfigSection title="Resume Import" icon={<Upload size={18} className="text-[#1c1917]" />}>
                   <div className="space-y-5">
                     {/* Upload Area - Drop Zone Style */}
                     <div
                       className={`relative border-2 border-dashed rounded-2xl p-6 transition-all duration-200 ${
                         resumeImportStatus === 'uploading'
                           ? 'border-emerald-400 bg-emerald-50'
                           : resumeImportStatus === 'error'
                             ? 'border-rose-400 bg-rose-50'
                             : resumeImportStatus === 'ready'
                               ? 'border-emerald-500 bg-emerald-50'
                               : 'border-[#e7e5e4] hover:border-[#1c1917] hover:bg-[#faf9f6]'
                       }`}
                     >
                       <div className="text-center">
                         <div className={`w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center transition-colors ${
                           resumeImportStatus === 'ready'
                             ? 'bg-emerald-100'
                             : resumeImportStatus === 'error'
                               ? 'bg-rose-100'
                               : 'bg-[#f5f5f4]'
                         }`}>
                           {resumeImportStatus === 'uploading' ? (
                             <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                           ) : resumeImportStatus === 'ready' ? (
                             <CheckCircle2 size={24} className="text-emerald-600" />
                           ) : resumeImportStatus === 'error' ? (
                             <AlertTriangle size={24} className="text-rose-600" />
                           ) : (
                             <Upload size={24} className="text-[#78716c]" />
                           )}
                         </div>

                         <p className="text-sm font-bold text-[#1c1917] mb-1">
                           {resumeImportStatus === 'uploading' && 'Analyzing resume...'}
                           {resumeImportStatus === 'ready' && 'Resume analyzed successfully'}
                           {resumeImportStatus === 'error' && 'Import failed'}
                           {resumeImportStatus === 'idle' && 'Upload your resume (PDF or DOCX)'}
                         </p>
                         <p className="text-xs text-[#78716c] mb-4">
                           {resumeImportStatus === 'idle' && 'We\'ll extract Experience and Education automatically'}
                           {resumeImportStatus === 'ready' && `Found ${(resumeImport?.experience || []).length} experience entries and ${(resumeImport?.education || []).length} education entries`}
                           {resumeImportStatus === 'error' && (resumeImport?.error || 'Unknown error')}
                         </p>

                         {resumeImportStatus !== 'uploading' && (
                           <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1c1917] text-white text-xs font-bold rounded-xl hover:bg-[#27272a] transition-colors cursor-pointer">
                             <Upload size={14} />
                             <span>{resumeImportStatus === 'ready' ? 'Upload different resume' : 'Choose file'}</span>
                             <input
                               type="file"
                               accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                               onChange={(e) => {
                                 const f = e.target.files?.[0];
                                if (f) handleResumeImportFile(f);
                                // Allow selecting the same file again (otherwise no change event → no network request)
                                e.currentTarget.value = '';
                               }}
                               className="hidden"
                             />
                           </label>
                         )}
                       </div>
                     </div>

                     {/* Import Mode Selection */}
                     <div className="bg-[#faf9f6] rounded-2xl p-4 border border-[#e7e5e4]">
                       <div className="flex items-center justify-between mb-3">
                         <span className="text-xs font-bold text-[#1c1917] uppercase tracking-wider">Import Mode</span>
                         <span className="text-[10px] text-[#a8a29e] bg-white px-2 py-1 rounded-lg border border-[#e7e5e4]">
                           {resumeImportMode === 'merge' ? 'Add to existing' : 'Replace all'}
                         </span>
                       </div>

                       <div className="grid grid-cols-2 gap-3">
                         {/* Merge Option */}
                         <button
                           type="button"
                           onClick={() => setResumeImportMode('merge')}
                           className={`p-4 rounded-xl border text-left transition-all ${
                             resumeImportMode === 'merge'
                               ? 'bg-white border-[#1c1917] shadow-sm'
                               : 'bg-white border-[#e7e5e4] hover:border-[#1c1917]'
                           }`}
                         >
                           <div className="flex items-center gap-2 mb-2">
                             <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                               resumeImportMode === 'merge' ? 'border-[#1c1917] bg-[#1c1917]' : 'border-[#e7e5e4]'
                             }`}>
                               {resumeImportMode === 'merge' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                             </div>
                             <span className="text-sm font-bold text-[#1c1917]">Merge</span>
                           </div>
                           <p className="text-[10px] text-[#78716c] leading-relaxed">
                             Keep existing entries and add new ones from resume. No duplicates.
                           </p>
                         </button>

                         {/* Replace Option */}
                         <button
                           type="button"
                           onClick={() => setResumeImportMode('replace')}
                           className={`p-4 rounded-xl border text-left transition-all ${
                             resumeImportMode === 'replace'
                               ? 'bg-white border-rose-500 shadow-sm'
                               : 'bg-white border-[#e7e5e4] hover:border-rose-400'
                           }`}
                         >
                           <div className="flex items-center gap-2 mb-2">
                             <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                               resumeImportMode === 'replace' ? 'border-rose-500 bg-rose-500' : 'border-[#e7e5e4]'
                             }`}>
                               {resumeImportMode === 'replace' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                             </div>
                             <span className="text-sm font-bold text-[#1c1917]">Replace</span>
                           </div>
                           <p className="text-[10px] text-[#78716c] leading-relaxed">
                             Delete all existing entries. Use only what's in the uploaded resume.
                           </p>
                         </button>
                       </div>
                     </div>

                     {/* Action Button */}
                     {resumeImportStatus === 'ready' && (
                       <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
                         <div className="flex items-start gap-3 mb-4">
                           <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                             <CheckCircle2 size={16} className="text-emerald-600" />
                           </div>
                           <div>
                             <p className="text-sm font-bold text-emerald-800">Ready to import</p>
                             <p className="text-xs text-emerald-600 mt-0.5">
                               This will {resumeImportMode === 'merge' ? 'add to' : 'replace'} your current Experience and Education sections
                             </p>
                           </div>
                         </div>
                         <button
                           type="button"
                           onClick={applyResumeImport}
                           className="w-full px-4 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                         >
                           <Upload size={16} />
                           Apply Import
                         </button>
                         {!!resumeImport?.raw_text_preview && (
                           <details className="mt-3 border-t border-emerald-200 pt-3">
                             <summary className="cursor-pointer text-xs font-bold text-emerald-700 flex items-center gap-2">
                               <FileText size={12} />
                               Preview extracted text
                             </summary>
                             <pre className="mt-3 text-[10px] whitespace-pre-wrap text-emerald-800 font-mono bg-emerald-100/50 rounded-xl p-3 max-h-40 overflow-y-auto">
                               {resumeImport.raw_text_preview}
                             </pre>
                           </details>
                         )}
                       </div>
                     )}
                   </div>
                 </ConfigSection>

                 <ConfigSection title="Experience" icon={<Briefcase size={18} className="text-[#1c1917]" />}>
                   <div className="space-y-4">
                     {(profileFormData.experience || []).map((exp: any, idx: number) => (
                       <div key={idx} className="p-5 bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl">
                         <div className="flex items-start justify-between gap-4 mb-4">
                           <div className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest">
                             Role {idx + 1}
                           </div>
                           <button
                             onClick={() =>
                               setProfileFormData({
                                 ...profileFormData,
                                 experience: (profileFormData.experience || []).filter((_: any, i: number) => i !== idx),
                               })
                             }
                             className="text-[10px] font-bold uppercase tracking-widest text-rose-700 hover:underline underline-offset-4"
                           >
                             Remove
                           </button>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                           <Input
                             label="Company"
                             value={exp.company || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.experience || [])];
                               next[idx] = { ...(next[idx] || {}), company: v };
                               setProfileFormData({ ...profileFormData, experience: next });
                             }}
                           />
                           <Input
                             label="Role"
                             value={exp.role || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.experience || [])];
                               next[idx] = { ...(next[idx] || {}), role: v };
                               setProfileFormData({ ...profileFormData, experience: next });
                             }}
                           />
                         </div>
                         <div className="grid grid-cols-2 gap-4 mt-4">
                           <Input
                             label="Period (e.g., 2022–Present)"
                             value={exp.period || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.experience || [])];
                               next[idx] = { ...(next[idx] || {}), period: v };
                               setProfileFormData({ ...profileFormData, experience: next });
                             }}
                           />
                           <Input
                             label="Location (optional)"
                             value={exp.location || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.experience || [])];
                               next[idx] = { ...(next[idx] || {}), location: v };
                               setProfileFormData({ ...profileFormData, experience: next });
                             }}
                           />
                         </div>

                         <div className="mt-4">
                           <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest mb-2 block">
                             Bullets (one per line)
                           </label>
                           <textarea
                             rows={5}
                             value={(Array.isArray(exp.bullets) ? exp.bullets : []).join('\n')}
                             onChange={(e) => {
                               const next = [...(profileFormData.experience || [])];
                               const bullets = e.target.value
                                 .split('\n')
                                 .map((s) => s.trim())
                                 .filter(Boolean);
                               next[idx] = { ...(next[idx] || {}), bullets };
                               setProfileFormData({ ...profileFormData, experience: next });
                             }}
                             className="w-full bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl p-4 outline-none focus:border-[#1c1917] transition-all text-sm font-medium leading-relaxed"
                           />
                         </div>
                       </div>
                     ))}

                     <button
                       onClick={() =>
                         setProfileFormData({
                           ...profileFormData,
                           experience: [
                             ...(profileFormData.experience || []),
                             { company: '', role: '', period: '', bullets: [] },
                           ],
                         })
                       }
                       className="w-full px-6 py-3 rounded-2xl border border-[#e7e5e4] bg-white hover:bg-[#f5f5f4] transition-colors text-sm font-bold text-[#1c1917]"
                     >
                       Add Experience
                     </button>
                   </div>
                 </ConfigSection>

                 <ConfigSection title="Education" icon={<FileText size={18} className="text-[#1c1917]" />}>
                   <div className="space-y-4">
                     {(profileFormData.education || []).map((edu: any, idx: number) => (
                       <div key={idx} className="p-5 bg-[#faf9f6]/50 border border-[#e7e5e4] rounded-2xl">
                         <div className="flex items-start justify-between gap-4 mb-4">
                           <div className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest">
                             Entry {idx + 1}
                           </div>
                           <button
                             onClick={() =>
                               setProfileFormData({
                                 ...profileFormData,
                                 education: (profileFormData.education || []).filter((_: any, i: number) => i !== idx),
                               })
                             }
                             className="text-[10px] font-bold uppercase tracking-widest text-rose-700 hover:underline underline-offset-4"
                           >
                             Remove
                           </button>
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                           <Input
                             label="School"
                             value={edu.school || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.education || [])];
                               next[idx] = { ...(next[idx] || {}), school: v };
                               setProfileFormData({ ...profileFormData, education: next });
                             }}
                           />
                           <Input
                             label="Degree"
                             value={edu.degree || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.education || [])];
                               next[idx] = { ...(next[idx] || {}), degree: v };
                               setProfileFormData({ ...profileFormData, education: next });
                             }}
                           />
                         </div>
                         <div className="grid grid-cols-2 gap-4 mt-4">
                           <Input
                             label="Period (e.g., 2016–2020)"
                             value={edu.period || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.education || [])];
                               next[idx] = { ...(next[idx] || {}), period: v };
                               setProfileFormData({ ...profileFormData, education: next });
                             }}
                           />
                           <Input
                             label="Location (optional)"
                             value={edu.location || ''}
                             onChange={(v) => {
                               const next = [...(profileFormData.education || [])];
                               next[idx] = { ...(next[idx] || {}), location: v };
                               setProfileFormData({ ...profileFormData, education: next });
                             }}
                           />
                         </div>
                       </div>
                     ))}
                     <button
                       onClick={() =>
                         setProfileFormData({
                           ...profileFormData,
                           education: [...(profileFormData.education || []), { school: '', degree: '', period: '' }],
                         })
                       }
                       className="w-full px-6 py-3 rounded-2xl border border-[#e7e5e4] bg-white hover:bg-[#f5f5f4] transition-colors text-sm font-bold text-[#1c1917]"
                     >
                       Add Education
                     </button>
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

      {/* Job Details Modal */}
      <AnimatePresence>
        {jobDetailsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[90] flex items-center justify-center p-6"
            onClick={() => setJobDetailsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="w-full max-w-4xl bg-white rounded-[2rem] border border-[#e7e5e4] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-[#e7e5e4] flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-mono text-[#a8a29e] uppercase tracking-[0.2em]">Job details</div>
                  <div className="text-xl font-bold text-[#1c1917] mt-1 truncate">
                    {jobDetails?.company ? `${jobDetails.company} · ${jobDetails.title}` : 'Loading…'}
                  </div>
                  {jobDetails?.url && (
                    <a
                      href={jobDetails.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-[#1c1917] underline underline-offset-4"
                    >
                      <ExternalLink size={14} />
                      Open posting
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setJobDetailsOpen(false)}
                  className="p-2 rounded-xl hover:bg-[#f5f5f4] transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {jobDetailsLoading && (
                  <div className="text-sm font-medium text-[#78716c]">Loading job description…</div>
                )}
                {jobDetailsError && (
                  <div className="text-sm font-bold text-rose-700">Error: {jobDetailsError}</div>
                )}
                {!jobDetailsLoading && !jobDetailsError && (
                  <>
                    <div className="text-[10px] font-mono text-[#a8a29e] uppercase tracking-[0.2em] mb-3">
                      Job description
                    </div>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-[#1c1917]">
                      {jobDetails?.jd_text || 'No JD captured yet. Run Tailor to scrape and persist it.'}
                    </pre>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmOpen && deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[95] flex items-center justify-center p-4 sm:p-6"
            onClick={() => !deleteLoading && setDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white rounded-3xl border border-rose-200 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-rose-50 to-white border-b border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                    <AlertTriangle size={24} className="text-rose-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1c1917] text-lg">Delete Job?</h3>
                    <p className="text-xs text-[#78716c]">This action cannot be undone</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-sm text-[#78716c] mb-4">
                  You are about to delete:
                </p>
                <div className="bg-[#faf9f6] rounded-2xl p-4 border border-[#e7e5e4]">
                  <div className="font-bold text-[#1c1917] mb-1">{deleteTarget.company}</div>
                  <div className="text-xs text-[#78716c]">{deleteTarget.title}</div>
                </div>
                <p className="text-xs text-[#a8a29e] mt-4">
                  This will remove the job from your pipeline and delete all associated documents (resumes, cover letters, and job description).
                </p>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-[#e7e5e4] flex gap-3">
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  disabled={deleteLoading}
                  className="flex-1 px-4 py-3 rounded-xl border border-[#e7e5e4] text-[#78716c] font-bold text-sm hover:bg-[#f5f5f4] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteJob}
                  disabled={deleteLoading}
                  className="flex-1 px-4 py-3 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-[100] bg-[#1c1917] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <CheckCircle2 size={20} className="text-[#f59e0b]" />
            <span className="text-sm font-bold tracking-wide">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

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

function StatCard({ icon, label, value, color = 'stone' }: { icon: any, label: string, value: any, color?: 'stone' | 'emerald' | 'blue' | 'amber' }) {
  const colorClasses = {
    stone: 'bg-[#1c1917]',
    emerald: 'bg-emerald-600',
    blue: 'bg-blue-600',
    amber: 'bg-amber-500'
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#e7e5e4] hover:border-[#1c1917] hover:shadow-lg transition-all group">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 ${colorClasses[color]} rounded-xl text-white shadow-sm`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">{label}</span>
      </div>
      <div className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1c1917]">{value}</div>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  required
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest block pl-1">
          {label}
          {required && <span className="text-rose-500 ml-1">*</span>}
        </label>
        {hint && <span className="text-[9px] text-[#a8a29e] italic">{hint}</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-[#faf9f6]/50 border rounded-2xl p-4 outline-none focus:border-[#1c1917] transition-all text-sm font-bold text-[#1c1917] ${
          value?.trim() ? 'border-[#e7e5e4]' : required ? 'border-rose-200 focus:border-rose-400' : 'border-[#e7e5e4]'
        }`}
        placeholder={placeholder}
        required={required}
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
