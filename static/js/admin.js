// Super Admin Dashboard Logic
let allEvents = [];
let activeEventId = null;
let currentEventData = null;
let currentScoresData = [];
let networkInfo = { local_ip: '127.0.0.1', port: 5005, network_base_url: 'http://127.0.0.1:5005' };
let linkHostMode = 'cloud'; // 'cloud', 'network', 'localhost'
let supabaseStatus = { connected: false, url: '', has_key: false };

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  
  // Auto-detect mode
  const host = window.location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') {
    linkHostMode = 'network';
  } else {
    linkHostMode = 'cloud';
  }
  setLinkHostMode(linkHostMode);

  fetchNetworkInfo();
  checkSupabaseStatus();
  renderJudgeNameInputs(5);
  loadAllEvents();

  setInterval(() => {
    if (activeEventId) loadAdminData();
  }, 4000);
});

async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    const data = await res.json();
    if (data.success) {
      networkInfo = data;
      const lanText = document.getElementById('lanIpText');
      if (lanText) lanText.textContent = data.local_ip;
      updateShareableLinks();
    }
  } catch (e) {}
}

function setLinkHostMode(mode) {
  linkHostMode = mode;
  const btnCloud = document.getElementById('btnModeCloud');
  const btnNet = document.getElementById('btnModeNetwork');
  const btnLocal = document.getElementById('btnModeLocalhost');
  
  if (btnCloud) btnCloud.classList.toggle('active', mode === 'cloud');
  if (btnNet) btnNet.classList.toggle('active', mode === 'network');
  if (btnLocal) btnLocal.classList.toggle('active', mode === 'localhost');
  updateShareableLinks();
}

async function checkSupabaseStatus() {
  try {
    const res = await fetch('/api/supabase/status');
    const data = await res.json();
    if (data.success) {
      supabaseStatus = data;
      updateSupabaseUI();
    }
  } catch (e) {}
}

function updateSupabaseUI() {
  const dot = document.getElementById('supabaseStatusDot');
  const text = document.getElementById('supabaseStatusText');
  const modalDot = document.getElementById('supabaseModalStatusDot');
  const modalTitle = document.getElementById('supabaseModalStatusTitle');
  const urlInput = document.getElementById('supabaseUrlInput');

  if (supabaseStatus.connected) {
    if (dot) {
      dot.style.background = '#22c55e';
      dot.style.boxShadow = '0 0 8px #22c55e';
    }
    if (text) text.textContent = 'Supabase Cloud (Live)';
    if (modalDot) modalDot.style.background = '#22c55e';
    if (modalTitle) modalTitle.innerHTML = `<span style="color: #22c55e;">🟢 Connected to Supabase Cloud</span>`;
  } else {
    if (dot) {
      dot.style.background = '#eab308';
      dot.style.boxShadow = '0 0 8px #eab308';
    }
    if (text) text.textContent = 'Supabase Sync';
    if (modalDot) modalDot.style.background = '#eab308';
    if (modalTitle) modalTitle.innerHTML = `<span style="color: #eab308;">🟡 Local JSON Mode (Not Connected)</span>`;
  }

  if (urlInput && supabaseStatus.url && !urlInput.value) {
    urlInput.value = supabaseStatus.url;
  }
}

function openSupabaseModal() {
  checkSupabaseStatus();
  document.getElementById('supabaseModal').classList.add('active');
}

function closeSupabaseModal() {
  document.getElementById('supabaseModal').classList.remove('active');
}

