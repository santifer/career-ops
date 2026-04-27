// app.js — mock interview frontend
//
// Three views:
//   #setup-view   — pick target, persona, voice, etc.
//   #call-view    — phone-style UI: push-to-talk, transcript, coach pane
//   #debrief-view — coach report and story-promote buttons
//
// Browser STT: Web Speech API (Chrome/Edge). Audio playback: <audio>.
// Server contract: see mock-interview.mjs.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  config: null,
  voices: [],
  targets: [],
  sessionId: null,
  startTimeMs: 0,
  timerInterval: null,
  voiceTrack: 'diy',     // 'diy' | 'system_tts'
  voiceId: '',           // ElevenLabs voice_id when voiceTrack === 'diy'
  osVoiceName: '',       // SpeechSynthesisVoice.name when voiceTrack === 'system_tts'
  feedbackMode: 'in_character',
  recognition: null,
  recognizing: false,
  pendingTranscript: '',
  callContext: '',
  newStories: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup view
// ─────────────────────────────────────────────────────────────────────────────

async function loadSetup() {
  const cfgRes = await fetch('/api/config');
  state.config = await cfgRes.json();

  // Key warnings
  const warn = $('#key-warnings');
  warn.innerHTML = '';
  if (!state.config.has_anthropic_key) {
    warn.insertAdjacentHTML('beforeend', `<div class="errbox">ANTHROPIC_API_KEY is missing from <code>.env</code>. The interviewer can't think without it.</div>`);
  }
  if (!state.config.has_elevenlabs_key) {
    warn.insertAdjacentHTML('beforeend', `<div class="infobox">No <code>ELEVENLABS_API_KEY</code> in <code>.env</code>. Defaulting to System voice (free, uses your OS voices).</div>`);
  }
  if (state.config.defaults?.voice_track === 'elevenlabs_cai') {
    warn.insertAdjacentHTML('beforeend', `<div class="infobox">Voice track is set to <code>elevenlabs_cai</code>, but the v1 server falls back to the DIY pipeline for now.</div>`);
  }

  // Defaults
  const d = state.config.defaults || {};
  $('#persona').value = d.default_persona || 'tough';
  $('#feedback-mode').value = d.default_feedback_mode || 'in_character';
  $('#duration').value = d.default_duration_minutes || 25;

  // Targets
  const tRes = await fetch('/api/targets');
  const t = await tRes.json();
  state.targets = t.targets || [];
  const sel = $('#target-id');
  sel.innerHTML = '';
  if (state.targets.length === 0) {
    sel.innerHTML = `<option value="">(no reports/ files yet — switch to Generic)</option>`;
  } else {
    for (const tg of state.targets) {
      const score = tg.score ? ` · ${tg.score}/5` : '';
      sel.insertAdjacentHTML('beforeend',
        `<option value="${tg.id}" data-company="${esc(tg.company)}" data-role="${esc(tg.role)}">#${tg.num} · ${esc(tg.company)} — ${esc(tg.role)}${score}</option>`);
    }
  }
  updateTargetNote();

  // ElevenLabs voices
  const vRes = await fetch('/api/voices');
  const v = await vRes.json();
  state.voices = v.voices || [];
  const vSel = $('#voice-id');
  vSel.innerHTML = '';
  if (state.voices.length === 0) {
    vSel.innerHTML = `<option value="">(no voices — check ElevenLabs key)</option>`;
  } else {
    for (const vc of state.voices) {
      const tags = Object.entries(vc.labels || {}).map(([k, v]) => `${k}:${v}`).join(', ');
      vSel.insertAdjacentHTML('beforeend',
        `<option value="${vc.voice_id}">${esc(vc.name)}${tags ? ` — ${esc(tags)}` : ''}</option>`);
    }
    if (d.default_voice_id && state.voices.find(v => v.voice_id === d.default_voice_id)) {
      vSel.value = d.default_voice_id;
    }
  }

  // OS voices (system_tts track)
  populateSystemVoices();
  if (typeof window.speechSynthesis !== 'undefined') {
    window.speechSynthesis.addEventListener?.('voiceschanged', populateSystemVoices);
  }

  // Voice-track selector — pick a sensible default
  const trackSel = $('#voice-track');
  const profileTrack = d.voice_track || 'diy';
  // Auto-fallback to system_tts when ElevenLabs key is missing or no voices loaded
  const initialTrack = (!state.config.has_elevenlabs_key || state.voices.length === 0)
    ? 'system_tts'
    : (profileTrack === 'elevenlabs_cai' ? 'diy' : profileTrack);
  trackSel.value = initialTrack;
  applyVoiceTrack(initialTrack);
  trackSel.addEventListener('change', () => applyVoiceTrack(trackSel.value));

  // Wire events
  $('#target-mode').addEventListener('change', onTargetModeChange);
  $('#target-id').addEventListener('change', updateTargetNote);
  $('#persona').addEventListener('change', () => {
    $('#custom-persona-field').classList.toggle('hidden', $('#persona').value !== 'custom');
  });
  $('#preview-voice-btn').addEventListener('click', previewVoice);
  $('#preview-sys-voice-btn').addEventListener('click', previewSystemVoice);
  $('#start-btn').addEventListener('click', startInterview);

  // Enable start
  $('#start-btn').disabled = false;
  $('#start-hint').textContent = 'Ready when you are.';
}

