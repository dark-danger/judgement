// Judge Portal Logic
const eventId = window.location.pathname.split('/').pop() || 'evt-grand-finale-2026';

let currentEvent = null;
let activeJudge = null; // { id, name }
let currentScores = {};
let currentTagNo = null;

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  
  // Check stored judge session
  const storedJudge = localStorage.getItem(`judge_session_${eventId}`);
  if (storedJudge) {
    try {
      activeJudge = JSON.parse(storedJudge);
      updateJudgeUI();
    } catch (e) {}
  }

  loadEventData();
  
  // Real-time polling every 3 seconds for sequence changes
  setInterval(loadEventData, 3000);
});

async function loadEventData() {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    if (data.success) {
      const isFirstLoad = !currentEvent;
      const prevTag = currentTagNo;

      currentEvent = data.event;
      currentTagNo = data.current_tag || 'NO TAG';

      // Update Nav title
      document.getElementById('eventTitleNav').innerHTML = `${escapeHtml(currentEvent.name)} • <span>Judge Panel</span>`;

      // Update Current & Next Tag
      document.getElementById('currentTagDisplay').textContent = currentTagNo;
      document.getElementById('btnSubmitTag').textContent = currentTagNo;
      document.getElementById('nextTagDisplay').textContent = data.next_tag || 'End of Queue';

      // Update 2-minute transition timer
      updateTransitionTimer(data.remaining_transition_seconds);

      // If no judge chosen, show modal
      if (!activeJudge) {
        showJudgeSelectionModal();
      } else {
        // Render criteria if first load or if tag changed
        if (isFirstLoad || prevTag !== currentTagNo) {
          renderCriteriaSection();
          loadExistingScoresForTag();
        }
      }
    }
  } catch (err) {
    console.error('Error fetching event data:', err);
  }
}

