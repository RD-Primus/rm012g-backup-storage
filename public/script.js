// ── State ────────────────────────────────────────────────
let clients = [];
let statuses = {};

// ── Theme (applied immediately before DOM load to prevent flash) ──
(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

// ── Auth ──────────────────────────────────────────────────
function getToken() { return localStorage.getItem('authToken') || ''; }

function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(options.headers || {})
    }
  });
}

async function checkAuth() {
  if (!getToken()) { window.location.replace('/login.html'); return false; }
  const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${getToken()}` } });
  if (!res.ok) { localStorage.removeItem('authToken'); window.location.replace('/login.html'); return false; }
  const data = await res.json();
  const el = document.getElementById('currentUser');
  if (el) el.textContent = `👤 ${data.username}`;
  return true;
}

async function logout() {
  await authFetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('authToken');
  window.location.replace('/login.html');
}

// ── Boot ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await checkAuth();
  if (!ok) return;

  // Bind logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  setupTheme();
  setupSSELogs();
  setupModal();
  refresh();
  setInterval(refreshStatuses, 2000);
});


// ── SSE Log Stream ────────────────────────────────────────
function setupSSELogs() {
  const terminal = document.getElementById('logTerminal');
  const es = new EventSource('/api/logs');
  es.onmessage = ({ data }) => {
    try {
      const { level, message, timestamp } = JSON.parse(data);
      const line = document.createElement('div');
      line.className = `log-line ${level === 'error' ? 'error' : level === 'warn' ? 'warn' : ''}`;
      line.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${escapeHtml(message)}`;
      terminal.appendChild(line);
      terminal.scrollTop = terminal.scrollHeight;
    } catch { }
  };

  es.addEventListener('progress', (e) => {
    try {
      const p = JSON.parse(e.data);
      updateProgressBar(p.clientId, p.percent, p.current, p.total);
    } catch { }
  });
}

function updateProgressBar(id, percent, current, total) {
  const bar = document.getElementById(`progress-bar-${id}`);
  const text = document.getElementById(`progress-text-${id}`);
  // If the elements don't exist yet, we can't update them
  if (!bar || !text) return;

  bar.style.width = `${percent}%`;

  // Show detailed text, e.g., 45% (45/100)
  text.textContent = `${percent}% (${current}/${total})`;
  text.className = 'progress-text active';

  // If complete or starting, reset slightly
  if (percent === 100 || total === 0) {
    setTimeout(() => {
      bar.style.width = '0%';
      text.textContent = '';
      text.className = 'progress-text';
    }, 4000); // hide after a few seconds
  }

}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Data Refresh ──────────────────────────────────────────
async function refresh() {
  [clients, statuses] = await Promise.all([
    authFetch('/api/clients').then(r => r.json()),
    authFetch('/api/status').then(r => r.json())
  ]);
  renderClients();
}

async function refreshStatuses() {
  statuses = await authFetch('/api/status').then(r => r.json());
  // Update countdown badges without full re-render
  clients.forEach(c => updateCountdown(c.id));
}

// ── Render ────────────────────────────────────────────────
function renderClients() {
  const list = document.getElementById('clientList');
  if (clients.length === 0) {
    list.innerHTML = '<p class="empty-hint">No clients yet. Click "Add Client" to get started.</p>';
    return;
  }
  list.innerHTML = clients.map(clientCard).join('');

  // Bind buttons
  clients.forEach(c => {
    document.getElementById(`edit-${c.id}`).onclick = () => openModal(c);
    document.getElementById(`delete-${c.id}`).onclick = () => deleteClient(c.id);
    document.getElementById(`toggle-${c.id}`).onclick = () => toggleScheduler(c.id);
    document.getElementById(`download-${c.id}`).onclick = () => manualDownload(c.id);
    updateCountdown(c.id);
  });
}