function onTargetModeChange() {
  const mode = $('#target-mode').value;
  $('#targeted-fields').classList.toggle('hidden', mode !== 'targeted');
  $('#generic-fields').classList.toggle('hidden', mode !== 'generic');
}

function updateTargetNote() {
  const sel = $('#target-id');
  const opt = sel.options[sel.selectedIndex];
  const note = $('#target-note');
  if (!opt || !opt.value) { note.textContent = ''; return; }
  const company = opt.dataset.company || '';
  const role = opt.dataset.role || '';
  note.textContent = `Will hydrate the interviewer with Block A + Block F from this report${company ? ` (${company}${role ? ' — ' + role : ''})` : ''}.`;
}

function applyVoiceTrack(track) {
  $('#el-voice-block').classList.toggle('hidden', track !== 'diy');
  $('#sys-voice-block').classList.toggle('hidden', track !== 'system_tts');
  const note = $('#voice-track-note');
  if (track === 'system_tts') {
    note.textContent = 'No API key needed. The interviewer will speak using your operating system\u2019s built-in voices. Quality varies by OS; persona variation will be limited.';
  } else {
    note.textContent = 'Uses ElevenLabs for natural human-sounding voices. Different voices per persona.';
  }
}

function populateSystemVoices() {
  const sel = $('#sys-voice-id');
  if (!sel) return;
  const synth = window.speechSynthesis;
  if (!synth) {
    sel.innerHTML = `<option value="">(this browser doesn't support speechSynthesis)</option>`;
    return;
  }
  const voices = synth.getVoices() || [];
  if (voices.length === 0) {
    sel.innerHTML = `<option value="">(loading OS voices… click again in a moment)</option>`;
    return;
  }
  // Prefer English-locale voices first, but show all so the user can pick another language.
  voices.sort((a, b) => {
    const ae = a.lang?.startsWith('en') ? 0 : 1;
    const be = b.lang?.startsWith('en') ? 0 : 1;
    return ae - be || a.name.localeCompare(b.name);
  });
  const prev = sel.value;
  sel.innerHTML = '';
  for (const v of voices) {
    sel.insertAdjacentHTML('beforeend',
      `<option value="${esc(v.name)}">${esc(v.name)}${v.lang ? ` — ${esc(v.lang)}` : ''}${v.default ? ' (default)' : ''}</option>`);
  }
  if (prev && voices.some(v => v.name === prev)) sel.value = prev;
}

