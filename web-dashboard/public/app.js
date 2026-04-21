let allAppData = [];

async function loadDashboard() {
    try {
        const response = await fetch('/api/applications');
        allAppData = await response.json();
        renderTable(allAppData);
        renderStats(allAppData);
    } catch (err) {
        showToast('Error loading dashboard');
    }
}

function renderTable(data) {
    const tbody = document.getElementById('app-body');
    tbody.innerHTML = '';
    data.forEach(app => {
        const tr = document.createElement('tr');
        tr.onclick = () => openReport(app.company, app.report);
        const scoreVal = parseFloat(app.score) || 0;
        const scoreColor = scoreVal >= 4.5 ? 'var(--green)' : scoreVal >= 4.0 ? 'var(--accent)' : 'var(--red)';
        const status = (app.status || '').toLowerCase();
        const statusClass = status.includes('interview') ? 'b-blue' : status.includes('applied') ? 'b-amber' : 'b-gray';
        tr.innerHTML = `
            <td><div class="co-name">${app.company}</div><div style="color:var(--txt-muted);font-size:11px;">${app.role}</div></td>
            <td><span style="font-weight:700;color:${scoreColor}">${app.score}</span></td>
            <td style="text-align:center"><span class="status-tag ${statusClass}">${app.status}</span></td>
            <td style="text-align:right;color:var(--txt-muted)">${app.date}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStats(data) {
    const evaluated = data.length;
    const applied = data.filter(a => (a.status || '').toLowerCase().includes('applied')).length;
    const interviews = data.filter(a => (a.status || '').toLowerCase().includes('interview')).length;
    const scores = data.map(a => parseFloat(a.score)).filter(s => !isNaN(s));
    const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '0.0';

    document.getElementById('quick-stats').innerHTML = `
        <div class="stat-card" onclick="filterTable('all')" style="cursor:pointer">
            <div class="stat-value">${evaluated}</div><div class="stat-label">evaluated</div>
        </div>
        <div class="stat-card" onclick="filterTable('applied')" style="cursor:pointer">
            <div class="stat-value">${applied}</div><div class="stat-label">applied</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avg}</div><div class="stat-label">avg score</div>
        </div>
        <div class="stat-card" onclick="filterTable('interview')" style="cursor:pointer">
            <div class="stat-value">${interviews}</div><div class="stat-label">interviews</div>
        </div>
    `;
}

function filterTable(type) {
    if (type === 'all') renderTable(allAppData);
    else renderTable(allAppData.filter(a => (a.status || '').toLowerCase().includes(type)));
}

function streamCmd(cmd, args = '') {
    const output = document.getElementById('term-log');
    const pCmd = document.createElement('p');
    pCmd.innerHTML = `<span style="color:#888;margin-right:8px;">$</span><span>${cmd} ${args}</span>`;
    output.appendChild(pCmd);
    output.scrollTop = output.scrollHeight;
    
    const ev = new EventSource(`/api/stream-command?cmd=${encodeURIComponent(cmd)}&args=${encodeURIComponent(args)}`);
    ev.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.output) {
            const span = document.createElement('span');
            span.innerText = d.output;
            output.appendChild(span);
            output.scrollTop = output.scrollHeight;
        }
        if (d.done) {
            ev.close();
            const p = document.createElement('p');
            p.innerText = `\n[Process finished: ${d.code}]`;
            output.appendChild(p);
            loadDashboard();
        }
    };
}

function runAutoPipeline() {
    const input = document.getElementById('jd-input').value.trim();
    if (input) {
        streamCmd('node gemini-eval.mjs', `"${input.replace(/"/g, '\\"')}"`);
        document.getElementById('jd-input').value = '';
    }
}

async function openReport(company, path) {
    if (!path || path === '❌') return showToast('No report found');
    try {
        const res = await fetch(`/api/reports/detail?path=${encodeURIComponent(path)}`);
        const md = await res.text();
        document.getElementById('report-title').innerText = company;
        document.getElementById('report-content').innerHTML = marked.parse(md);
        document.getElementById('report-panel').classList.add('show');
    } catch (e) { showToast('Error loading report'); }
}

function closeReport() { document.getElementById('report-panel').classList.remove('show'); }
function showToast(m) { const t = document.getElementById('toast'); t.innerText = m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); }

window.onload = loadDashboard;
