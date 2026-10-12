
function notifySequenceBroadcast(targetId) {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('stage_sequence_sync');
      channel.postMessage({ type: 'SEQUENCE_UPDATED', eventId: targetId || 'all', timestamp: Date.now() });
    } catch (e) {}
  }
  try {
    localStorage.setItem('stage_sequence_last_update', Date.now().toString());
  } catch (e) {}
}

// Sequence Controller Logic
let pathSegment = window.location.pathname.split('/').filter(Boolean).pop();
let eventId = (pathSegment && !['judge', 'judges', 'sequence', 'projector', 'admin'].includes(pathSegment)) ? pathSegment : 'evt-agrash';

let currentEvent = null;
let sortableInstance = null;
let isDragging = false;
let isSaving = false;
let lastUserActionTimestamp = 0;
let localSeqVersion = Date.now();

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  loadSequenceData(true);
  
  // Relaxed 4-second polling (strictly paused when editing, dragging, or within 7s of a user change)
  setInterval(() => {
    if (!isDragging && !isSaving && (Date.now() - lastUserActionTimestamp > 7000)) {
      loadSequenceData();
    }
  }, 4000);

  // Multi-tab instant sync via BroadcastChannel & LocalStorage
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('stage_sequence_sync');
      channel.onmessage = () => {
        if (!isDragging && !isSaving && (Date.now() - lastUserActionTimestamp > 5000)) {
          loadSequenceData();
        }
      };
      const regChannel = new BroadcastChannel('agrash_sync');
      regChannel.onmessage = () => {
        if (!isDragging && !isSaving && (Date.now() - lastUserActionTimestamp > 5000)) {
          loadSequenceData();
        }
      };
    } catch (e) {}
  }
  window.addEventListener('storage', (e) => {
    if (e.key === 'stage_sequence_last_update' || e.key === 'agrash_sync_ping') {
      if (!isDragging && !isSaving && (Date.now() - lastUserActionTimestamp > 5000)) {
        loadSequenceData();
      }
    }
  });
  window.addEventListener('focus', () => {
    if (!isDragging && !isSaving && (Date.now() - lastUserActionTimestamp > 5000)) {
      loadSequenceData();
    }
  });
});

function getActiveEventId() {
  return (currentEvent && currentEvent.id) ? currentEvent.id : eventId;
}