async function previewVoice() {
  const voiceId = $('#voice-id').value;
  if (!voiceId) return alert('Pick a voice first.');
  const btn = $('#preview-voice-btn');
  btn.disabled = true; btn.textContent = 'Loading…';
  try {
    const r = await fetch('/api/voice-preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voiceId, text: 'Hi, this is your mock interviewer. Let\u2019s get started in a moment.' }),
    });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const audio = $('#preview-audio');
    audio.src = URL.createObjectURL(blob);
    await audio.play();
  } catch (e) {
    alert('Preview failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Preview voice';
  }
}

async function previewSystemVoice() {
  const name = $('#sys-voice-id').value;
  const synth = window.speechSynthesis;
  if (!synth) return alert('speechSynthesis not supported here. Try Chrome, Edge, or Safari.');
  synth.cancel();
  const u = new SpeechSynthesisUtterance('Hi, this is your mock interviewer. Let\u2019s get started in a moment.');
  if (name) {
    const v = (synth.getVoices() || []).find(x => x.name === name);
    if (v) u.voice = v;
  }
  u.rate = 1.0;
  u.pitch = 1.0;
  synth.speak(u);
}

// ─────────────────────────────────────────────────────────────────────────────
// Start interview
// ─────────────────────────────────────────────────────────────────────────────

async function startInterview() {
  const mode = $('#target-mode').value;
  const persona = $('#persona').value;
  const feedbackMode = $('#feedback-mode').value;
  const interviewType = $('#interview-type').value;
  const voiceTrack = $('#voice-track').value;
  const voiceId = $('#voice-id').value;
  const osVoiceName = $('#sys-voice-id').value;
  const durationMinutes = parseInt($('#duration').value, 10) || 25;
  const customPersona = $('#custom-persona').value;

  if (voiceTrack === 'system_tts' && !window.speechSynthesis) {
    alert('Your browser doesn\u2019t support speechSynthesis. Try Chrome, Edge, or Safari, or switch to ElevenLabs.');
    return;
  }
  if (voiceTrack === 'diy' && !voiceId) {
    alert('Pick an ElevenLabs voice, or switch the voice track to System voice.');
    return;
  }

  let body = { persona, feedbackMode, interviewType, voiceId, durationMinutes, customPersona, voiceTrack };
  if (mode === 'targeted') {
    const sel = $('#target-id');
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) { alert('Pick a report or switch to Generic.'); return; }
    body.targetId = opt.value;
    body.company = opt.dataset.company || '';
    body.role = opt.dataset.role || '';
  } else {
    body.role = $('#generic-role').value.trim();
    body.company = $('#generic-company').value.trim();
    body.industry = $('#generic-industry').value.trim();
    if (!body.role) { alert('Enter a role.'); return; }
  }

  state.voiceTrack = voiceTrack;
  state.voiceId = voiceId;
  state.osVoiceName = osVoiceName;
  state.feedbackMode = feedbackMode;
  state.callContext = body.targetId
    ? `${body.company}${body.role ? ' — ' + body.role : ''} · ${persona}`
    : `${body.role}${body.company ? ' @ ' + body.company : ''} · ${persona}`;

  $('#start-btn').disabled = true;
  $('#start-hint').textContent = 'Hydrating interviewer…';

  let resp;
  try {
    const r = await fetch('/api/session/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    resp = await r.json();
    if (!r.ok) throw new Error(resp.error || 'Server error');
  } catch (e) {
    alert('Could not start session: ' + e.message);
    $('#start-btn').disabled = false;
    $('#start-hint').textContent = 'Ready when you are.';
    return;
  }

  state.sessionId = resp.sessionId;
  state.startTimeMs = Date.now();
  $('#setup-view').classList.add('hidden');
  $('#call-view').classList.remove('hidden');
  $('#call-context').textContent = state.callContext;
  $('#avatar').textContent = avatarFor(persona);

  startTimer();
  setupRecognition();
  $('#hangup-btn').addEventListener('click', endCall);

  // Play the opener
  await speak(resp.openingTurn.speech, 'interviewer');
  if (resp.openingTurn.coach) showCoachNote(resp.openingTurn.coach);
}

