// Sequence Controller Logic
let pathSegment = window.location.pathname.split('/').filter(Boolean).pop();
let eventId = (pathSegment && !['judge', 'judges', 'sequence', 'projector', 'admin'].includes(pathSegment)) ? pathSegment : 'evt-agrash';

let currentEvent = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  loadSequenceData();
  setInterval(loadSequenceData, 3000);
});

function getActiveEventId() {
  return (currentEvent && currentEvent.id) ? currentEvent.id : eventId;
}

async function loadSequenceData() {
  try {
    const targetId = getActiveEventId();
    const res = await fetch(`/api/events/${targetId}`);
    const data = await res.json();
    if (data.success && data.event) {
      currentEvent = data.event;
      eventId = currentEvent.id;
      
      const navTitle = document.getElementById('eventTitleNav');
      if (navTitle) navTitle.innerHTML = `${escapeHtml(currentEvent.name)} • <span>Sequence</span>`;
      
      const badge = document.getElementById('totalTagsBadge');
      if (badge) badge.textContent = `${currentEvent.sequence.length} Active in Queue`;
      
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      if (sideCurrent) sideCurrent.textContent = data.current_tag || 'Queue Finished';
      
      const sideNext = document.getElementById('sidebarNextTag');
      if (sideNext) sideNext.textContent = data.next_tag || 'None';

      renderSequenceList(currentEvent.sequence, data.current_index);
      renderCompletedList(data.completed_tags || []);
    }
  } catch (err) {
    console.error('Error loading sequence:', err);
  }
}

function renderSequenceList(sequence, currentIndex) {
  const container = document.getElementById('sequenceList');
  if (!container) return;

  if (!sequence || sequence.length === 0) {
    container.innerHTML = `
      <div class="current-team-card" style="text-align: center; padding: 3rem;">
        <i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: #10b981; margin: 0 auto 0.75rem auto;"></i>
        <h3 style="font-family: var(--font-heading); font-size: 1.4rem; color: #fff;">All Teams Completed!</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.35rem;">
          The active queue is empty. You can add more tags on the right or restore from Completed History.
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = sequence.map((item, idx) => {
    const isCurrent = idx === currentIndex;
    const isNext = idx === currentIndex + 1;

    return `
      <div class="sequence-item ${isCurrent ? 'is-current' : ''} ${isNext ? 'is-next' : ''}" id="seq-item-${idx}">
        <div class="item-left">
          <span class="seq-order-badge">#${idx + 1}</span>
          <div>
            <div class="seq-tag-name">${escapeHtml(item.tag_no)}</div>
            <div style="display: flex; gap: 0.45rem; margin-top: 0.25rem;">
              ${isCurrent ? '<span class="badge badge-live"><span class="dot-pulse"></span> LIVE ON STAGE</span>' : ''}
              ${isNext ? '<span class="badge badge-next">NEXT UP</span>' : ''}
            </div>
          </div>
        </div>

        <div class="item-actions">
          <!-- Complete & Remove Tag Button -->
          <button class="btn btn-sm btn-emerald" onclick="completeTagAction(${idx}, '${escapeHtml(item.tag_no)}')" title="Mark presentation completed and remove from queue">
            <i data-lucide="check-check"></i> Complete & Remove
          </button>

          <!-- Set to Stage Button -->
          ${!isCurrent ? `
            <button class="btn btn-sm btn-secondary" onclick="setCurrentStage(${idx})" title="Set as live on stage">
              <i data-lucide="crosshair"></i> Set On Stage
            </button>
          ` : `
            <span class="badge badge-live" style="font-size: 0.75rem;"><span class="dot-pulse"></span> ON STAGE</span>
          `}

          <!-- Move to Top (Aga) -->
          <button class="btn-icon" onclick="moveTagToTop(${idx})" title="Rush to Front (Aga)" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''}>
            <i data-lucide="chevrons-up"></i>
          </button>

          <!-- Move Up (Uppar) -->
          <button class="btn-icon" onclick="moveTagUp(${idx})" title="Move Up (Uppar)" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''}>
            <i data-lucide="chevron-up"></i>
          </button>

          <!-- Move Down (Nicha) -->
          <button class="btn-icon" onclick="moveTagDown(${idx})" title="Move Down (Nicha)" ${idx === sequence.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
            <i data-lucide="chevron-down"></i>
          </button>

          <!-- Move to Bottom (Picha) -->
          <button class="btn-icon" onclick="moveTagToBottom(${idx})" title="Send to End (Picha)" ${idx === sequence.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>
            <i data-lucide="chevrons-down"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderCompletedList(completedTags) {
  const container = document.getElementById('completedContainer');
  const countBadge = document.getElementById('completedCountBadge');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${completedTags.length} Completed`;

  if (!completedTags || completedTags.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.82rem; padding: 0.5rem 0;">No completed tags yet.</div>`;
    return;
  }

  container.innerHTML = completedTags.map(item => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 0.55rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
      <div>
        <strong style="color: #34d399; font-family: var(--font-heading); font-size: 0.95rem;">${escapeHtml(item.tag_no)}</strong>
        <span style="color: var(--text-dim); font-size: 0.75rem; margin-left: 0.5rem;">Done at ${item.completed_at || 'Just now'}</span>
      </div>
      <button class="btn btn-ghost btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;" onclick="restoreTagAction('${escapeHtml(item.tag_no)}')" title="Restore back to active queue">
        <i data-lucide="rotate-ccw"></i> Restore
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// Complete and Remove Tag
async function completeTagAction(idx, tagNo) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/complete-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx, tag_no: tagNo })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✓ Tag '${tagNo}' completed & removed from queue!`, 'success');
      loadSequenceData();
    } else {
      showToast(`Error: ${data.error || 'Failed to complete tag'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to complete tag', 'error');
  }
}