function clientCard(c) {
  const s = statuses[c.id] || {};
  const running = s.running;
  return `
  <div class="client-card" id="card-${c.id}">
    <div class="client-info">
      <span class="client-label">${escapeHtml(c.label || c.id)}</span>
      <span class="client-host">${c.host}</span>
    </div>
    <div class="client-meta">
      <span class="badge-interval">⏱ ${c.intervalMinutes} min</span>
      <span class="badge-dir" title="${c.localDir}">📁 ${c.localDir}</span>
    </div>
    <div class="countdown-line">
      <span id="countdown-${c.id}" class="countdown ${running ? '' : 'stopped'}">
        ${running ? 'Calculating...' : '— Stopped —'}
      </span>
    </div>
    <div class="progress-wrapper">
      <div class="progress-track">
        <div id="progress-bar-${c.id}" class="progress-fill" style="width: 0%;"></div>
      </div>
      <span id="progress-text-${c.id}" class="progress-text"></span>
    </div>
    <div class="client-actions">
      <button id="toggle-${c.id}" class="btn ${running ? 'btn-stop' : 'btn-start'}">
        ${running ? '⏹ Stop' : '▶ Start'}
      </button>
      <button id="download-${c.id}" class="btn btn-download-sm">⬇ Now</button>
      <button id="edit-${c.id}" class="btn btn-ghost-sm">✏</button>
      <button id="delete-${c.id}" class="btn btn-danger-sm">🗑</button>
    </div>
    <div id="status-${c.id}" class="client-status"></div>
  </div>`;
}

function updateCountdown(id) {
  const el = document.getElementById(`countdown-${id}`);
  if (!el) return;
  const s = statuses[id];
  if (!s || !s.running) {
    el.textContent = '— Stopped —';
    el.className = 'countdown stopped';
    return;
  }
  const diff = Math.max(0, s.nextRunAt - Date.now());
  const m = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  el.textContent = `Next run in: ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  el.className = 'countdown running';
}

// ── Actions ───────────────────────────────────────────────
async function toggleScheduler(id) {
  const running = statuses[id]?.running;
  const url = `/api/scheduler/${id}/${running ? 'stop' : 'start'}`;
  await authFetch(url, { method: 'POST' });
  await refreshStatuses();
  renderClients();
}

async function manualDownload(id) {
  const btn = document.getElementById(`download-${id}`);
  const statusEl = document.getElementById(`status-${id}`);
  btn.disabled = true;
  btn.textContent = '⏳';
  showClientStatus(id, 'Connecting...', 'loading');
  try {
    const res = await authFetch(`/api/download/${id}`, { method: 'POST' });
    const data = await res.json();
    showClientStatus(id, data.message, data.success ? 'success' : 'error');
  } catch {
    showClientStatus(id, 'Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ Now';
  }
}

function showClientStatus(id, msg, type) {
  const el = document.getElementById(`status-${id}`);
  if (!el) return;
  el.textContent = msg;
  el.className = `client-status ${type}`;
  if (type !== 'loading') setTimeout(() => { el.textContent = ''; el.className = 'client-status'; }, 6000);
}

async function deleteClient(id) {
  if (!confirm(`Delete client "${id}"?`)) return;
  await authFetch(`/api/clients/${id}`, { method: 'DELETE' });
  await refresh();
}

// ── Modal ─────────────────────────────────────────────────
function setupModal() {
  const modal = document.getElementById('clientModal');
  const form = document.getElementById('clientForm');
  const intervalInput = document.getElementById('clientInterval');
  const intervalLabel = document.getElementById('intervalLabel');

  intervalInput.addEventListener('input', () => { intervalLabel.textContent = intervalInput.value; });

  document.getElementById('addClientBtn').onclick = () => openModal(null);
  document.getElementById('cancelModal').onclick = () => closeModal();
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const client = {
      id: document.getElementById('clientId').value || `pi-${Date.now()}`,
      label: document.getElementById('clientLabel').value,
      host: document.getElementById('clientHost').value,
      localDir: document.getElementById('clientLocalDir').value,
      intervalMinutes: parseInt(document.getElementById('clientInterval').value, 10)
    };
    await authFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(client)
    });
    closeModal();
    await refresh();
  });
}

function openModal(c) {
  document.getElementById('modalTitle').textContent = c ? 'Edit Client' : 'Add Client';
  document.getElementById('clientId').value = c?.id || '';
  document.getElementById('clientLabel').value = c?.label || '';
  document.getElementById('clientHost').value = c?.host || '';
  document.getElementById('clientLocalDir').value = c?.localDir || 'data';
  document.getElementById('clientInterval').value = c?.intervalMinutes || 10;
  document.getElementById('intervalLabel').textContent = c?.intervalMinutes || 10;
  document.getElementById('clientModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('clientModal').classList.add('hidden');
}

// ── Theme ──────────────────────────────────────────────────────────
function setupTheme() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    localStorage.setItem('theme', theme);
  };

  // Apply saved theme (already set by initTheme, just sync button label)
  apply(localStorage.getItem('theme') || 'dark');

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    apply(current === 'dark' ? 'light' : 'dark');
  });
}