async function loadSequenceData(force = false) {
  if (isDragging || isSaving) return;
  if (!force && (Date.now() - lastUserActionTimestamp < 7000)) return;
  try {
    const targetId = getActiveEventId();
    const res = await fetch(`/api/events/${targetId}?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    const data = await res.json();
    if (data.success && data.event) {
      const serverVer = Number(data.seq_version || (data.event && data.event.seq_version) || 0);
      // REJECT stale server response if it has older version than our local saved version
      if (!force && serverVer > 0 && serverVer < localSeqVersion) {
        return;
      }
      localSeqVersion = Math.max(localSeqVersion, serverVer);
      currentEvent = data.event;
      eventId = currentEvent.id;

      // Filter out any completed tags from the active queue
      const compTags = data.completed_tags || [];
      const cleanNorm = (t) => String(t || '').toUpperCase().replace(/[\s-]/g, '');
      const compSet = new Set(compTags.map(c => cleanNorm(typeof c === 'object' && c !== null ? c.tag_no : c)));
      currentEvent.sequence = (currentEvent.sequence || []).filter(s => {
        const t = cleanNorm(typeof s === 'object' && s !== null ? s.tag_no : s);
        return !compSet.has(t);
      });
      
      const navTitle = document.getElementById('eventTitleNav');
      if (navTitle) navTitle.innerHTML = `${escapeHtml(currentEvent.name)} • <span>Sequence</span>`;
      
      const badge = document.getElementById('totalTagsBadge');
      if (badge) badge.textContent = `${currentEvent.sequence.length} Teams in Queue`;
      
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      const activeStageTag = currentEvent.sequence.length > 0 ? currentEvent.sequence[0].tag_no : 'Queue Finished';
      if (sideCurrent) sideCurrent.textContent = activeStageTag;
      
      const sideNext = document.getElementById('sidebarNextTag');
      const nextQueueTag = currentEvent.sequence.length > 1 ? currentEvent.sequence[1].tag_no : 'None';
      if (sideNext) sideNext.textContent = nextQueueTag;

      renderSequenceList(currentEvent.sequence);
      renderCompletedList(compTags);
    }
  } catch (err) {
    console.error('Error loading sequence:', err);
  }
}

function initSortable() {
  // Drag and drop disabled as requested - Bring to Stage button is the single reliable source of truth
  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch(e) {}
    sortableInstance = null;
  }
}

let lastRenderedSeqJson = '';
let lastRenderedCompJson = '';

function renderSequenceList(sequence) {
  const container = document.getElementById('sequenceList');
  if (!container) return;

  const currentSeqJson = JSON.stringify(sequence || []);
  if (currentSeqJson === lastRenderedSeqJson) {
    return; // Data has not changed: avoid wiping DOM, lucide re-creation, or destroying Sortable!
  }
  lastRenderedSeqJson = currentSeqJson;

  if (!sequence || sequence.length === 0) {
    container.innerHTML = `
      <div class="current-team-card" style="text-align: center; padding: 3rem;">
        <i data-lucide="check-circle-2" style="width: 52px; height: 52px; color: #10b981; margin: 0 auto 0.75rem auto;"></i>
        <h3 style="font-family: var(--font-heading); font-size: 1.5rem; color: #fff;">All Teams Completed!</h3>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 0.35rem;">
          The active queue is empty. You can add more tags below or restore completed teams.
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = sequence.map((item, idx) => {
    let tierStyle = '';
    let badgeHtml = '';
    let orderBadgeStyle = '';
    let tagNameStyle = '';

    if (idx === 0) {
      // 🟢 1. On Stage (EMERALD)
      tierStyle = 'border: 1.5px solid #10b981; background: linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(15, 23, 42, 0.95)); box-shadow: 0 0 25px rgba(16, 185, 129, 0.25);';
      orderBadgeStyle = 'background: #10b981; color: #fff; font-weight: 900; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);';
      tagNameStyle = 'font-size: 1.5rem; color: #fff; text-shadow: 0 0 15px rgba(16, 185, 129, 0.4);';
      badgeHtml = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.78rem; padding: 0.2rem 0.6rem;"><span class="dot-pulse" style="background: #10b981;"></span> LIVE ON STAGE</span>';
    } else if (idx === 1) {
      // 🟡 2. Next Up (AMBER GOLD)
      tierStyle = 'border: 1.5px solid rgba(251, 191, 36, 0.65); background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(15, 23, 42, 0.95)); box-shadow: 0 0 20px rgba(251, 191, 36, 0.2);';
      orderBadgeStyle = 'background: #fbbf24; color: #000; font-weight: 900;';
      tagNameStyle = 'font-size: 1.35rem; color: #fef08a;';
      badgeHtml = '<span class="badge" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4); font-size: 0.75rem; padding: 0.2rem 0.55rem;">NEXT UP</span>';
    } else if (idx === 2) {
      // 🔴 3. Preparing (CRIMSON ROSE)
      tierStyle = 'border: 1.5px solid rgba(244, 63, 94, 0.55); background: linear-gradient(135deg, rgba(244, 63, 94, 0.1), rgba(15, 23, 42, 0.95)); box-shadow: 0 0 18px rgba(244, 63, 94, 0.15);';
      orderBadgeStyle = 'background: #f43f5e; color: #fff; font-weight: 800;';
      tagNameStyle = 'font-size: 1.25rem; color: #fecdd3;';
      badgeHtml = '<span class="badge" style="background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.35); font-size: 0.75rem; padding: 0.2rem 0.55rem;">PREPARING</span>';
    } else {
      // 🔵 4. In Queue (CYAN SKY)
      tierStyle = 'border: 1px solid rgba(56, 189, 248, 0.25); background: rgba(56, 189, 248, 0.04);';
      orderBadgeStyle = 'background: rgba(56, 189, 248, 0.18); color: #38bdf8; font-weight: 700;';
      tagNameStyle = 'font-size: 1.15rem; color: #e0f2fe;';
      badgeHtml = '<span class="badge" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.25); font-size: 0.72rem; padding: 0.15rem 0.5rem;">IN QUEUE</span>';
    }

    return `
      <div class="sequence-item ${idx === 0 ? 'is-current' : ''} ${idx === 1 ? 'is-next' : ''}" id="seq-item-${idx}" data-index="${idx}" style="${tierStyle}">
        <div class="item-left">
          <span class="seq-order-badge" style="${orderBadgeStyle}">#${idx + 1}</span>
          <div>
            <div class="seq-tag-name" style="${tagNameStyle}">
              ${escapeHtml(item.tag_no)}
            </div>
            ${item.notes ? `<div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 0.15rem;">${escapeHtml(item.notes)}</div>` : ''}
            <div style="display: flex; gap: 0.45rem; margin-top: 0.3rem;">
              ${badgeHtml}
            </div>
          </div>
        </div>

        <div class="item-actions">
          <!-- Stage Actions: Complete for #1, Bring to Stage for all others -->
          ${idx === 0 ? `
            <button class="btn btn-emerald btn-md" onclick="completeTagAction(0, '${escapeHtml(item.tag_no)}')" title="Complete presentation & bring next team to stage" style="font-weight: 800; padding: 0.55rem 1.25rem;">
              <i data-lucide="check-check"></i> Complete & Next
            </button>
          ` : `
            <button class="btn btn-md btn-cyan" onclick="bringToStageAction(${idx}, '${escapeHtml(item.tag_no)}')" title="Bring this team directly to #1 Live on Stage" style="font-weight: 800; padding: 0.5rem 1.15rem; box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);">
              <i data-lucide="chevrons-up"></i> Bring to Stage
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
  initSortable();
}

function renderCompletedList(completedTags) {
  const container = document.getElementById('completedContainer');
  const countBadge = document.getElementById('completedCountBadge');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${completedTags.length} Completed`;

  const compJson = JSON.stringify(completedTags || []);
  if (compJson === lastRenderedCompJson) {
    return;
  }
  lastRenderedCompJson = compJson;

  if (!completedTags || completedTags.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.82rem; padding: 0.5rem 0;">No completed teams yet.</div>`;
    return;
  }

  container.innerHTML = completedTags.slice(-15).reverse().map(item => {
    const tag = (typeof item === 'object' && item !== null) ? (item.tag_no || '') : String(item);
    const compAt = (typeof item === 'object' && item !== null) ? (item.completed_at || 'Just now') : 'Earlier';
    return `
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 0.55rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
      <div>
        <strong style="color: #34d399; font-family: var(--font-heading); font-size: 0.95rem;">${escapeHtml(tag)}</strong>
        <span style="color: var(--text-dim); font-size: 0.75rem; margin-left: 0.5rem;">Completed at ${compAt}</span>
      </div>
      <button class="btn btn-ghost btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;" onclick="restoreTagAction('${escapeHtml(tag)}')" title="Restore back to bottom of active queue">
        <i data-lucide="rotate-ccw"></i> Restore
      </button>
    </div>
  `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

// Complete and Remove Tag (Instant Top Pop)
async function completeTagAction(idx, tagNo) {
  if (!currentEvent || isSaving) return;
  lastUserActionTimestamp = Date.now();
  localSeqVersion = Date.now();
  isSaving = true;

  // Local optimistic update: immediately remove from UI to guarantee ZERO lag or bounce!
  const targetId = getActiveEventId();
  const seq = (currentEvent.sequence || []).filter(s => s.tag_no !== tagNo);
  currentEvent.sequence = seq;
  renderSequenceList(seq);

  try {
    const res = await fetch(`/api/events/${targetId}/complete-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx, tag_no: tagNo, seq_version: localSeqVersion })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Completed '${tagNo}'! Next team is live on stage.`, 'success');
      notifySequenceBroadcast(targetId);
    }
  } catch (e) {
    showToast(`✓ Tag '${tagNo}' completed locally`, 'info');
  } finally {
    isSaving = false;
  }
}

// Complete Current Active Stage Tag
async function completeCurrentActiveTag() {
  if (!currentEvent || !currentEvent.sequence || currentEvent.sequence.length === 0) {
    showToast('No active teams in queue!', 'info');
    return;
  }
  const topTag = currentEvent.sequence[0].tag_no;
  await completeTagAction(0, topTag);
}

// Bring Tag directly to Stage (#1 in queue)
async function bringToStageAction(idx, tagNo) {
  if (!currentEvent || !currentEvent.sequence || isSaving) return;
  const targetId = getActiveEventId();
  lastUserActionTimestamp = Date.now();
  localSeqVersion = Date.now();
  isSaving = true;

  // Local optimistic update: immediately put item at index 0
  const seq = [...currentEvent.sequence];
  let targetIdx = idx;
  if (tagNo) {
    const fIdx = seq.findIndex(s => s.tag_no === tagNo);
    if (fIdx !== -1) targetIdx = fIdx;
  }
  const [item] = seq.splice(targetIdx, 1);
  seq.unshift(item);
  currentEvent.sequence = seq;
  renderSequenceList(seq);
  
  const sideCurrent = document.getElementById('sidebarCurrentTag');
  if (sideCurrent) sideCurrent.textContent = item.tag_no;
  const sideNext = document.getElementById('sidebarNextTag');
  if (sideNext) sideNext.textContent = seq[1] ? seq[1].tag_no : 'None';

  try {
    const res = await fetch(`/api/events/${targetId}/current-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: targetIdx, tag_no: item.tag_no, seq_version: localSeqVersion })
    });
    const data = await res.json();
    showToast(`⚡ Brought '${item.tag_no}' to Stage!`, 'success');
    notifySequenceBroadcast(targetId);
  } catch (e) {
    showToast(`⚡ '${item.tag_no}' is now live on stage`, 'info');
  } finally {
    isSaving = false;
  }
}

// Restore Tag
async function restoreTagAction(tagNo) {
  if (isSaving) return;
  const targetId = getActiveEventId();
  lastUserActionTimestamp = Date.now();
  localSeqVersion = Date.now();
  isSaving = true;
  try {
    const res = await fetch(`/api/events/${targetId}/restore-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_no: tagNo, seq_version: localSeqVersion })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Tag '${tagNo}' restored to queue!`, 'success');
      notifySequenceBroadcast(targetId);
      loadSequenceData(true);
    }
  } catch (e) {
    showToast('Failed to restore tag', 'error');
  } finally {
    isSaving = false;
  }
}

// Quick Move Up
async function moveTagUp(idx) {
  if (idx <= 0 || !currentEvent || isSaving) return;
  lastUserActionTimestamp = Date.now();
  localSeqVersion = Date.now();
  isSaving = true;

  const seq = [...currentEvent.sequence];
  const temp = seq[idx - 1];
  seq[idx - 1] = seq[idx];
  seq[idx] = temp;
  currentEvent.sequence = seq;
  renderSequenceList(seq);
  try {
    await saveSequenceToServer(seq, localSeqVersion);
  } finally {
    isSaving = false;
  }
}

// Quick Move Down
async function moveTagDown(idx) {
  if (!currentEvent || idx >= currentEvent.sequence.length - 1 || isSaving) return;
  lastUserActionTimestamp = Date.now();
  localSeqVersion = Date.now();
  isSaving = true;

  const seq = [...currentEvent.sequence];
  const temp = seq[idx + 1];
  seq[idx + 1] = seq[idx];
  seq[idx] = temp;
  currentEvent.sequence = seq;
  renderSequenceList(seq);
  try {
    await saveSequenceToServer(seq, localSeqVersion);
  } finally {
    isSaving = false;
  }
}

async function trigger2MinNotice() {
  if (!currentEvent || !currentEvent.sequence || currentEvent.sequence.length === 0) return;
  await saveSequenceToServer(currentEvent.sequence);
  showToast('2-Minute transition notice triggered on all Judge screens!', 'success');
}

async function addNewTag(e) {
  e.preventDefault();
  const input = document.getElementById('newTagInput');
  const val = input.value.trim();
  if (!val || !currentEvent) return;

  const seq = [...currentEvent.sequence, { tag_no: val, notes: 'Added by Stage Coordinator' }];
  input.value = '';
  currentEvent.sequence = seq;
  renderSequenceList(seq);
  await saveSequenceToServer(seq);
  showToast(`Added '${val}' to sequence queue!`, 'success');
}

async function saveSequenceToServer(newSequence, version) {
  const targetId = getActiveEventId();
  const ver = version || localSeqVersion || Date.now();
  try {
    const res = await fetch(`/api/events/${targetId}/sequence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: newSequence,
        current_index: 0,
        seq_version: ver
      })
    });
    const data = await res.json();
    if (data.success) {
      currentEvent = data.event;
      if (data.seq_version) {
        localSeqVersion = Math.max(localSeqVersion, Number(data.seq_version));
      }
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      if (sideCurrent) sideCurrent.textContent = (currentEvent.sequence[0] || {}).tag_no || 'Queue Finished';
      const sideNext = document.getElementById('sidebarNextTag');
      if (sideNext) sideNext.textContent = (currentEvent.sequence[1] || {}).tag_no || 'None';
      notifySequenceBroadcast(targetId);
    }
  } catch (err) {
    console.warn('Network sync notice on sequence save:', err);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
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