// Complete Current Active Stage Tag
async function completeCurrentActiveTag() {
  if (!currentEvent || !currentEvent.sequence || currentEvent.sequence.length === 0) {
    showToast('No active tag in queue to complete!', 'info');
    return;
  }
  const currIdx = currentEvent.current_index || 0;
  const tagNo = currentEvent.sequence[currIdx] ? currentEvent.sequence[currIdx].tag_no : currentEvent.sequence[0].tag_no;
  await completeTagAction(currIdx, tagNo);
}

// Restore Tag
async function restoreTagAction(tagNo) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/restore-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_no: tagNo })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Tag '${tagNo}' restored to queue!`, 'success');
      loadSequenceData();
    } else {
      showToast(`Error: ${data.error || 'Failed to restore tag'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to restore tag', 'error');
  }
}

// Sequence Order Shift (Uppar, Nicha, Aga, Picha)
async function moveTagUp(idx) {
  if (idx <= 0 || !currentEvent) return;
  const seq = [...currentEvent.sequence];
  const temp = seq[idx - 1];
  seq[idx - 1] = seq[idx];
  seq[idx] = temp;
  await saveSequenceToServer(seq);
}

async function moveTagDown(idx) {
  if (!currentEvent || idx >= currentEvent.sequence.length - 1) return;
  const seq = [...currentEvent.sequence];
  const temp = seq[idx + 1];
  seq[idx + 1] = seq[idx];
  seq[idx] = temp;
  await saveSequenceToServer(seq);
}

async function moveTagToTop(idx) {
  if (idx <= 0 || !currentEvent) return;
  const seq = [...currentEvent.sequence];
  const [item] = seq.splice(idx, 1);
  seq.unshift(item);
  await saveSequenceToServer(seq);
}

async function moveTagToBottom(idx) {
  if (!currentEvent || idx >= currentEvent.sequence.length - 1) return;
  const seq = [...currentEvent.sequence];
  const [item] = seq.splice(idx, 1);
  seq.push(item);
  await saveSequenceToServer(seq);
}

async function setCurrentStage(idx) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/current-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx })
    });
    const data = await res.json();
    if (data.success) {
      const tagText = (currentEvent && currentEvent.sequence[idx]) ? currentEvent.sequence[idx].tag_no : `Slot #${idx+1}`;
      showToast(`Set '${tagText}' as live on stage!`, 'success');
      loadSequenceData();
    } else {
      showToast(`Error: ${data.error || 'Failed to set on stage'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to set on stage', 'error');
  }
}

async function trigger2MinNotice() {
  if (!currentEvent) return;
  await saveSequenceToServer(currentEvent.sequence);
  showToast('2-Minute transition notice triggered on all Judge screens!', 'success');
}

async function addNewTag(e) {
  e.preventDefault();
  const input = document.getElementById('newTagInput');
  const val = input.value.trim();
  if (!val || !currentEvent) return;

  const seq = [...currentEvent.sequence, { tag_no: val, notes: '' }];
  input.value = '';
  await saveSequenceToServer(seq);
  showToast(`Added '${val}' to sequence!`, 'success');
}

async function saveSequenceToServer(newSequence) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/sequence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: newSequence,
        current_index: currentEvent ? currentEvent.current_index : 0
      })
    });
    const data = await res.json();
    if (data.success) {
      currentEvent = data.event;
      renderSequenceList(currentEvent.sequence, currentEvent.current_index);
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      if (sideCurrent) sideCurrent.textContent = (currentEvent.sequence[currentEvent.current_index] || {}).tag_no || 'Queue Finished';
      const sideNext = document.getElementById('sidebarNextTag');
      if (sideNext) sideNext.textContent = (currentEvent.sequence[currentEvent.current_index + 1] || {}).tag_no || 'None';
    }
  } catch (err) {
    showToast('Failed to save sequence', 'error');
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
