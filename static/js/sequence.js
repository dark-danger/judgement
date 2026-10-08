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
      if (badge) badge.textContent = `${currentEvent.sequence.length} Teams in Queue`;
      
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      if (sideCurrent) sideCurrent.textContent = data.current_tag || 'Queue Finished';
      
      const sideNext = document.getElementById('sidebarNextTag');
      if (sideNext) sideNext.textContent = data.next_tag || 'None';

      renderSequenceList(currentEvent.sequence);
      renderCompletedList(data.completed_tags || []);
    }
  } catch (err) {
    console.error('Error loading sequence:', err);
  }
}

function renderSequenceList(sequence) {
  const container = document.getElementById('sequenceList');
  if (!container) return;

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
    const isStage = (idx === 0);
    const isNext = (idx === 1);

    return `
      <div class="sequence-item ${isStage ? 'is-current' : ''} ${isNext ? 'is-next' : ''}" id="seq-item-${idx}" style="${isStage ? 'border: 2px solid #ff2a4b; background: linear-gradient(135deg, rgba(255,42,75,0.18), rgba(4,6,10,0.9)); box-shadow: 0 0 25px rgba(255,42,75,0.3);' : ''}">
        <div class="item-left">
          <span class="seq-order-badge" style="${isStage ? 'background: #ff2a4b; color: #fff; font-weight: 900;' : ''}">#${idx + 1}</span>
          <div>
            <div class="seq-tag-name" style="${isStage ? 'font-size: 1.45rem; color: #fff; text-shadow: 0 0 15px rgba(255,42,75,0.5);' : ''}">
              ${escapeHtml(item.tag_no)}
            </div>
            ${item.notes ? `<div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 0.15rem;">${escapeHtml(item.notes)}</div>` : ''}
            <div style="display: flex; gap: 0.45rem; margin-top: 0.3rem;">
              ${isStage ? '<span class="badge badge-live" style="font-size: 0.78rem; padding: 0.2rem 0.6rem;"><span class="dot-pulse"></span> LIVE ON STAGE</span>' : ''}
              ${isNext ? '<span class="badge badge-next" style="font-size: 0.75rem; padding: 0.2rem 0.55rem;">NEXT UP</span>' : ''}
            </div>
          </div>
        </div>

        <div class="item-actions">
          <!-- Complete & Remove Button -->
          ${isStage ? `
            <button class="btn btn-emerald btn-md" onclick="completeTagAction(0, '${escapeHtml(item.tag_no)}')" title="Complete presentation & bring next team to stage">
              <i data-lucide="check-check"></i> Complete & Next
            </button>
          ` : `
            <button class="btn btn-sm btn-ghost" onclick="completeTagAction(${idx}, '${escapeHtml(item.tag_no)}')" title="Remove this tag from queue" style="color: #f87171;">
              <i data-lucide="trash-2"></i> Remove
            </button>
            <button class="btn btn-sm btn-cyan" onclick="bringToStageAction(${idx})" title="Bring this team to #1 Live on Stage">
              <i data-lucide="chevrons-up"></i> Bring to Stage
            </button>
          `}

          <!-- Move Up (Uppar) -->
          <button class="btn-icon" onclick="moveTagUp(${idx})" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.25;"' : ''}>
            <i data-lucide="chevron-up"></i>
          </button>

          <!-- Move Down (Nicha) -->
          <button class="btn-icon" onclick="moveTagDown(${idx})" title="Move Down" ${idx === sequence.length - 1 ? 'disabled style="opacity:0.25;"' : ''}>
            <i data-lucide="chevron-down"></i>
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
    container.innerHTML = `<div style="color: var(--text-dim); font-size: 0.82rem; padding: 0.5rem 0;">No completed teams yet.</div>`;
    return;
  }

  container.innerHTML = completedTags.slice(-15).reverse().map(item => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 0.55rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
      <div>
        <strong style="color: #34d399; font-family: var(--font-heading); font-size: 0.95rem;">${escapeHtml(item.tag_no)}</strong>
        <span style="color: var(--text-dim); font-size: 0.75rem; margin-left: 0.5rem;">Completed at ${item.completed_at || 'Just now'}</span>
      </div>
      <button class="btn btn-ghost btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;" onclick="restoreTagAction('${escapeHtml(item.tag_no)}')" title="Restore back to bottom of active queue">
        <i data-lucide="rotate-ccw"></i> Restore
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

// Complete and Remove Tag (Instant Top Pop)
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
      showToast(`✓ Completed '${tagNo}'! Next team is now live on stage.`, 'success');
      loadSequenceData();
    } else {
      showToast(`Notice: ${data.error || 'Could not complete tag'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to complete tag', 'error');
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
async function bringToStageAction(idx) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/current-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: idx })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Brought '${currentEvent.sequence[idx].tag_no}' to Stage!`, 'success');
      loadSequenceData();
    } else {
      showToast(`Notice: ${data.error || 'Could not bring to stage'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to update stage', 'error');
  }
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
      showToast(`Notice: ${data.error || 'Failed to restore tag'}`, 'error');
    }
  } catch (e) {
    showToast('Failed to restore tag', 'error');
  }
}

// Sequence Order Shift (Uppar, Nicha)
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
  await saveSequenceToServer(seq);
  showToast(`Added '${val}' to sequence queue!`, 'success');
}

async function saveSequenceToServer(newSequence) {
  const targetId = getActiveEventId();
  try {
    const res = await fetch(`/api/events/${targetId}/sequence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequence: newSequence,
        current_index: 0
      })
    });
    const data = await res.json();
    if (data.success) {
      currentEvent = data.event;
      renderSequenceList(currentEvent.sequence);
      const sideCurrent = document.getElementById('sidebarCurrentTag');
      if (sideCurrent) sideCurrent.textContent = (currentEvent.sequence[0] || {}).tag_no || 'Queue Finished';
      const sideNext = document.getElementById('sidebarNextTag');
      if (sideNext) sideNext.textContent = (currentEvent.sequence[1] || {}).tag_no || 'None';
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
