// Access data provided by pipeline_data.js
const RAW_JOBS = window.PIPELINE_JOBS || [];

// Add a quick ID mapped from url since url is unique
const MOCK_JOBS = RAW_JOBS.map((job, idx) => ({
  ...job,
  id: job.url ? btoa(job.url).substring(0, 10).replace(/[^a-zA-Z0-9]/g, '') : `job-${idx}`,
  location: 'Not Specified', 
  experience: 'Not Specified', 
  tags: [job.portal.toLowerCase(), 'remote'],
}));

const COMMAND_LIST = [
  { id: 'scan', label: 'Scan Portals', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  { id: 'verify', label: 'Verify Pipeline', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
  { id: 'normalize', label: 'Normalize Status', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
  { id: 'dedup', label: 'Deduplicate', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg> },
  { id: 'merge', label: 'Merge Trackers', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> },
  { id: 'pdf', label: 'Generate PDF', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { id: 'sync-check', label: 'CV Sync Check', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
  { id: 'liveness', label: 'Liveness Check', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
  { id: 'doctor', label: 'System Doctor', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
  { id: 'update:check', label: 'Check Update', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 16 16 12 12 8"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
  { id: 'update', label: 'Apply Update', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
  { id: 'rollback', label: 'Rollback System', icon: <svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12a10 10 0 1 0 10-10 1 1 0 0 0-.25.03"/><path d="M3 2v6h6"/><path d="M3 8s3-5 9-5"/></svg> }
];

const BookmarkIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="18" cy="5" r="3"></circle>
    <circle cx="6" cy="12" r="3"></circle>
    <circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>
);

const JobIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
    <line x1="4" y1="22" x2="4" y2="15"></line>
  </svg>
);

const LocationIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const ExperienceIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" className="icon-skills">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
)

const ListIcon = () => (
  <svg viewBox="0 0 24 24">
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

const TerminalIcon = () => (
  <svg viewBox="0 0 24 24" style={{width: 18, height: 18, marginRight: 6, display: 'inline-block', verticalAlign: 'text-bottom'}}>
    <polyline points="4 17 10 11 4 5"></polyline>
    <line x1="12" y1="19" x2="20" y2="19"></line>
  </svg>
);


const PipelineDashboard = () => {
  const [jobs, setJobs] = React.useState(MOCK_JOBS);
  const [viewState, setViewState] = React.useState('list');
  const [activeTab, setActiveTab] = React.useState('control');

  // Track Real Historical Applications
  const [historyApps, setHistoryApps] = React.useState([]);
  const [hasFetchedApps, setHasFetchedApps] = React.useState(false);

  React.useEffect(() => {
    if (activeTab === 'applied' && !hasFetchedApps) {
      fetch('/api/applications')
        .then(res => res.json())
        .then(data => {
          setHistoryApps(data);
          setHasFetchedApps(true);
        })
        .catch(err => console.error("Error loading applications.md", err));
    }
  }, [activeTab, hasFetchedApps]);

  // Filters State
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCompany, setFilterCompany] = React.useState('');
  const [filterPortal, setFilterPortal] = React.useState('');
  
  // Terminal State
  const [logs, setLogs] = React.useState(["> Career-Ops Local Dashboard Node Active.", "> Select a command above to execute..."]);
  const [isRunning, setIsRunning] = React.useState(false);

  // Dropdown options
  const companies = [...new Set(jobs.map(j => j.company))].sort();
  const portals = [...new Set(jobs.map(j => j.portal))].sort();

  // Filter application
  let filteredJobs = jobs.filter(j => j.status === activeTab);

  if (activeTab !== 'control') {
    if (searchQuery) {
      filteredJobs = filteredJobs.filter(j => 
        j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.company.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filterCompany) {
      filteredJobs = filteredJobs.filter(j => j.company === filterCompany);
    }
    if (filterPortal) {
      filteredJobs = filteredJobs.filter(j => j.portal === filterPortal);
    }
  }

  const handleApply = (jobId) => {
    setJobs(jobs.map(job => 
      job.id === jobId ? { ...job, status: 'applied' } : job
    ));
    const jobUrl = jobs.find(j => j.id === jobId)?.url;
    if(jobUrl) window.open(jobUrl, '_blank');
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterCompany('');
    setFilterPortal('');
  };

  const runCommand = async (cmdId) => {
    if(isRunning) return;
    setIsRunning(true);
    setLogs(prev => [...prev, `\n> Executing: npm run ${cmdId} ...`]);
    try {
      const response = await fetch(`/api/run/${cmdId}`, { method: 'POST' });
      const data = await response.json();

      setLogs(prev => [
         ...prev, 
         data.error ? `[ERROR] ${data.error}` : null,
         data.output ? data.output : null,
         `> Command '${cmdId}' finished.`
      ].filter(Boolean));
    } catch(err) {
      setLogs(prev => [...prev, `[ERROR] System Error: Could not connect to internal API: ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-btn control-tab ${activeTab === 'control' ? 'active' : ''}`}
          onClick={() => setActiveTab('control')}
        >
          <TerminalIcon />
          Control Center
        </button>
        <button 
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending Actions ({jobs.filter(j => j.status === 'pending').length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'applied' ? 'active' : ''}`}
          onClick={() => setActiveTab('applied')}
        >
          Applied Tracker
        </button>
      </div>

      {activeTab === 'control' ? (
        <div className="control-center-panel">
          <h2 className="control-center-header">System Control Center</h2>
          <div className="control-center-content">
            <div className="command-grid">
               {COMMAND_LIST.map(cmd => (
                 <button 
                    key={cmd.id} 
                    className="cmd-btn" 
                    disabled={isRunning}
                    onClick={() => runCommand(cmd.id)}
                 >
                   <span className="cmd-icon">{cmd.icon}</span>
                   <div className="cmd-info">
                     <div className="cmd-label">{cmd.label}</div>
                     <div className="cmd-code">npm run {cmd.id}</div>
                   </div>
                 </button>
               ))}
            </div>
  
            <div className="terminal-window">
               <div className="terminal-header">
                  <div className="mac-btns"><span></span><span></span><span></span></div>
                  Terminal Output Console
               </div>
               <pre className="terminal-body">
                 {logs.map((log, i) => (
                   <div key={i} className="log-line">{log}</div>
                 ))}
                 {isRunning && <div className="log-line blinking-cursor">█</div>}
               </pre>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filters and Controls */}
          <div className="top-controls">
            <div className="filters-group">
              <span className="filters-label">Filters:</span>
              
              <input 
                type="text" 
                placeholder="Search roles..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}
              />

              <select 
                className="select-filter" 
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
              >
                <option value="">All Companies</option>
                {companies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              <select 
                className="select-filter" 
                value={filterPortal}
                onChange={(e) => setFilterPortal(e.target.value)}
              >
                <option value="">All Portals</option>
                {portals.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <button className="btn-link" onClick={resetFilters}>Clear all</button>
            </div>

            <div className="sort-layout-group">
              <div className="filters-group">
                <span className="filters-label">Sort By:</span>
                <select className="select-filter" defaultValue="recent">
                  <option value="recent">Date Found</option>
                  <option value="company">Company</option>
                </select>
              </div>
              <div className="layout-icons">
                <button 
                  className={`icon-btn ${viewState === 'list' ? 'active' : ''}`}
                  onClick={() => setViewState('list')}
                >
                  <ListIcon />
                </button>
                <button 
                  className={`icon-btn ${viewState === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewState('grid')}
                >
                  <GridIcon />
                </button>
              </div>
            </div>
          </div>

          {/* Job List */}
          <div className={`jobs-container ${viewState}`}>
            {activeTab === 'applied' ? (
              historyApps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No historical applications found. Check applications.md.
                </div>
              ) : (
                historyApps.map(app => (
                  <div className="job-card" key={`app-${app.id}`} style={{borderLeft: '4px solid #10b981'}}>
                    <div className="job-main-info">
                      <div className="job-header">
                        <h3 className="job-title">{app.role}</h3>
                        <div className="job-actions-top">
                          <span style={{color: '#f59e0b', fontWeight: 'bold'}}>{app.score}</span>
                        </div>
                      </div>
                      
                      <div className="job-meta-row">
                        <div className="meta-item" style={{fontWeight: 600, color: 'var(--text-main)'}}>
                          <JobIcon /> {app.company}
                        </div>
                        <div className="meta-item">
                          <CalendarIcon /> {app.date}
                        </div>
                        <div className="meta-item">
                          Status: {app.status}
                        </div>
                      </div>
                      <div className="job-tags" style={{fontStyle: 'italic', marginTop: '4px'}}>
                        Notes: {app.notes}
                      </div>
                    </div>
                  </div>
                ))
              )
            ) : filteredJobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                No jobs found matching your filters.
              </div>
            ) : (
              filteredJobs.map(job => (
                <div className="job-card" key={job.id}>
                  <div className="job-main-info">
                    <div className="job-header">
                      <h3 className="job-title">{job.title}</h3>
                      <div className="job-actions-top">
                        <button title="Bookmark"><BookmarkIcon /></button>
                        <button title="Share"><ShareIcon /></button>
                      </div>
                    </div>
                    
                    <div className="job-meta-row">
                      <div className="meta-item" style={{fontWeight: 600, color: 'var(--text-main)'}}>
                        <JobIcon /> {job.company}
                      </div>
                      <div className="meta-item">
                        <LocationIcon /> {job.location}
                      </div>
                      <div className="meta-item">
                        <ExperienceIcon /> {job.experience}
                      </div>
                      <div className="meta-item">
                        <CalendarIcon /> {job.date}
                      </div>
                    </div>

                    <div className="job-tags">
                      <SettingsIcon />
                      {job.tags.join(', ')}
                    </div>
                  </div>
                  
                  <div className="job-cta">
                    <button 
                      className="btn-apply"
                      onClick={() => handleApply(job.id)}
                    >
                      Apply Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Mount app
const root = ReactDOM.createRoot(document.getElementById('react-root'));
root.render(<PipelineDashboard />);