function updateTransitionTimer(seconds) {
  const pill = document.getElementById('transitionTimerPill');
  const txt = document.getElementById('transitionTimerText');
  if (seconds > 0) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    txt.textContent = `Next team in: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
    pill.style.background = 'rgba(245, 158, 11, 0.2)';
    pill.style.borderColor = '#f59e0b';
  } else {
    txt.textContent = 'Queue Active';
    pill.style.background = 'rgba(255, 255, 255, 0.05)';
    pill.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  }
}

function showJudgeSelectionModal() {
  const modal = document.getElementById('judgeModal');
  const list = document.getElementById('judgesListGrid');
  modal.classList.add('active');

  if (currentEvent && currentEvent.judges) {
    list.innerHTML = currentEvent.judges.map(j => `
      <button class="btn btn-secondary" style="justify-content: space-between; padding: 1rem 1.25rem; font-size: 1rem;" onclick="selectJudge('${j.id}', '${escapeHtml(j.name)}')">
        <span style="display:flex; align-items:center; gap:0.6rem;">
          <i data-lucide="user"></i> <strong>${escapeHtml(j.name)}</strong>
        </span>
        <span style="color: #38bdf8; font-size: 0.85rem; font-weight:700;">Select Profile →</span>
      </button>
    `).join('');
    if (window.lucide) lucide.createIcons();
  }
}

function selectJudge(id, name) {
  activeJudge = { id, name };
  localStorage.setItem(`judge_session_${eventId}`, JSON.stringify(activeJudge));
  document.getElementById('judgeModal').classList.remove('active');
  updateJudgeUI();
  renderCriteriaSection();
  loadExistingScoresForTag();
  showToast(`Welcome, ${name}! Your judging session is active.`, 'success');
}

function updateJudgeUI() {
  if (activeJudge) {
    document.getElementById('activeJudgeBadge').style.display = 'inline-flex';
    document.getElementById('activeJudgeNameText').textContent = activeJudge.name;
    document.getElementById('switchJudgeBtn').style.display = 'inline-flex';
  }
}

// Render 5 Criteria Scoring Cards
function renderCriteriaSection() {
  const container = document.getElementById('criteriaSection');
  if (!currentEvent || !currentEvent.criteria) return;

  currentScores = {};

  container.innerHTML = currentEvent.criteria.map((crit, idx) => {
    const defaultScore = 15;
    currentScores[crit.id] = defaultScore;

    return `
      <div class="criteria-card" id="card-${crit.id}">
        <div class="criteria-header">
          <div class="criteria-title">
            <div class="criteria-number">${idx + 1}</div>
            <div>
              <h3>${escapeHtml(crit.name)}</h3>
              <span style="font-size: 0.78rem; color: var(--text-dim);">Evaluated out of ${crit.max_marks || 20} marks</span>
            </div>
          </div>
          <div class="criteria-score-display">
            <input 
              type="number" 
              class="score-input-number" 
              id="num-${crit.id}" 
              min="0" 
              max="${crit.max_marks || 20}" 
              value="${defaultScore}"
              oninput="onNumberChange('${crit.id}', this.value)"
            >
            <span class="score-max-tag">/ ${crit.max_marks || 20}</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <input 
            type="range" 
            class="score-slider" 
            id="slider-${crit.id}" 
            min="0" 
            max="${crit.max_marks || 20}" 
            step="1" 
            value="${defaultScore}"
            oninput="onSliderChange('${crit.id}', this.value)"
          >
          <div class="quick-score-buttons">
            <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Quick Select:</span>
            ${[0, 5, 10, 12, 15, 18, 20].map(val => `
              <button type="button" class="btn-quick ${val === defaultScore ? 'active' : ''}" onclick="setQuickScore('${crit.id}', ${val})">
                ${val}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  recalculateTotal();
}

function onSliderChange(critId, val) {
  const numInput = document.getElementById(`num-${critId}`);
  if (numInput) numInput.value = val;
  currentScores[critId] = parseFloat(val);
  updateQuickBtnHighlight(critId, parseInt(val));
  recalculateTotal();
}

function onNumberChange(critId, val) {
  let num = parseFloat(val);
  if (isNaN(num)) num = 0;
  if (num > 20) num = 20;
  if (num < 0) num = 0;

  const slider = document.getElementById(`slider-${critId}`);
  if (slider) slider.value = num;
  currentScores[critId] = num;
  updateQuickBtnHighlight(critId, parseInt(num));
  recalculateTotal();
}

function setQuickScore(critId, val) {
  const numInput = document.getElementById(`num-${critId}`);
  const slider = document.getElementById(`slider-${critId}`);
  if (numInput) numInput.value = val;
  if (slider) slider.value = val;
  currentScores[critId] = val;
  updateQuickBtnHighlight(critId, val);
  recalculateTotal();
}

function updateQuickBtnHighlight(critId, val) {
  const card = document.getElementById(`card-${critId}`);
  if (card) {
    card.querySelectorAll('.btn-quick').forEach(b => {
      b.classList.toggle('active', parseInt(b.textContent.trim()) === val);
    });
  }
}

function recalculateTotal() {
  let total = 0;
  for (let k in currentScores) {
    total += (currentScores[k] || 0);
  }
  document.getElementById('totalScoreVal').textContent = total;
}

// Load existing score if already evaluated by this judge
async function loadExistingScoresForTag() {
  if (!activeJudge || !currentTagNo) return;
  try {
    const res = await fetch(`/api/events/${eventId}/scores`);
    const data = await res.json();
    if (data.success && data.scores) {
      const match = data.scores.find(s => s.tag_no === currentTagNo && s.judge_id === activeJudge.id);
      if (match && match.scores) {
        for (let critId in match.scores) {
          setQuickScore(critId, match.scores[critId]);
        }
        document.getElementById('scoreStatusMessage').innerHTML = `<span style="color: #34d399;"><i data-lucide="check"></i> Previously Submitted (${match.total}/100)</span>`;
        if (window.lucide) lucide.createIcons();
      } else {
        document.getElementById('scoreStatusMessage').textContent = 'Pending submission';
      }
    }
  } catch (e) {}
}

// Submit Scorecard
async function submitEvaluation() {
  if (!activeJudge) {
    showJudgeSelectionModal();
    return;
  }

  const btn = document.getElementById('btnSubmitScore');
  btn.disabled = true;
  btn.textContent = 'Submitting Score...';

  try {
    const res = await fetch(`/api/events/${eventId}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_no: currentTagNo,
        judge_id: activeJudge.id,
        judge_name: activeJudge.name,
        scores: currentScores,
        remarks: ''
      })
    });

    const data = await res.json();
    if (data.success) {
      playChime();
      fireConfetti();
      showToast(`Score of ${data.score.total}/100 recorded for ${currentTagNo}!`, 'success');
      document.getElementById('scoreStatusMessage').innerHTML = `<span style="color: #34d399;">✓ Submitted (${data.score.total}/100)</span>`;
    } else {
      showToast(`Error submitting score: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to submit evaluation', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check-circle-2"></i> Submit Score for <span id="btnSubmitTag">${currentTagNo}</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

function playChime() {
  try {
    const audio = document.getElementById('submitSound');
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  } catch (e) {}
}

function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.85 },
      colors: ['#38bdf8', '#818cf8', '#10b981']
    });
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
