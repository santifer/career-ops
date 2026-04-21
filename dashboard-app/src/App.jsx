import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  LayoutDashboard, ListTodo, Briefcase, User, ExternalLink, 
  Search, Filter, RefreshCcw, CheckCircle2, XCircle, Clock
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState({
    profile: null,
    applications: [],
    pipeline: { table: [], pending: [] }
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);

  // SSE: Listen for file changes from the backend
  useEffect(() => {
    const es = new EventSource('http://localhost:3001/api/events');
    es.onmessage = (event) => {
      if (event.data === 'connected') return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'data-changed') {
          fetchData();
          showToast(`📡 Data updated (${payload.source})`);
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      // SSE will auto-reconnect
    };
    return () => es.close();
  }, [showToast]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profile, apps, pipeline] = await Promise.all([
        axios.get(`${API_BASE}/profile`),
        axios.get(`${API_BASE}/applications`),
        axios.get(`${API_BASE}/pipeline`)
      ]);
      setData({ 
        profile: profile.data, 
        applications: apps.data, 
        pipeline: pipeline.data 
      });
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  };

  const stats = [
    { label: 'Total Apps', value: data.applications.length, icon: Briefcase, color: '#3b82f6' },
    { label: 'Pipeline Jobs', value: data.pipeline.pending.length, icon: Search, color: '#f59e0b' },
    { label: 'Interviews', value: data.applications.filter(a => a.status === 'Interview').length, icon: CheckCircle2, color: '#10b981' },
    { label: 'Pending Response', value: data.applications.filter(a => a.status === 'Applied' || a.status === 'Evaluated').length, icon: Clock, color: '#8b5cf6' },
  ];

  const chartData = [
    { name: 'Evaluated', value: data.applications.filter(a => a.status === 'Evaluated').length },
    { name: 'Applied', value: data.applications.filter(a => a.status === 'Applied').length },
    { name: 'Interview', value: data.applications.filter(a => a.status === 'Interview').length },
    { name: 'Offer', value: data.applications.filter(a => a.status === 'Offer').length },
    { name: 'Rejected', value: data.applications.filter(a => a.status === 'Rejected').length },
  ];

  const COLORS = ['#60a5fa', '#34d399', '#a78bfa', '#fbbf24', '#fb7185'];

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(45deg, #3b82f6, #10b981)' }}></div>
          <h2 style={{ fontSize: '1.25rem' }}>Career-Ops</h2>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavItem active={activeTab === 'dashboard'} icon={LayoutDashboard} label="Overview" onClick={() => setActiveTab('dashboard')} />
          <NavItem active={activeTab === 'pipeline'} icon={Search} label="Pipeline" onClick={() => setActiveTab('pipeline')} />
          <NavItem active={activeTab === 'applications'} icon={Briefcase} label="Applications" onClick={() => setActiveTab('applications')} />
          <NavItem active={activeTab === 'profile'} icon={User} label="Profile" onClick={() => setActiveTab('profile')} />
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
          <button onClick={fetchData} className="nav-item" style={{ border: 'none', background: 'transparent', width: '100%', cursor: 'pointer' }}>
            <RefreshCcw size={20} />
            Refresh Data
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
              Welcome, {data.profile?.candidate?.full_name || 'Candidate'}
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>{data.profile?.narrative?.headline}</p>
            {lastUpdated && <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Last refreshed: {lastUpdated.toLocaleTimeString()}</p>}
          </div>
          <button className="btn-primary" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCcw size={18} /> Refresh
          </button>
        </header>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <RefreshCcw className="spinning" size={40} />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="fade-in">
                <div className="stats-grid">
                  {stats.map(s => (
                    <div key={s.label} className="glass-card stat-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <s.icon size={24} style={{ color: s.color }} />
                      </div>
                      <div className="stat-value">{s.value}</div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
                  <div className="glass-card">
                    <h3 style={{ marginBottom: '1.5rem' }}>Application Funnel</h3>
                    <div style={{ height: '300px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                          <YAxis stroke="var(--text-muted)" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                          />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="glass-card">
                    <h3 style={{ marginBottom: '1.5rem' }}>Recent Scanned Jobs</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {data.pipeline.pending.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No scanned jobs yet. Run a portal scan to populate the pipeline.</p>
                      ) : (
                        [...data.pipeline.pending].reverse().slice(0, 5).map((job, i) => (
                          <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{job.role}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{job.company}</div>
                            </div>
                            <a href={job.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)' }}>
                              <ExternalLink size={16} />
                            </a>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'pipeline' && (
              <div className="glass-card fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3>Found in Scans ({data.pipeline.pending.length})</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        placeholder="Search jobs..." 
                        style={{ padding: '0.5rem 1rem 0.5rem 2rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', color: 'white' }}
                      />
                    </div>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pipeline.pending.length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No pending jobs. Run a portal scan to discover new opportunities.</td></tr>
                    ) : (
                      [...data.pipeline.pending].reverse().map((job, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{job.company}</td>
                          <td>{job.role}</td>
                          <td>
                            <a href={job.url} target="_blank" rel="noreferrer" className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', textDecoration: 'none' }}>
                              Evaluate
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'applications' && (
              <div className="glass-card fade-in">
                <h3 style={{ marginBottom: '1.5rem' }}>Tracked Applications</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.applications.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No applications tracked yet. Evaluate a job to get started.</td></tr>
                    ) : (
                      data.applications.map((app, i) => (
                        <tr key={i}>
                          <td>{app['#']}</td>
                          <td>{app.company}</td>
                          <td>{app.role}</td>
                          <td style={{ fontWeight: 600, color: '#fbbf24' }}>{app.score}</td>
                          <td>
                            <span className={`status-badge status-${app.status}`}>
                              {app.status}
                            </span>
                          </td>
                          <td>
                            <button style={{ background: 'transparent', border: 'none', color: 'var(--accent-color)', cursor: 'pointer' }}>
                               View Report
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="fade-in">
                <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1.5rem' }}>Target Role Archetypes</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                    {data.profile?.target_roles?.archetypes?.map(arch => (
                      <div key={arch.name} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ color: 'var(--accent-color)' }}>{arch.name}</h4>
                          <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>{arch.level}</span>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Fit Strategy: {arch.fit}</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.5rem' }}>Skills Inventory</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {Object.entries(data.profile?.skills || {}).map(([category, skills]) => (
                      skills.map(skill => (
                        <span key={skill} style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', fontSize: '0.85rem' }}>
                          {skill}
                        </span>
                      ))
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          background: 'linear-gradient(135deg, #1e293b, #334155)',
          border: '1px solid var(--accent-color)',
          borderRadius: '0.75rem', padding: '1rem 1.5rem',
          boxShadow: '0 8px 32px rgba(59,130,246,0.3)',
          animation: 'slideUp 0.3s ease-out',
          zIndex: 1000, fontSize: '0.9rem'
        }}>
          {toast}
        </div>
      )}

      <style>{`
        .fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .spinning {
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <div className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={20} />
      {label}
    </div>
  );
}

export default App;
