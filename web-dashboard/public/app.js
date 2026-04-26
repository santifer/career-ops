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
        let statusClass = 'b-gray';
        if (status.includes('interview')) statusClass = 'b-blue';
        else if (status.includes('applied')) statusClass = 'b-amber';
        else if (status.includes('screening')) statusClass = 'b-green';

        const tdName = document.createElement('td');
        const nameDiv = document.createElement('div');
        nameDiv.className = 'co-name';
        nameDiv.textContent = app.company;
        const roleDiv = document.createElement('div');
        roleDiv.style.color = 'var(--txt-muted)';
        roleDiv.style.fontSize = '11px';
        roleDiv.textContent = app.role;
        tdName.appendChild(nameDiv);
        tdName.appendChild(roleDiv);

        const tdScore = document.createElement('td');
        const scoreSpan = document.createElement('span');
        scoreSpan.style.fontWeight = '700';
        scoreSpan.style.color = scoreColor;
        scoreSpan.textContent = app.score;
        tdScore.appendChild(scoreSpan);

        const tdStatus = document.createElement('td');
        tdStatus.style.textAlign = 'center';
        const statusTag = document.createElement('span');
        statusTag.className = `status-tag ${statusClass}`;
        statusTag.textContent = app.status;
        tdStatus.appendChild(statusTag);

        const tdDate = document.createElement('td');
        tdDate.style.textAlign = 'right';
        tdDate.style.color = 'var(--txt-muted)';
        tdDate.textContent = app.date;

        tr.appendChild(tdName);
        tr.appendChild(tdScore);
        tr.appendChild(tdStatus);
        tr.appendChild(tdDate);
        
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

// NEW CORE LOGIC: Send directly to Terminal
async function terminalSend(cmd) {
    showToast(`Sending to Terminal: ${cmd.substring(0, 20)}...`);
    const response = await fetch('/api/terminal-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
    });
    const result = await response.json();
    if (result.error) showToast('Terminal Error: ' + result.error);
}

function runAutoPipeline() {
    const input = document.getElementById('jd-input').value.trim();
    if (input) {
        terminalSend(`/career-ops ${input}`);
        document.getElementById('jd-input').value = '';
    }
}

async function openReport(company, path) {
    if (!path || path === '❌') return showToast('No report found');
    try {
        const res = await fetch(`/api/reports/detail?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error('Report not found');
        const md = await res.text();
        document.getElementById('report-title').innerText = company;
        const html = marked.parse(md);
        document.getElementById('report-content').innerHTML = DOMPurify.sanitize(html);
        document.getElementById('report-panel').classList.add('show');
    } catch (e) { showToast('Error loading report: ' + e.message); }
}

function closeReport() { document.getElementById('report-panel').classList.remove('show'); }
function showToast(m) { const t = document.getElementById('toast'); t.innerText = m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); }

window.onload = loadDashboard;
