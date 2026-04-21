// State management
let currentReportPath = '';

// Core Dashboard Logic
async function loadDashboard() {
    try {
        const response = await fetch('/api/applications');
        const data = await response.json();
        renderTable(data);
        renderStats(data);
    } catch (err) {
        showToast('Error loading dashboard: ' + err.message);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('app-body');
    tbody.innerHTML = '';

    data.forEach(app => {
        const tr = document.createElement('tr');
        // 'report' column from parsed markdown
        tr.onclick = () => openReport(app.company, app.report);
        
        const scoreVal = parseFloat(app.score) || 0;
        const scoreColor = scoreVal >= 4.5 ? 'var(--green)' : scoreVal >= 4.0 ? 'var(--accent)' : 'var(--red)';
        
        const status = (app.status || '').toLowerCase();
        const statusClass = status.includes('interview') ? 'b-blue' : 
                          status.includes('applied') ? 'b-amber' : 
                          status.includes('screening') ? 'b-green' : 'b-gray';

        tr.innerHTML = `
            <td>
                <div class="co-name">${app.company || '-'}</div>
                <div style="color: var(--txt-muted); font-size: 11px;">${app.role || '-'}</div>
            </td>
            <td><span style="font-weight: 700; color: ${scoreColor}">${app.score || '-'}</span></td>
            <td style="text-align:center"><span class="status-tag ${statusClass}">${app.status || '-'}</span></td>
            <td style="text-align:right; color: var(--txt-muted)">${app.date || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStats(data) {
    const total = data.length;
    const applied = data.filter(a => (a.status || '').toLowerCase().includes('applied')).length;
    const interviews = data.filter(a => (a.status || '').toLowerCase().includes('interview')).length;
    const scores = data.map(a => parseFloat(a.score)).filter(s => !isNaN(s));
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '0.0';

    const container = document.getElementById('quick-stats');
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${total}</div>
            <div class="stat-label">jobs evaluated</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${applied}</div>
            <div class="stat-label">applied</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avg}</div>
            <div class="stat-label">avg score</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${interviews}</div>
            <div class="stat-label">interviews</div>
        </div>
    `;
}

// Streaming Command Logic (Functional Parity with CLI)
function streamCmd(cmd, args = '') {
    const output = document.getElementById('term-log');
    
    // Create command line entry
    const pCmd = document.createElement('p');
    pCmd.innerHTML = `<span style="color: #888; margin-right: 8px;">$</span><span style="color: var(--txt-primary)">${cmd} ${args}</span>`;
    output.insertBefore(pCmd, output.lastElementChild);
    
    showToast('Executing: ' + cmd);
    
    const eventSource = new EventSource(`/api/stream-command?cmd=${encodeURIComponent(cmd)}&args=${encodeURIComponent(args)}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.output) {
            const pOut = document.createElement('span'); // Use span to preserve inline output
            pOut.innerText = data.output;
            output.insertBefore(pOut, output.lastElementChild);
            output.scrollTop = output.scrollHeight;
        }
        if (data.done) {
            eventSource.close();
            const pDone = document.createElement('p');
            pDone.style.color = data.code === 0 ? 'var(--green)' : 'var(--red)';
            pDone.innerText = `\n[Process finished with code ${data.code}]\n`;
            output.insertBefore(pDone, output.lastElementChild);
            loadDashboard(); // Auto-refresh data on completion
        }
    };

    eventSource.onerror = (err) => {
        eventSource.close();
        const pErr = document.createElement('p');
        pErr.style.color = 'var(--red)';
        pErr.innerText = `\n[Connection Error]\n`;
        output.insertBefore(pErr, output.lastElementChild);
    };
}

function runAutoPipeline() {
    const input = document.getElementById('jd-input').value.trim();
    if (!input) {
        showToast('Please paste a JD or URL');
        return;
    }
    // Matching /career-ops {input} behavior
    streamCmd('node gemini-eval.mjs', `"${input.replace(/"/g, '\\"')}"`);
    document.getElementById('jd-input').value = '';
}

// Side Panel Logic
async function openReport(company, reportPath) {
    if (!reportPath || reportPath === '❌') {
        showToast('No report available for ' + company);
        return;
    }

    try {
        const response = await fetch(`/api/reports/detail?path=${encodeURIComponent(reportPath)}`);
        if (!response.ok) throw new Error('Report not found');
        const markdown = await response.text();
        
        document.getElementById('report-title').innerText = company;
        document.getElementById('report-content').innerHTML = marked.parse(markdown);
        document.getElementById('report-panel').classList.add('show');
    } catch (err) {
        showToast('Error loading report: ' + err.message);
    }
}

function closeReport() {
    document.getElementById('report-panel').classList.remove('show');
}

// UI Helpers
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Hotkey Support
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeReport();
    }
});

// Initial load
window.onload = loadDashboard;