function avatarFor(persona) {
  return ({ tough: 'TS', friendly: 'FR', technical: 'TC', executive: 'EX', custom: 'IV' })[persona] || 'IV';
}

function startTimer() {
  state.timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - state.startTimeMs) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    $('#timer').textContent = `${m}:${s}`;
  }, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech recognition (Web Speech API)
// ─────────────────────────────────────────────────────────────────────────────

function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setStatus('This browser doesn\u2019t support Web Speech API. Try Chrome or Edge.', 'bad');
    return;
  }
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (e) => {
    let interim = '', finalT = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalT += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalT) state.pendingTranscript += finalT + ' ';
    setStatus(`Listening… ${state.pendingTranscript}${interim}`, 'listening');
  };
  rec.onend = () => { state.recognizing = false; };
  rec.onerror = (e) => { console.warn('STT error:', e); };
  state.recognition = rec;

  const ptt = $('#ptt-btn');
  ptt.disabled = false;
  const startTalk = (e) => { e.preventDefault(); beginTalk(); };
  const endTalk   = (e) => { e.preventDefault(); finishTalk(); };
  ptt.addEventListener('mousedown', startTalk);
  ptt.addEventListener('mouseup', endTalk);
  ptt.addEventListener('mouseleave', (e) => { if (state.recognizing) endTalk(e); });
  ptt.addEventListener('touchstart', startTalk, { passive: false });
  ptt.addEventListener('touchend', endTalk);

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault(); beginTalk();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { e.preventDefault(); finishTalk(); }
  });
}

function beginTalk() {
  if (state.recognizing || !state.recognition) return;
  state.pendingTranscript = '';
  try { state.recognition.start(); state.recognizing = true; } catch {}
  $('#ptt-btn').classList.add('active');
  $('#ptt-btn').innerHTML = 'RELEASE<br/>TO SEND';
  setStatus('Listening…', 'listening');
}

async function finishTalk() {
  if (!state.recognizing) return;
  state.recognizing = false;
  try { state.recognition.stop(); } catch {}
  $('#ptt-btn').classList.remove('active');
  $('#ptt-btn').innerHTML = 'HOLD<br/>TO TALK';
  // Wait briefly for trailing final result
  await new Promise(r => setTimeout(r, 400));
  const text = state.pendingTranscript.trim();
  state.pendingTranscript = '';
  if (!text) { setStatus('Didn\u2019t catch that. Try again.', 'warn'); return; }
  await sendTurn(text);
}

async function sendTurn(candidateText) {
  appendTurn('candidate', candidateText);
  setStatus('Interviewer thinking…', 'speaking');
  $('#ptt-btn').disabled = true;
  try {
    const r = await fetch(`/api/session/${state.sessionId}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userTranscript: candidateText }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'turn failed');
    if (j.coach) showCoachNote(j.coach);
    await speak(j.speech, 'interviewer');
  } catch (e) {
    setStatus('Error: ' + e.message, 'bad');
  } finally {
    $('#ptt-btn').disabled = false;
  }
}

async function speak(text, who) {
  appendTurn(who, text);
  if (!text) return;
  setStatus('Interviewer speaking…', 'speaking');
  try {
    if (state.voiceTrack === 'system_tts') {
      await speakWithSystemTTS(text, state.osVoiceName);
    } else {
      const r = await fetch(`/api/session/${state.sessionId}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voiceId: state.voiceId }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const audio = $('#reply-audio');
      audio.src = URL.createObjectURL(blob);
      await audio.play();
      await new Promise(res => { audio.onended = res; });
    }
  } catch (e) {
    setStatus('TTS error: ' + e.message, 'bad');
  } finally {
    setStatus('Hold the button to reply.', '');
  }
}