async function saveSupabaseConfig() {
  const url = document.getElementById('supabaseUrlInput').value.trim();
  const key = document.getElementById('supabaseKeyInput').value.trim();
  const btn = document.getElementById('btnSaveSupabase');

  if (!url || !key) {
    showToast('Please enter both Supabase URL and API Key', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connecting...';

  try {
    const res = await fetch('/api/supabase/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, key })
    });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Connected to Supabase Cloud Database!', 'success');
      supabaseStatus = data;
      updateSupabaseUI();
      closeSupabaseModal();
      loadAdminData();
    } else {
      showToast(`Error: ${data.message || data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to connect to Supabase', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Connect & Save';
    if (window.lucide) lucide.createIcons();
  }
}

async function syncSupabaseDataNow() {
  showToast('Synchronizing local data with Supabase...', 'info');
  try {
    const res = await fetch('/api/supabase/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(`Sync notice: ${data.message}`, 'info');
    }
  } catch (err) {
    showToast('Failed to sync with Supabase', 'error');
  }
}

function copySupabaseSchemaSql() {
  const sql = `-- 🔥 AGRASH Judgement Portal - Supabase SQL Schema
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    judge_count INT DEFAULT 5,
    judges JSONB DEFAULT '[]'::jsonb,
    criteria JSONB DEFAULT '[]'::jsonb,
    sequence JSONB DEFAULT '[]'::jsonb,
    completed_tags JSONB DEFAULT '[]'::jsonb,
    current_index INT DEFAULT 0,
    next_transition_time DOUBLE PRECISION,
    transition_seconds INT DEFAULT 120,
    google_sheet_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    judge_name TEXT,
    scores JSONB DEFAULT '{}'::jsonb,
    total NUMERIC(5, 2) DEFAULT 0,
    remarks TEXT,
    admin_overridden BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on events" ON events FOR SELECT USING (true);
CREATE POLICY "Allow public write on events" ON events FOR ALL USING (true);

CREATE POLICY "Allow public read on scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Allow public write on scores" ON scores FOR ALL USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;`;

  navigator.clipboard.writeText(sql).then(() => {
    showToast('SQL Schema copied to clipboard! Paste into Supabase SQL Editor.', 'success');
  });
}

async function loadAllEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success && data.events.length > 0) {
      allEvents = data.events;
      
      const selector = document.getElementById('eventSelector');
      selector.innerHTML = allEvents.map(e => `
        <option value="${e.id}">${escapeHtml(e.name)}</option>
      `).join('');

      if (!activeEventId || !allEvents.find(e => e.id === activeEventId)) {
        activeEventId = allEvents[0].id;
      }
      selector.value = activeEventId;
      loadAdminData();
    } else {
      document.getElementById('matrixBody').innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem;">No events yet. Click 'Create New Event' above!</td></tr>`;
    }
  } catch (err) {
    console.error('Error loading events:', err);
  }
}

window.selectEvent = onSelectEvent;
function onSelectEvent(evtId) {
  activeEventId = evtId;
  loadAdminData();
}

async function loadAdminData() {
  if (!activeEventId) return;
  try {
    const [evtRes, scRes] = await Promise.all([
      fetch(`/api/events/${activeEventId}`),
      fetch(`/api/events/${activeEventId}/scores`)
    ]);

    const evtData = await evtRes.json();
    const scData = await scRes.json();

    if (evtData.success) {
      currentEventData = evtData.event;
      currentScoresData = scData.scores || [];
      updateShareableLinks();
      renderJudgesPanel();
      renderMatrixTable();
    }
  } catch (e) {
    console.error('Error fetching admin data:', e);
  }
}

function renderJudgesPanel() {
  if (!currentEventData) return;
  const countSpan = document.getElementById('assignedJudgesCount');
  const chipsContainer = document.getElementById('assignedJudgesChips');
  if (!chipsContainer) return;

  const judges = currentEventData.judges || [];
  if (countSpan) countSpan.textContent = judges.length;

  if (judges.length === 0) {
    chipsContainer.innerHTML = `<span style="font-size: 0.8rem; color: var(--text-dim);">No judges configured. Click '+ Add / Edit Judges' to add!</span>`;
    return;
  }

  chipsContainer.innerHTML = judges.map((j, idx) => `
    <div style="display: inline-flex; align-items: center; gap: 0.45rem; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); padding: 0.3rem 0.65rem; border-radius: 20px; font-size: 0.82rem; color: #fff;">
      <span style="color: #38bdf8; font-weight: 700; font-family: var(--font-mono);">#${idx + 1}</span>
      <strong>${escapeHtml(j.name)}</strong>
      <button type="button" onclick="quickRenameJudge('${j.id}', '${escapeHtml(j.name)}')" title="Rename ${escapeHtml(j.name)}" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 0.15rem; display: inline-flex; align-items: center;">
        <i data-lucide="edit-2" style="width: 12px; height: 12px;"></i>
      </button>
      <button type="button" onclick="quickDeleteJudge('${j.id}', '${escapeHtml(j.name)}')" title="Remove ${escapeHtml(j.name)}" style="background: none; border: none; color: #fb7185; cursor: pointer; padding: 0 0.15rem; display: inline-flex; align-items: center;">
        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

async function quickRenameJudge(judgeId, currentName) {
  const newName = prompt(`Enter new name for judge (${currentName}):`, currentName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    showToast('Judge name cannot be empty', 'error');
    return;
  }
  if (!currentEventData || !currentEventData.judges) return;

  const judgesList = currentEventData.judges.map(j => {
    if (j.id === judgeId) {
      return { ...j, name: trimmed };
    }
    return j;
  });

  try {
    const res = await fetch(`/api/events/${activeEventId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judges: judgesList })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Judge renamed to "${trimmed}" successfully!`, 'success');
      await loadAdminData();
    } else {
      showToast(data.error || 'Failed to rename judge', 'error');
    }
  } catch (e) {
    showToast('Error updating judge name', 'error');
  }
}

async function quickDeleteJudge(judgeId, judgeName) {
  if (!currentEventData || (currentEventData.judges && currentEventData.judges.length <= 1)) {
    showToast('At least 1 judge is required for evaluation', 'error');
    return;
  }
  if (!confirm(`Are you sure you want to remove judge "${judgeName}"?`)) return;

  try {
    const res = await fetch(`/api/events/${activeEventId}/judges/${judgeId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Judge "${judgeName}" removed!`, 'success');
      await loadAdminData();
    } else {
      showToast(data.error || 'Failed to remove judge', 'error');
    }
  } catch (e) {
    showToast('Error removing judge', 'error');
  }
}


function renderPerJudgeLinks() {
  const container = document.getElementById('perJudgeLinksGrid');
  const countSpan = document.getElementById('assignedJudgesCount');
  const eventNameSpan = document.getElementById('btnCopyAllEventName');
  
  if (!currentEventData) {
    if (container) container.innerHTML = '<div style="grid-column: 1 / -1; padding: 1rem; color: var(--text-dim); text-align: center;">Select or create an event to view personalized judge links.</div>';
    if (countSpan) countSpan.textContent = '0';
    return;
  }

  const judges = currentEventData.judges || [];
  if (countSpan) countSpan.textContent = judges.length;
  if (eventNameSpan) eventNameSpan.textContent = currentEventData.name || 'Event';

  if (!container) return;

  if (judges.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: rgba(0,0,0,0.3); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 1.5rem; text-align: center;">
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 0.75rem;">
          No judges currently aligned for "${escapeHtml(currentEventData.name)}".
        </p>
        <button type="button" class="btn btn-cyan btn-sm" onclick="openAddJudgeModal('${currentEventData.id}')">
          <i data-lucide="user-plus"></i> Align First Judge
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  let base = window.location.origin;
  if (linkHostMode === 'network' && networkInfo && networkInfo.network_base_url) {
    base = networkInfo.network_base_url;
  } else if (linkHostMode === 'localhost' && networkInfo && networkInfo.localhost_base_url) {
    base = networkInfo.localhost_base_url;
  }

  container.innerHTML = judges.map((j, idx) => {
    const judgeUrl = `${base}/judge/${currentEventData.id}?judge=${j.id}`;
    const waText = encodeURIComponent(`Agrash Scoring Portal Link for ${j.name} (${currentEventData.name}):
${judgeUrl}`);
    const inputId = `pJudgeLink_${currentEventData.id}_${j.id}`;

    return `
      <div style="background: rgba(12, 17, 29, 0.75); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem; transition: border-color 0.2s ease;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <span style="font-family: var(--font-mono); font-size: 0.75rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700;">#${idx + 1}</span>
            <strong style="color: #fff; font-size: 0.92rem;">${escapeHtml(j.name)}</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <button type="button" onclick="quickRenameJudge('${j.id}', '${escapeHtml(j.name)}')" class="btn btn-ghost btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; color: #94a3b8;" title="Rename Judge">
              <i data-lucide="edit-2" style="width: 13px; height: 13px;"></i>
            </button>
            <button type="button" onclick="quickDeleteJudge('${j.id}', '${escapeHtml(j.name)}')" class="btn btn-ghost btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; color: #fb7185;" title="Remove Judge">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </div>

        <div style="display: flex; gap: 0.35rem;">
          <input type="text" id="${inputId}" readonly value="${judgeUrl}" style="flex-grow: 1; font-family: var(--font-mono); font-size: 0.74rem; background: rgba(7, 10, 17, 0.8); border: 1px solid rgba(56, 189, 248, 0.25); padding: 0.35rem 0.5rem; border-radius: 5px; color: #38bdf8;">
          <button type="button" class="btn btn-cyan btn-sm" onclick="copyLink('${inputId}')" title="Copy Link" style="padding: 0.35rem 0.55rem;">
            <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openQrModal('${escapeHtml(j.name)} • ${escapeHtml(currentEventData.name)}', '${judgeUrl}')" title="QR Code" style="padding: 0.35rem 0.55rem;">
            <i data-lucide="qr-code" style="width: 13px; height: 13px;"></i>
          </button>
          <a href="https://api.whatsapp.com/send?text=${waText}" target="_blank" class="btn btn-emerald btn-sm" title="Share WhatsApp" style="padding: 0.35rem 0.55rem;">
            <i data-lucide="share-2" style="width: 13px; height: 13px;"></i>
          </a>
          <a href="${judgeUrl}" target="_blank" class="btn btn-ghost btn-sm" title="Open Judge Portal" style="padding: 0.35rem 0.55rem;">
            <i data-lucide="external-link" style="width: 13px; height: 13px;"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function updateShareableLinks() {
  if (!currentEventData) return;

  let base = window.location.origin;
  if (linkHostMode === 'network') {
    base = networkInfo.network_base_url;
  } else if (linkHostMode === 'localhost') {
    base = networkInfo.localhost_base_url || 'http://127.0.0.1:5005';
  } else {
    // cloud mode
    base = window.location.origin;
  }
  
  const judgeLink = `${base}/judge/${currentEventData.id}`;
  const seqLink = `${base}/sequence/${currentEventData.id}`;
  const projLink = `${base}/projector/${currentEventData.id}`;
  const regLink = `${base}/registration`;

  // 1. Judge Link
  document.getElementById('judgeLinkInput').value = judgeLink;
  document.getElementById('openJudgeLinkBtn').href = judgeLink;
  document.getElementById('shareJudgeWhatsApp').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Agrash Judge Portal Link: ${judgeLink}`)}`;

  // 2. Sequence Link
  document.getElementById('seqLinkInput').value = seqLink;
  document.getElementById('openSeqLinkBtn').href = seqLink;
  document.getElementById('shareSeqWhatsApp').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Agrash Sequence Controller Link: ${seqLink}`)}`;

  // 3. Projector Link
  document.getElementById('projLinkInput').value = projLink;
  document.getElementById('openProjLinkBtn').href = projLink;

  // 4. Registration Desk Link
  renderPerJudgeLinks();

  const regInput = document.getElementById('regLinkInput');
  if (regInput) {
    regInput.value = regLink;
    const openRegBtn = document.getElementById('openRegLinkBtn');
    if (openRegBtn) openRegBtn.href = regLink;
    const shareRegWa = document.getElementById('shareRegWhatsApp');
    if (shareRegWa) shareRegWa.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Agrash 6-Desk Registration Portal Link: ${regLink}`)}`;
  }
}

function openQrModal(title, url) {
  document.getElementById('qrModalTitle').textContent = `${title} • QR Code`;
  document.getElementById('qrModalUrl').value = url;
  
  const container = document.getElementById('qrCodeContainer');
  container.innerHTML = '';
  if (window.QRCode) {
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#04060a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  document.getElementById('qrModal').classList.add('active');
}

function closeQrModal() {
  document.getElementById('qrModal').classList.remove('active');
}

function renderMatrixTable() {
  if (!currentEventData) return;

  const thead = document.getElementById('matrixHead');
  const tbody = document.getElementById('matrixBody');
  const judges = currentEventData.judges || [];
  
  // Combine sequence and completed tags
  let allTags = currentEventData.sequence.map(s => s.tag_no);
  (currentEventData.completed_tags || []).forEach(c => {
    if (!allTags.includes(c.tag_no)) allTags.push(c.tag_no);
  });

  let headHtml = `
    <tr>
      <th>Rank</th>
      <th>Tag Number</th>
  `;
  judges.forEach(j => {
    headHtml += `<th>${escapeHtml(j.name)}</th>`;
  });
  headHtml += `
      <th>Overall Avg (/100)</th>
      <th>Judges Done</th>
      <th>Status</th>
    </tr>
  `;
  thead.innerHTML = headHtml;

  const rowsData = allTags.map((tagNo, seqIdx) => {
    const tagScores = currentScoresData.filter(s => s.tag_no === tagNo);
    const isCompleted = (currentEventData.completed_tags || []).some(c => c.tag_no === tagNo);
    const isCurrent = currentEventData.sequence.length > 0 && currentEventData.sequence[0].tag_no === tagNo;

    let judgeScores = [];
    let sum = 0;
    let count = 0;

    judges.forEach(j => {
      const match = tagScores.find(s => s.judge_id === j.id);
      if (match) {
        judgeScores.push({ judgeId: j.id, scoreId: match.id, total: match.total, scores: match.scores });
        sum += match.total;
        count++;
      } else {
        judgeScores.push({ judgeId: j.id, scoreId: null, total: null });
      }
    });

    const avg = count > 0 ? (sum / count) : 0;
    return {
      tagNo,
      judgeScores,
      count,
      avg: parseFloat(avg.toFixed(2)),
      isCurrent,
      isCompleted
    };
  });

  const sorted = [...rowsData].filter(r => r.count > 0).sort((a, b) => b.avg - a.avg);
  rowsData.forEach(r => {
    const rankIdx = sorted.findIndex(s => s.tagNo === r.tagNo);
    r.rank = rankIdx >= 0 ? `#${rankIdx + 1}` : '-';
  });

  tbody.innerHTML = rowsData.map(r => `
    <tr style="${r.isCurrent ? 'background: rgba(255, 42, 75, 0.12);' : ''}">
      <td><strong style="color: #ff4d6a;">${r.rank}</strong></td>
      <td>
        <strong style="font-family: var(--font-heading); font-size: 1.15rem; color: #fff;">${escapeHtml(r.tagNo)}</strong>
        ${r.isCurrent ? ' <span class="badge badge-live" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;"><span class="dot-pulse"></span> STAGE</span>' : ''}
        ${r.isCompleted ? ' <span class="badge badge-done" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">DONE</span>' : ''}
      </td>
      ${r.judgeScores.map(js => {
        if (js.total !== null) {
          return `
            <td>
              <span class="score-badge" style="cursor: pointer;" onclick="openOverrideModal('${js.scoreId}', '${escapeHtml(r.tagNo)}', '${js.judgeId}')" title="Click to view/edit score">
                ${js.total}
              </span>
            </td>
          `;
        } else {
          return `<td><span class="score-pending" style="color:var(--text-dim); font-size:0.8rem;">Pending</span></td>`;
        }
      }).join('')}
      <td><strong class="avg-highlight">${r.count > 0 ? r.avg : '-'}</strong></td>
      <td><span style="color: var(--text-muted);">${r.count} / ${judges.length}</span></td>
      <td>
        ${r.isCompleted ? '<span class="badge badge-done" style="font-size:0.7rem;">COMPLETED</span>' : (r.isCurrent ? '<span class="badge badge-live" style="font-size:0.7rem;">LIVE</span>' : '<span class="badge badge-next" style="font-size:0.7rem;">IN QUEUE</span>')}
      </td>
    </tr>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// Presentation Helpers: Demo Fill & Reset
async function populateSampleData() {
  if (!activeEventId) return;
  try {
    const res = await fetch(`/api/events/${activeEventId}/sample-scores`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminData();
    }
  } catch (e) {
    showToast('Failed to populate demo scores', 'error');
  }
}

async function resetDemoData() {
  if (!confirm('Reset Agrash event back to initial presentation state?')) return;
  try {
    const res = await fetch(`/api/events/${activeEventId}/reset-demo`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAllEvents();
    }
  } catch (e) {
    showToast('Failed to reset demo', 'error');
  }
}

// Modals & Events
function openCreateEventModal() {
  document.getElementById('createEventModal').classList.add('active');
  renderJudgeNameInputs(document.getElementById('evtJudgeCount').value);
}

function closeCreateEventModal() {
  document.getElementById('createEventModal').classList.remove('active');
}

function renderJudgeNameInputs(count) {
  const container = document.getElementById('judgeNamesContainer');
  const n = parseInt(count);
  let html = '';
  for (let i = 1; i <= n; i++) {
    html += `
      <div>
        <input type="text" class="judge-name-input" placeholder="Judge ${i} Name" value="Judge ${i}" required>
      </div>
    `;
  }
  container.innerHTML = html;
}

async function submitCreateEvent(e) {
  e.preventDefault();
  const btn = document.getElementById('btnCreateSubmit');
  btn.disabled = true;
  btn.textContent = 'Creating Event...';

  const name = document.getElementById('evtName').value.trim();
  const desc = document.getElementById('evtDesc').value.trim();
  const sheetUrl = document.getElementById('evtSheetUrl').value.trim();
  
  const judgeInputs = document.querySelectorAll('.judge-name-input');
  const judgeNames = Array.from(judgeInputs).map(inp => inp.value.trim()).filter(Boolean);

  const rawTags = document.getElementById('evtTags').value;
  const tagNumbers = rawTags.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: desc,
        judge_names: judgeNames,
        tag_numbers: tagNumbers,
        google_sheet_url: sheetUrl
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Event created successfully!', 'success');
      closeCreateEventModal();
      activeEventId = data.event.id;
      loadAllEvents();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to create event', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check"></i> Create Event & Generate Links';
    if (window.lucide) lucide.createIcons();
  }
}

// Score Override Modal
function openOverrideModal(scoreId, tagNo, judgeId) {
  const score = currentScoresData.find(s => s.id === scoreId);
  if (!score || !currentEventData) return;

  const modal = document.getElementById('overrideModal');
  const body = document.getElementById('overrideModalBody');

  let criteriaHtml = '';
  (currentEventData.criteria || []).forEach(crit => {
    const val = (score.scores && score.scores[crit.id] !== undefined) ? score.scores[crit.id] : 0;
    criteriaHtml += `
      <div class="form-group" style="display: flex; justify-content: space-between; align-items: center;">
        <label>${escapeHtml(crit.name)} (max 20):</label>
        <input type="number" min="0" max="20" class="override-crit-input" data-crit="${crit.id}" value="${val}" style="width: 80px; text-align: center;">
      </div>
    `;
  });

  body.innerHTML = `
    <input type="hidden" id="overrideScoreId" value="${scoreId}">
    <div style="margin-bottom: 1rem; border-bottom: 1px solid var(--border-glass); padding-bottom: 0.75rem;">
      <h4 style="font-family: var(--font-heading); font-size: 1.2rem; color: #fff;">${escapeHtml(tagNo)} • ${escapeHtml(score.judge_name)}</h4>
      <span style="font-size: 0.82rem; color: var(--text-dim);">Current Total: ${score.total}/100</span>
    </div>
    ${criteriaHtml}
    <div class="form-group" style="margin-top: 1rem;">
      <label>Admin Remarks / Reason</label>
      <input type="text" id="overrideRemarks" placeholder="e.g. Corrected clerical error" value="${score.remarks || ''}">
    </div>
  `;

  modal.classList.add('active');
}

function closeOverrideModal() {
  document.getElementById('overrideModal').classList.remove('active');
}

async function submitOverrideScore(e) {
  e.preventDefault();
  const scoreId = document.getElementById('overrideScoreId').value;
  const remarks = document.getElementById('overrideRemarks').value.trim();

  const newScores = {};
  document.querySelectorAll('.override-crit-input').forEach(inp => {
    newScores[inp.dataset.crit] = parseFloat(inp.value) || 0;
  });

  try {
    const res = await fetch(`/api/scores/${scoreId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scores: newScores,
        remarks: remarks
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Score updated to ${data.score.total}/100!`, 'success');
      closeOverrideModal();
      loadAdminData();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to update score', 'error');
  }
}

// Google Sheets Sync
async function syncWithGoogleSheets() {
  if (!activeEventId) return;
  showToast('Syncing with Google Sheet...', 'info');

  try {
    const res = await fetch(`/api/events/${activeEventId}/sync-sheets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(`Google Sheets Notice: ${data.message}`, 'info');
    }
  } catch (e) {
    showToast('Failed to sync with Google Sheet', 'error');
  }
}

function exportExcel() {
  if (!activeEventId) return;
  window.location.href = `/api/events/${activeEventId}/export-excel`;
  showToast('📊 Generating & downloading multi-sheet Excel workbook...', 'success');
}

function exportCsv() {
  if (!activeEventId) return;
  window.location.href = `/api/events/${activeEventId}/export-csv`;
  showToast('Downloading CSV marksheet...', 'info');
}

async function deleteActiveEvent() {
  if (!activeEventId) return;
  if (!confirm('Are you sure you want to delete this event? All scores and sequence will be removed.')) return;

  try {
    const res = await fetch(`/api/events/${activeEventId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Event deleted', 'success');
      activeEventId = null;
      loadAllEvents();
    }
  } catch (e) {
    showToast('Error deleting event', 'error');
  }
}

function openGoogleSheetModal() {
  if (currentEventData) {
    const url = currentEventData.google_sheet_webhook_url || currentEventData.google_sheet_url || '';
    const input = document.getElementById('gSheetUrlInput');
    if (input) input.value = url;
  }
  document.getElementById('googleSheetModal').classList.add('active');
}

function closeGoogleSheetModal() {
  document.getElementById('googleSheetModal').classList.remove('active');
}

async function saveGoogleSheetConfig() {
  if (!activeEventId) return;
  const inputVal = document.getElementById('gSheetUrlInput').value.trim();
  const btn = document.getElementById('btnSaveGSheet');

  btn.disabled = true;
  btn.textContent = 'Connecting...';

  const isWebhook = inputVal.includes('script.google.com') || inputVal.includes('/exec');

  try {
    const res = await fetch(`/api/events/${activeEventId}/google-sheet-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        google_sheet_webhook_url: isWebhook ? inputVal : '',
        google_sheet_url: !isWebhook ? inputVal : ''
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Permanent Google Sheet Auto-Sync Connected! All live scores will now update in real-time.', 'success');
      closeGoogleSheetModal();
      loadAdminData();
    } else {
      showToast(`Error: ${data.message || data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to save Google Sheet config', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Connect Permanent Auto-Sync';
    if (window.lucide) lucide.createIcons();
  }
}

function copyAppsScriptCode() {
  const code = `// ⚡ Paste this in your Google Sheet -> Extensions -> Apps Script
// Then click "Deploy" -> "New deployment" -> Select "Web App" -> Set "Who has access" to "Anyone" -> Click "Deploy"
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tabName = data.tab_name || "Live Scores";
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    sheet.clear();
    
    var rows = data.rows || [];
    if (rows.length > 0) {
      sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      sheet.getRange(1, 1, 1, rows[0].length).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }
    return ContentService.createTextOutput(JSON.stringify({status: "success", updated_rows: rows.length}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  navigator.clipboard.writeText(code).then(() => {
    showToast('Google Apps Script copied! Paste in Sheet -> Extensions -> Apps Script -> Deploy as Web App.', 'success');
  });
}

function copyLink(inputId) {
  const input = document.getElementById(inputId);
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Link copied to clipboard!', 'success');
  });
}

// -------------------------------------------------------------
// EDIT EVENT & JUDGES HANDLERS
// -------------------------------------------------------------
async function openEditEventModal() {
  if (!currentEventData) {
    if (!activeEventId && allEvents.length > 0) {
      activeEventId = allEvents[0].id;
    }
    if (activeEventId) {
      try {
        const res = await fetch(`/api/events/${activeEventId}`);
        const data = await res.json();
        if (data.success) {
          currentEventData = data.event;
        }
      } catch (e) {}
    }
  }

  if (!currentEventData) {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      if (data.success && data.events && data.events.length > 0) {
        allEvents = data.events;
        activeEventId = allEvents[0].id;
        currentEventData = allEvents[0];
      }
    } catch (e) {}
  }

  if (!currentEventData) {
    showToast('Please create or select an event first', 'error');
    openCreateEventModal();
    return;
  }

  const nameInput = document.getElementById('editEventNameInput');
  const descInput = document.getElementById('editEventDescInput');
  if (nameInput) nameInput.value = currentEventData.name || '';
  if (descInput) descInput.value = currentEventData.description || '';

  // Render Judges
  const judgesContainer = document.getElementById('editJudgesContainer');
  if (judgesContainer) {
    judgesContainer.innerHTML = '';
    const judges = currentEventData.judges || [];
    if (judges.length === 0) {
      for (let i = 1; i <= 5; i++) {
        addJudgeToEditModal(`Judge ${i}`, `j${i}`);
      }
    } else {
      judges.forEach((j, idx) => {
        addJudgeToEditModal(j.name || `Judge ${idx + 1}`, j.id || `j${idx + 1}`);
      });
    }
  }

  // Render Criteria
  const criteriaContainer = document.getElementById('editCriteriaContainer');
  if (criteriaContainer) {
    criteriaContainer.innerHTML = '';
    const criteria = currentEventData.criteria || [];
    criteria.forEach((c, idx) => {
      addCriteriaToEditModal(c.name || `Criterion ${idx + 1}`, c.max_marks || 20, c.id || `c${idx + 1}`);
    });
  }

  const modal = document.getElementById('editEventModal');
  if (modal) modal.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function closeEditEventModal() {
  document.getElementById('editEventModal').classList.remove('active');
}

function addJudgeToEditModal(name = '', id = '') {
  const container = document.getElementById('editJudgesContainer');
  const count = container.children.length + 1;
  const judgeId = id || `j${Date.now().toString().slice(-4)}`;
  const judgeName = name || `Judge ${count}`;

  const row = document.createElement('div');
  row.className = 'judge-edit-row';
  row.dataset.judgeId = judgeId;
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';

  row.innerHTML = `
    <span style="font-family: var(--font-mono); font-size: 0.8rem; color: #00e5ff; min-width: 45px; font-weight: 700;">#${count}</span>
    <input type="text" class="judge-name-val" value="${escapeHtml(judgeName)}" placeholder="e.g. Judge ${count} or Dr. Sharma" style="flex-grow: 1; padding: 0.45rem 0.65rem; background: rgba(0,0,0,0.5); border: 1px solid var(--border-glass); border-radius: 6px; color: #fff; font-size: 0.85rem;">
    <button type="button" class="btn btn-ghost btn-sm" style="color: #f87171; padding: 0.4rem 0.6rem;" onclick="removeJudgeFromEditModal(this)" title="Remove Judge">
      <i data-lucide="trash-2"></i>
    </button>
  `;
  container.appendChild(row);
  if (window.lucide) lucide.createIcons();
}

function removeJudgeFromEditModal(btn) {
  const container = document.getElementById('editJudgesContainer');
  if (container.children.length <= 1) {
    showToast('At least 1 judge is required for evaluation', 'error');
    return;
  }
  const row = btn.closest('.judge-edit-row');
  if (row) {
    row.remove();
    // Re-index tags
    Array.from(container.children).forEach((child, i) => {
      const tag = child.querySelector('span');
      if (tag) tag.textContent = `#${i + 1}`;
    });
  }
}

function addCriteriaToEditModal(name = '', maxMarks = 20, id = '') {
  const container = document.getElementById('editCriteriaContainer');
  const count = container.children.length + 1;
  const critId = id || `c${Date.now().toString().slice(-4)}`;
  const critName = name || `Parameter ${count}`;

  const row = document.createElement('div');
  row.className = 'criteria-edit-row';
  row.dataset.critId = critId;
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';

  row.innerHTML = `
    <input type="text" class="crit-name-val" value="${escapeHtml(critName)}" placeholder="e.g. Choreography" style="flex-grow: 1; padding: 0.45rem 0.65rem; background: rgba(0,0,0,0.5); border: 1px solid var(--border-glass); border-radius: 6px; color: #fff; font-size: 0.85rem;">
    <div style="display: flex; align-items: center; gap: 0.25rem;">
      <span style="font-size: 0.75rem; color: var(--text-dim);">Max:</span>
      <input type="number" class="crit-max-val" value="${maxMarks}" min="5" max="100" style="width: 60px; padding: 0.45rem 0.45rem; background: rgba(0,0,0,0.5); border: 1px solid var(--border-glass); border-radius: 6px; color: #fbbf24; font-weight: 700; text-align: center; font-size: 0.85rem;">
    </div>
    <button type="button" class="btn btn-ghost btn-sm" style="color: #f87171; padding: 0.4rem 0.6rem;" onclick="removeCriteriaFromEditModal(this)" title="Remove Criterion">
      <i data-lucide="trash-2"></i>
    </button>
  `;
  container.appendChild(row);
  if (window.lucide) lucide.createIcons();
}

function removeCriteriaFromEditModal(btn) {
  const container = document.getElementById('editCriteriaContainer');
  if (container.children.length <= 1) {
    showToast('At least 1 scoring criterion is required', 'error');
    return;
  }
  const row = btn.closest('.criteria-edit-row');
  if (row) row.remove();
}

async function saveEventEdits() {
  if (!activeEventId) return;

  const nameVal = document.getElementById('editEventNameInput').value.trim();
  const descVal = document.getElementById('editEventDescInput').value.trim();

  if (!nameVal) {
    showToast('Event title is required', 'error');
    return;
  }

  // Gather Judges
  const judgeRows = document.querySelectorAll('#editJudgesContainer .judge-edit-row');
  const judgesList = [];
  judgeRows.forEach((row, idx) => {
    const input = row.querySelector('.judge-name-val');
    const jName = input ? input.value.trim() : `Judge ${idx + 1}`;
    if (jName) {
      judgesList.push({
        id: row.dataset.judgeId || `j${idx + 1}`,
        name: jName,
        is_active: true
      });
    }
  });

  if (judgesList.length === 0) {
    showToast('Please add at least 1 judge', 'error');
    return;
  }

  // Gather Criteria
  const critRows = document.querySelectorAll('#editCriteriaContainer .criteria-edit-row');
  const criteriaList = [];
  critRows.forEach((row, idx) => {
    const nameInput = row.querySelector('.crit-name-val');
    const maxInput = row.querySelector('.crit-max-val');
    const cName = nameInput ? nameInput.value.trim() : `Criterion ${idx + 1}`;
    const maxVal = maxInput ? parseInt(maxInput.value) || 20 : 20;
    if (cName) {
      criteriaList.push({
        id: row.dataset.critId || `c${idx + 1}`,
        name: cName,
        max_marks: maxVal
      });
    }
  });

  const btn = document.getElementById('btnSaveEditEvent');
  btn.disabled = true;
  btn.textContent = 'Saving Changes...';

  try {
    const res = await fetch(`/api/events/${activeEventId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameVal,
        description: descVal,
        judges: judgesList,
        criteria: criteriaList.length > 0 ? criteriaList : undefined
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('✅ Event & Judges updated successfully!', 'success');
      closeEditEventModal();
      await loadAllEvents();
      await loadAdminData();
    } else {
      showToast(`Error: ${data.error || 'Failed to update event'}`, 'error');
    }
  } catch (err) {
    showToast('Failed to save changes. Check server connection.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Save Event Changes';
    if (window.lucide) lucide.createIcons();
  }
}

// -------------------------------------------------------------
// COMBINED 4-EVENT CHAMPIONSHIP & INDIVIDUAL EVENT WINNERS HANDLERS
// -------------------------------------------------------------
let currentChampTab = 'overall';
let cachedChampionshipData = [];
let cachedEventWinnersData = {};
let champSearchQuery = '';

async function openChampionshipModal() {
  document.getElementById('championshipModal').classList.add('active');
  const container = document.getElementById('champContentContainer');
  if (container) {
    container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-dim);"><i data-lucide="loader-2" class="spin"></i> Loading Standings & Winners...</div>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/championship');
    const data = await res.json();

    if (data.success) {
      cachedChampionshipData = data.championship || [];
      cachedEventWinnersData = data.event_winners || {};
      renderCurrentChampionshipTab();
    } else {
      if (container) container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f87171;">Failed to load championship scores</div>';
    }
  } catch (err) {
    if (container) container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f87171;">Connection error loading championship</div>';
  }
}

function closeChampionshipModal() {
  document.getElementById('championshipModal').classList.remove('active');
}

function switchChampionshipTab(tabKey, btn) {
  currentChampTab = tabKey;
  document.querySelectorAll('#champTabNav .desk-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCurrentChampionshipTab();
}

let champSearchDebounceTimer = null;
function onChampSearchInput(val) {
  clearTimeout(champSearchDebounceTimer);
  champSearchDebounceTimer = setTimeout(() => {
    champSearchQuery = (val || '').trim().toLowerCase();
    renderCurrentChampionshipTab();
  }, 200);
}

function renderCurrentChampionshipTab() {
  const container = document.getElementById('champContentContainer');
  const footerInfo = document.getElementById('champFooterInfo');
  if (!container) return;

  if (currentChampTab === 'overall') {
    if (footerInfo) footerInfo.textContent = 'Showing Combined 4-Event School Championship Standings (58 Schools)';
    renderOverallChampionshipView(container);
  } else if (currentChampTab === 'summary') {
    if (footerInfo) footerInfo.textContent = 'Showing Top 3 Podium Winners across all 4 events side-by-side';
    renderAllWinnersSummaryView(container);
  } else {
    const cat = cachedEventWinnersData[currentChampTab];
    const catTitle = cat ? cat.event_name : 'Event';
    if (footerInfo) footerInfo.textContent = `Showing Individual Winners & Standings for ${catTitle}`;
    renderCategoryWinnersView(container, currentChampTab);
  }

  if (window.lucide) lucide.createIcons();
}

function renderOverallChampionshipView(container) {
  let list = cachedChampionshipData;
  if (champSearchQuery) {
    list = list.filter(item => 
      item.school.toLowerCase().includes(champSearchQuery) ||
      (item.room && item.room.toLowerCase().includes(champSearchQuery)) ||
      (item.dance && item.dance.toLowerCase().includes(champSearchQuery)) ||
      (item.song && item.song.toLowerCase().includes(champSearchQuery)) ||
      (item.declamation && item.declamation.toLowerCase().includes(champSearchQuery)) ||
      (item.science && item.science.toLowerCase().includes(champSearchQuery))
    );
  }

  const top3 = cachedChampionshipData.slice(0, 3);
  const podiumColors = [
    { title: '🏆 1st Champion (Gold)', bg: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(0,0,0,0.7))', border: '#fbbf24', text: '#fbbf24' },
    { title: '🥈 1st Runner Up (Silver)', bg: 'linear-gradient(135deg, rgba(226, 232, 240, 0.15), rgba(0,0,0,0.7))', border: '#cbd5e1', text: '#f1f5f9' },
    { title: '🥉 2nd Runner Up (Bronze)', bg: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(0,0,0,0.7))', border: '#f97316', text: '#fdba74' }
  ];

  let podiumHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">';
  top3.forEach((item, idx) => {
    const conf = podiumColors[idx];
    podiumHtml += `
      <div style="background: ${conf.bg}; border: 1px solid ${conf.border}; border-radius: var(--radius-md); padding: 1.1rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 800; font-size: 0.85rem; color: ${conf.text}; text-transform: uppercase; letter-spacing: 0.04em;">${conf.title}</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(0,0,0,0.6); padding: 0.15rem 0.5rem; border-radius: 4px; color: ${conf.text}; font-weight: 800;">#${idx + 1}</span>
        </div>
        <div style="font-weight: 800; color: #fff; font-size: 1.05rem; margin-bottom: 0.5rem; line-height: 1.3;">
          ${escapeHtml(item.school)}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.5rem; margin-top: 0.4rem;">
          <span>Combined 4-Event Score:</span>
          <strong style="color: ${conf.text}; font-size: 1.05rem; font-family: var(--font-mono);">${item.total_score > 0 ? item.total_score + ' / 400' : 'Pending'}</strong>
        </div>
      </div>
    `;
  });
  podiumHtml += '</div>';

  let tableRowsHtml = '';
  list.forEach((item) => {
    const originalRank = cachedChampionshipData.findIndex(x => x.school === item.school) + 1;
    const isTop10 = originalRank <= 10;
    let standing = 'Participant';
    let rowBg = 'transparent';

    if (originalRank === 1 && item.total_score > 0) {
      standing = '🏆 1st Champion';
      rowBg = 'rgba(251, 191, 36, 0.1)';
    } else if (originalRank === 2 && item.total_score > 0) {
      standing = '🥈 1st Runner Up';
      rowBg = 'rgba(226, 232, 240, 0.07)';
    } else if (originalRank === 3 && item.total_score > 0) {
      standing = '🥉 2nd Runner Up';
      rowBg = 'rgba(249, 115, 22, 0.08)';
    } else if (isTop10 && item.total_score > 0) {
      standing = `⭐ Top 10 (#${originalRank})`;
      rowBg = 'rgba(56, 189, 248, 0.05)';
    }

    tableRowsHtml += `
      <tr style="background: ${rowBg}; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-weight: 800; color: ${isTop10 ? '#fbbf24' : 'var(--text-dim)'}; font-family: var(--font-mono);">
          #${originalRank}
        </td>
        <td style="padding: 0.65rem 0.75rem; font-weight: ${isTop10 ? '700' : '500'}; color: #fff;">
          ${escapeHtml(item.school)}
          ${item.room !== '-' ? `<span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 0.4rem;">[${escapeHtml(item.room)}]</span>` : ''}
        </td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.dance)}</td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.song)}</td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.declamation)}</td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.science)}</td>
        <td style="padding: 0.65rem 0.6rem; text-align: center; font-weight: 800; color: ${item.total_score > 0 ? '#fbbf24' : 'var(--text-dim)'}; font-size: 0.92rem; font-family: var(--font-mono);">
          ${item.total_score > 0 ? item.total_score : '-'}
        </td>
        <td style="padding: 0.65rem 0.6rem; text-align: center; font-size: 0.78rem; font-weight: 700; color: ${isTop10 ? '#34d399' : 'var(--text-dim)'};">
          ${standing}
        </td>
      </tr>
    `;
  });

  if (list.length === 0) {
    tableRowsHtml = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-dim);">No matching schools found</td></tr>';
  }

  container.innerHTML = `
    ${podiumHtml}
    <div style="background: rgba(0,0,0,0.5); border-radius: var(--radius-md); border: 1px solid var(--border-glass); overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
        <thead>
          <tr style="background: #0f172a; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-glass);">
            <th style="padding: 0.75rem 0.6rem; text-align: center;">Rank</th>
            <th style="padding: 0.75rem 0.75rem;">School Name</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Dance (/100)</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Song (/100)</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Declamation (/100)</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Science (/100)</th>
            <th style="padding: 0.75rem 0.6rem; text-align: center; color: #fbbf24;">Combined Total</th>
            <th style="padding: 0.75rem 0.6rem; text-align: center;">Award Standing</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderAllWinnersSummaryView(container) {
  const categories = [
    { key: 'evt-group-dance', label: 'Group Dance', icon: 'sparkles', badgeColor: '#f43f5e' },
    { key: 'evt-group-song', label: 'Group Song', icon: 'music', badgeColor: '#38bdf8' },
    { key: 'evt-declamation', label: 'Declamation', icon: 'mic', badgeColor: '#a855f7' },
    { key: 'evt-science-exhibition', label: 'Science Exhibition', icon: 'atom', badgeColor: '#10b981' }
  ];

  let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">';

  categories.forEach(catMeta => {
    const catData = cachedEventWinnersData[catMeta.key] || { top3: [], total_participants: 0, evaluated_count: 0 };
    const top3 = catData.top3 || [];

    const p1 = top3[0] || null;
    const p2 = top3[1] || null;
    const p3 = top3[2] || null;

    gridHtml += `
      <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 1.25rem; backdrop-filter: blur(16px); display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.6rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="color: ${catMeta.badgeColor};"><i data-lucide="${catMeta.icon}"></i></span>
              <strong style="color: #fff; font-size: 1.05rem; font-family: var(--font-heading);">${catMeta.label}</strong>
            </div>
            <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-dim); font-size: 0.72rem;">
              ${catData.evaluated_count} / ${catData.total_participants} Evaluated
            </span>
          </div>

          <!-- Winners List -->
          <div style="display: flex; flex-direction: column; gap: 0.65rem;">
            
            <!-- Gold Winner -->
            <div style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(0,0,0,0.4)); border: 1px solid rgba(251, 191, 36, 0.35); border-radius: 8px; padding: 0.75rem;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-weight: 800; font-size: 0.78rem; color: #fbbf24;">🥇 1ST PLACE (GOLD)</span>
                <span style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 900; color: #fbbf24;">
                  ${p1 ? p1.average_score + ' pts' : '--'}
                </span>
              </div>
              <div style="font-weight: 700; color: #fff; font-size: 0.92rem; margin-top: 0.25rem;">
                ${p1 ? escapeHtml(p1.school_name) : '<span style="color: var(--text-dim); font-style: italic;">Evaluation Pending</span>'}
              </div>
              ${p1 ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem;">Tag: <strong style="color: #38bdf8;">${escapeHtml(p1.tag_no)}</strong> • Room: ${escapeHtml(p1.room_no)}</div>` : ''}
            </div>

            <!-- Silver Winner -->
            <div style="background: linear-gradient(135deg, rgba(226, 232, 240, 0.1), rgba(0,0,0,0.4)); border: 1px solid rgba(226, 232, 240, 0.25); border-radius: 8px; padding: 0.75rem;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-weight: 800; font-size: 0.78rem; color: #cbd5e1;">🥈 2ND PLACE (SILVER)</span>
                <span style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 900; color: #cbd5e1;">
                  ${p2 ? p2.average_score + ' pts' : '--'}
                </span>
              </div>
              <div style="font-weight: 700; color: #fff; font-size: 0.92rem; margin-top: 0.25rem;">
                ${p2 ? escapeHtml(p2.school_name) : '<span style="color: var(--text-dim); font-style: italic;">Evaluation Pending</span>'}
              </div>
              ${p2 ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem;">Tag: <strong style="color: #38bdf8;">${escapeHtml(p2.tag_no)}</strong> • Room: ${escapeHtml(p2.room_no)}</div>` : ''}
            </div>

            <!-- Bronze Winner -->
            <div style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(0,0,0,0.4)); border: 1px solid rgba(249, 115, 22, 0.25); border-radius: 8px; padding: 0.75rem;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-weight: 800; font-size: 0.78rem; color: #f97316;">🥉 3RD PLACE (BRONZE)</span>
                <span style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 900; color: #f97316;">
                  ${p3 ? p3.average_score + ' pts' : '--'}
                </span>
              </div>
              <div style="font-weight: 700; color: #fff; font-size: 0.92rem; margin-top: 0.25rem;">
                ${p3 ? escapeHtml(p3.school_name) : '<span style="color: var(--text-dim); font-style: italic;">Evaluation Pending</span>'}
              </div>
              ${p3 ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.15rem;">Tag: <strong style="color: #38bdf8;">${escapeHtml(p3.tag_no)}</strong> • Room: ${escapeHtml(p3.room_no)}</div>` : ''}
            </div>

          </div>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="switchChampionshipTab('${catMeta.key}', document.querySelector('#champTabNav button[onclick*=\\'${catMeta.key}\\']'))" style="width: 100%; justify-content: center; margin-top: 0.5rem;">
          <i data-lucide="list-ordered"></i> View Full ${catMeta.label} Standings
        </button>
      </div>
    `;
  });

  gridHtml += '</div>';
  container.innerHTML = gridHtml;
}

function renderCategoryWinnersView(container, eventId) {
  const cat = cachedEventWinnersData[eventId];
  if (!cat) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-dim);">No data available for this category</div>';
    return;
  }

  let list = cat.rankings || [];
  if (champSearchQuery) {
    list = list.filter(item => 
      item.school_name.toLowerCase().includes(champSearchQuery) ||
      item.tag_no.toLowerCase().includes(champSearchQuery) ||
      (item.room_no && item.room_no.toLowerCase().includes(champSearchQuery))
    );
  }

  // Top 3 Podium Cards
  const top3 = (cat.top3 || []).slice(0, 3);
  const podiumColors = [
    { title: '🥇 1st Place (Gold Winner)', bg: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(0,0,0,0.7))', border: '#fbbf24', text: '#fbbf24' },
    { title: '🥈 2nd Place (Silver Winner)', bg: 'linear-gradient(135deg, rgba(226, 232, 240, 0.15), rgba(0,0,0,0.7))', border: '#cbd5e1', text: '#f1f5f9' },
    { title: '🥉 3rd Place (Bronze Winner)', bg: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(0,0,0,0.7))', border: '#f97316', text: '#fdba74' }
  ];

  let podiumHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">';
  for (let idx = 0; idx < 3; idx++) {
    const conf = podiumColors[idx];
    const item = top3[idx];
    podiumHtml += `
      <div style="background: ${conf.bg}; border: 1px solid ${conf.border}; border-radius: var(--radius-md); padding: 1.1rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="font-weight: 800; font-size: 0.85rem; color: ${conf.text}; text-transform: uppercase;">${conf.title}</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(0,0,0,0.6); padding: 0.15rem 0.5rem; border-radius: 4px; color: ${conf.text}; font-weight: 800;">
            ${item ? item.tag_no : '#'}
          </span>
        </div>
        <div style="font-weight: 800; color: #fff; font-size: 1.05rem; margin-bottom: 0.5rem; line-height: 1.3;">
          ${item ? escapeHtml(item.school_name) : '<span style="color: var(--text-dim); font-style: italic; font-weight: 500;">Pending Score</span>'}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.5rem; margin-top: 0.4rem;">
          <span>Average Score:</span>
          <strong style="color: ${conf.text}; font-size: 1.1rem; font-family: var(--font-mono);">
            ${item && item.average_score > 0 ? item.average_score + ' / 100' : '--'}
          </strong>
        </div>
      </div>
    `;
  }
  podiumHtml += '</div>';

  // Table rows
  let tableRowsHtml = '';
  list.forEach((item, idx) => {
    let standingHtml = `<span style="color: var(--text-dim); font-size: 0.78rem;">${escapeHtml(item.standing)}</span>`;
    let rowBg = 'transparent';

    if (item.rank === 1) {
      standingHtml = '<span class="badge" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4);">🥇 1st Place (Gold)</span>';
      rowBg = 'rgba(251, 191, 36, 0.08)';
    } else if (item.rank === 2) {
      standingHtml = '<span class="badge" style="background: rgba(226, 232, 240, 0.15); color: #f1f5f9; border: 1px solid rgba(226, 232, 240, 0.3);">🥈 2nd Place (Silver)</span>';
      rowBg = 'rgba(226, 232, 240, 0.06)';
    } else if (item.rank === 3) {
      standingHtml = '<span class="badge" style="background: rgba(249, 115, 22, 0.15); color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3);">🥉 3rd Place (Bronze)</span>';
      rowBg = 'rgba(249, 115, 22, 0.06)';
    } else if (item.average_score > 0) {
      standingHtml = `<span class="badge badge-done">Position #${item.rank}</span>`;
    }

    tableRowsHtml += `
      <tr style="background: ${rowBg}; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-weight: 800; color: ${item.rank <= 3 && item.rank > 0 ? '#fbbf24' : 'var(--text-dim)'}; font-family: var(--font-mono);">
          ${item.rank !== '-' ? '#' + item.rank : '-'}
        </td>
        <td style="padding: 0.65rem 0.6rem; text-align: center;">
          <span style="font-family: var(--font-mono); font-weight: 900; color: #38bdf8; background: rgba(0,0,0,0.5); padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(56,189,248,0.3);">
            ${escapeHtml(item.tag_no)}
          </span>
        </td>
        <td style="padding: 0.65rem 0.75rem; font-weight: 700; color: #fff;">
          ${escapeHtml(item.school_name)}
        </td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; color: var(--text-dim); font-size: 0.8rem;">
          ${escapeHtml(item.room_no)}
        </td>
        <td style="padding: 0.65rem 0.6rem; text-align: center; font-weight: 800; color: ${item.average_score > 0 ? '#00e5ff' : 'var(--text-dim)'}; font-size: 0.95rem; font-family: var(--font-mono);">
          ${item.average_score > 0 ? item.average_score : '--'}
        </td>
        <td style="padding: 0.65rem 0.5rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">
          ${item.judges_scored} / ${item.total_judges}
        </td>
        <td style="padding: 0.65rem 0.6rem; text-align: center;">
          ${standingHtml}
        </td>
      </tr>
    `;
  });

  if (list.length === 0) {
    tableRowsHtml = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-dim);">No participating teams found matching search</td></tr>';
  }

  container.innerHTML = `
    ${podiumHtml}
    <div style="background: rgba(0,0,0,0.5); border-radius: var(--radius-md); border: 1px solid var(--border-glass); overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
        <thead>
          <tr style="background: #0f172a; color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-glass);">
            <th style="padding: 0.75rem 0.6rem; text-align: center;">Rank</th>
            <th style="padding: 0.75rem 0.6rem; text-align: center;">Tag No</th>
            <th style="padding: 0.75rem 0.75rem;">School Name</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Room</th>
            <th style="padding: 0.75rem 0.6rem; text-align: center; color: #00e5ff;">Average (/100)</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center;">Judges Scored</th>
            <th style="padding: 0.75rem 0.6rem; text-align: center;">Award Standing</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

async function syncFinalResultSheetNow() {
  try {
    showToast('Syncing all 4 events & Final Result tab to Google Sheet...', 'info');
    const res = await fetch('/api/sync-all-sheets', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Google Sheet all 5 tabs (4 categories + Final Result) updated successfully!', 'success');
    } else {
      showToast('Sync completed with warnings', 'info');
    }
  } catch (e) {
    showToast('Failed to trigger sync', 'error');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}




// -------------------------------------------------------------
// JUDGE ALIGNMENT & DIRECTORY MODAL HANDLERS
// -------------------------------------------------------------

async function openAddJudgeModal(preselectedEventId = null) {
  const modal = document.getElementById('addJudgeModal');
  const select = document.getElementById('addJudgeEventSelect');
  const nameInput = document.getElementById('addJudgeNameInput');

  if (!modal || !select) return;

  if (allEvents.length === 0) {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      if (data.success && data.events) {
        allEvents = data.events;
      }
    } catch (e) {}
  }

  if (allEvents.length === 0) {
    showToast('No events found. Please create an event first!', 'error');
    openCreateEventModal();
    return;
  }

  select.innerHTML = allEvents.map(e => `
    <option value="${e.id}" ${e.id === (preselectedEventId || activeEventId) ? 'selected' : ''}>
      ${escapeHtml(e.name)} (${(e.judges || []).length} Judges currently)
    </option>
  `).join('');

  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 100);
  }

  modal.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function closeAddJudgeModal() {
  const modal = document.getElementById('addJudgeModal');
  if (modal) modal.classList.remove('active');
}

async function submitAddJudgeForm(e) {
  e.preventDefault();
  const select = document.getElementById('addJudgeEventSelect');
  const nameInput = document.getElementById('addJudgeNameInput');
  const targetEventId = select ? select.value : activeEventId;
  const judgeName = nameInput ? nameInput.value.trim() : '';

  if (!judgeName) {
    showToast('Please enter judge name or title', 'error');
    return;
  }

  const btn = document.getElementById('btnAddJudgeSubmit');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding Judge...';
  }

  try {
    const res = await fetch(`/api/events/${targetEventId}/add-judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: judgeName })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Judge "${judgeName}" aligned & added successfully!`, 'success');
      closeAddJudgeModal();
      await loadAllEvents();
      if (activeEventId === targetEventId) {
        await loadAdminData();
      } else {
        await selectEvent(targetEventId);
      }
    } else {
      showToast(data.error || 'Failed to add judge', 'error');
    }
  } catch (err) {
    showToast('Network error adding judge', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="user-check"></i> Align & Create Judge Link`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function copyAllJudgeLinksForEvent() {
  if (!currentEventData || !currentEventData.judges) return;
  let base = window.location.origin;
  if (linkHostMode === 'network' && networkInfo && networkInfo.network_base_url) {
    base = networkInfo.network_base_url;
  } else if (linkHostMode === 'localhost' && networkInfo && networkInfo.localhost_base_url) {
    base = networkInfo.localhost_base_url;
  }

  let text = `🎯 Agrash 2026 (12 October 2026) - ${currentEventData.name} (Judge Direct Links):\n\n`;
  currentEventData.judges.forEach((j, idx) => {
    text += `👤 ${j.name} (Judge #${idx + 1}):\n${base}/judge/${currentEventData.id}?judge=${j.id}\n\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 All ${currentEventData.judges.length} judge links for "${currentEventData.name}" copied to clipboard!`, 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

function openAllJudgesDirectoryModal() {
  const modal = document.getElementById('allJudgesDirectoryModal');
  const container = document.getElementById('allJudgesDirectoryContent');
  if (!modal || !container) return;

  let base = window.location.origin;
  if (linkHostMode === 'network' && networkInfo && networkInfo.network_base_url) {
    base = networkInfo.network_base_url;
  } else if (linkHostMode === 'localhost' && networkInfo && networkInfo.localhost_base_url) {
    base = networkInfo.localhost_base_url;
  }

  container.innerHTML = allEvents.map(ev => {
    const judges = ev.judges || [];
    return `
      <div style="background: rgba(12, 17, 29, 0.85); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 1rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.5rem;">
          <strong style="color: #38bdf8; font-size: 1rem; font-family: var(--font-heading);">
            <i data-lucide="award"></i> ${escapeHtml(ev.name)}
          </strong>
          <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">
            ${judges.length} Judges Aligned
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${judges.map((j, idx) => {
            const url = `${base}/judge/${ev.id}?judge=${j.id}`;
            const wa = encodeURIComponent(`Agrash Portal - ${j.name} (${ev.name}):\n${url}`);
            const uniqueId = `dirLink_${ev.id}_${j.id}`;
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 0.5rem 0.75rem; border-radius: 6px; gap: 0.5rem; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-family: var(--font-mono); font-size: 0.75rem; color: #fbbf24; font-weight: 700;">#${idx + 1}</span>
                  <strong style="color: #fff; font-size: 0.88rem;">${escapeHtml(j.name)}</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                  <input type="text" id="${uniqueId}" readonly value="${url}" style="font-family: var(--font-mono); font-size: 0.72rem; background: rgba(0,0,0,0.6); border: 1px solid var(--border-glass); padding: 0.3rem 0.5rem; border-radius: 4px; color: #38bdf8; width: 220px;">
                  <button class="btn btn-cyan btn-sm" onclick="copyLink('${uniqueId}')" style="padding: 0.3rem 0.5rem; font-size: 0.75rem;">
                    <i data-lucide="copy"></i> Copy
                  </button>
                  <a href="https://api.whatsapp.com/send?text=${wa}" target="_blank" class="btn btn-emerald btn-sm" style="padding: 0.3rem 0.5rem; font-size: 0.75rem;">
                    <i data-lucide="share-2"></i>
                  </a>
                  <a href="${url}" target="_blank" class="btn btn-ghost btn-sm" style="padding: 0.3rem 0.5rem; font-size: 0.75rem;">
                    <i data-lucide="external-link"></i>
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('active');
  if (window.lucide) lucide.createIcons();
}

function closeAllJudgesDirectoryModal() {
  const modal = document.getElementById('allJudgesDirectoryModal');
  if (modal) modal.classList.remove('active');
}

function copyEntireJudgesDirectory() {
  let base = window.location.origin;
  if (linkHostMode === 'network' && networkInfo && networkInfo.network_base_url) {
    base = networkInfo.network_base_url;
  } else if (linkHostMode === 'localhost' && networkInfo && networkInfo.localhost_base_url) {
    base = networkInfo.localhost_base_url;
  }

  let text = `🔥 AGRASH 2026 (12 OCTOBER 2026) - COMPLETE JUDGES DIRECTORY 🔥\n=========================================\n\n`;
  allEvents.forEach(ev => {
    text += `🏆 EVENT: ${ev.name.toUpperCase()}\n`;
    text += `-----------------------------------------\n`;
    (ev.judges || []).forEach((j, idx) => {
      text += `• ${j.name} (Judge #${idx + 1}):\n  ${base}/judge/${ev.id}?judge=${j.id}\n`;
    });
    text += `\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Complete Agrash Judge Directory copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}
