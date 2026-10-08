// Super Admin Dashboard Logic
let allEvents = [];
let activeEventId = null;
let currentEventData = null;
let currentScoresData = [];
let networkInfo = { local_ip: '127.0.0.1', port: 5005, network_base_url: 'http://127.0.0.1:5005' };
let linkHostMode = 'network'; // 'network' or 'localhost'

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  fetchNetworkInfo();
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
  document.getElementById('btnModeNetwork').classList.toggle('active', mode === 'network');
  document.getElementById('btnModeLocalhost').classList.toggle('active', mode === 'localhost');
  updateShareableLinks();
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
      renderMatrixTable();
    }
  } catch (e) {
    console.error('Error fetching admin data:', e);
  }
}

function updateShareableLinks() {
  if (!currentEventData) return;

  const base = linkHostMode === 'network' ? networkInfo.network_base_url : window.location.origin;
  
  const judgeLink = `${base}/judge/${currentEventData.id}`;
  const seqLink = `${base}/sequence/${currentEventData.id}`;
  const projLink = `${base}/projector/${currentEventData.id}`;

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
    const isCurrent = currentEventData.sequence[currentEventData.current_index] && currentEventData.sequence[currentEventData.current_index].tag_no === tagNo;

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

function copyLink(inputId) {
  const input = document.getElementById(inputId);
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Link copied to clipboard!', 'success');
  });
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