function speakWithSystemTTS(text, voiceName) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceName) {
      const v = (synth.getVoices() || []).find(x => x.name === voiceName);
      if (v) u.voice = v;
    }
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

function appendTurn(role, text) {
  const t = $('#transcript');
  const div = document.createElement('div');
  div.className = `turn ${role}`;
  div.innerHTML = `<div class="who">${role === 'interviewer' ? 'Interviewer' : 'You'}</div><div>${esc(text)}</div>`;
  t.appendChild(div);
  t.scrollTop = t.scrollHeight;
}

function showCoachNote(coach) {
  $('#coach-empty')?.classList.add('hidden');
  const card = document.createElement('div');
  card.className = 'coach-note';
  const parts = [];
  if (coach.strength) parts.push(`<span class="label">+ Strength</span>${esc(coach.strength)}`);
  if (coach.weakness) parts.push(`<span class="label">! Weakness</span>${esc(coach.weakness)}`);
  if (coach.tip)      parts.push(`<span class="label">→ Tip</span>${esc(coach.tip)}`);
  if (coach.raw)      parts.push(esc(coach.raw));
  card.innerHTML = parts.join('<br/>');
  $('#coach-notes').prepend(card);
}

function setStatus(text, cls) {
  const el = $('#status-line');
  el.textContent = text;
  el.className = 'status-line ' + (cls || '');
}

// ─────────────────────────────────────────────────────────────────────────────
// End call → debrief
// ─────────────────────────────────────────────────────────────────────────────

async function endCall() {
  if (state.recognition && state.recognizing) try { state.recognition.stop(); } catch {}
  clearInterval(state.timerInterval);
  setStatus('Generating coach report…', 'speaking');
  $('#hangup-btn').disabled = true;
  $('#ptt-btn').disabled = true;
  const minutes = Math.max(1, Math.round((Date.now() - state.startTimeMs) / 60000));
  try {
    const r = await fetch(`/api/session/${state.sessionId}/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actualMinutes: minutes }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'end failed');
    state.newStories = j.newStories || [];
    showDebrief(j);
  } catch (e) {
    alert('Could not generate debrief: ' + e.message);
  }
}

function showDebrief(j) {
  $('#call-view').classList.add('hidden');
  $('#debrief-view').classList.remove('hidden');
  $('#session-file').textContent = j.sessionFile || '(saved)';
  $('#report').textContent = j.reportMarkdown || '(empty)';
  const list = $('#stories-list');
  list.innerHTML = '';
  if (!state.newStories.length) {
    list.innerHTML = `<p class="subtle">No new stories drafted from this session.</p>`;
  } else {
    state.newStories.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'story-card';
      card.innerHTML = `
        <div class="title">${esc(s.title)}</div>
        <div class="body">${esc(s.body)}</div>
        <button data-idx="${i}" class="primary">Promote to story-bank</button>
        <span class="subtle promote-status"></span>`;
      list.appendChild(card);
    });
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-idx]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      btn.disabled = true; btn.textContent = 'Adding…';
      try {
        const r = await fetch(`/api/session/${state.sessionId}/promote-story`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ storyIndex: idx }),
        });
        const j2 = await r.json();
        if (!r.ok) throw new Error(j2.error || 'promote failed');
        btn.textContent = 'Added ✓';
        btn.parentElement.querySelector('.promote-status').textContent = ' appended to ' + j2.file.replace(/^.*\//, '');
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Promote to story-bank';
        alert('Failed: ' + e.message);
      }
    });
  }
  $('#another-btn').addEventListener('click', () => location.reload());
}

// ─────────────────────────────────────────────────────────────────────────────
// utilities
// ─────────────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

loadSetup().catch(e => {
  document.body.innerHTML = `<div class="container"><div class="errbox">Could not load setup: ${esc(e.message)}</div></div>`;
});
