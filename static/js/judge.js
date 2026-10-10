// Judge Portal Logic with Reality-Show Stage Doors (Open/Close) and Next Team Real-Time Display
let pathSegment = window.location.pathname.split('/').filter(Boolean).pop();
let eventId = (pathSegment && !['judge', 'judges', 'sequence', 'projector', 'admin'].includes(pathSegment)) ? pathSegment : 'evt-agrash';

let currentEvent = null;
let activeJudge = null; // { id, name }
let currentScores = {};
let currentTagNo = null;
let currentNotes = '';
let nextTagNo = null;
let nextNotes = '';
let lastSubmittedTag = null;
let isDoorsClosed = false;

// Particle Canvas for DID Stage Reveal
let particleCanvas = null;
let particleCtx = null;
let particleAnimationId = null;
let particles = [];

// Real-time synchronization channel
let syncChannel = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('stage_sequence_sync');
    syncChannel.onmessage = (e) => {
      if (e.data && (!e.data.eventId || e.data.eventId === eventId)) {
        loadEventData();
      }
    };
  } catch (err) {
    console.warn('BroadcastChannel not supported/available:', err);
  }
}

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

  initParticleCanvas();
  loadEventData();
  
  // Continuous real-time polling (every 1 second) for zero-delay synchronization across devices
  setInterval(loadEventData, 1000);

  // Instant local storage event for multi-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'stage_sequence_last_update') {
      loadEventData();
    }
  });

  // Re-sync on window focus or tab visibility
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadEventData();
    }
  });
  window.addEventListener('focus', loadEventData);
});

async function loadEventData() {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    const data = await res.json();
    if (data.success) {
      const isFirstLoad = !currentEvent;
      const prevTag = currentTagNo;
      const prevNextTag = nextTagNo;

      currentEvent = data.event;
      currentTagNo = data.current_tag || 'NO TAG';
      currentNotes = data.current_notes || '';
      nextTagNo = data.next_tag || 'End of Queue';
      nextNotes = data.next_notes || '';

      // Update Nav title
      const navTitle = document.getElementById('eventTitleNav');
      if (navTitle) navTitle.innerHTML = `${escapeHtml(currentEvent.name)} • <span>Judge Panel</span>`;

      // Update Current Tag Display
      const currentTagDisp = document.getElementById('currentTagDisplay');
      if (currentTagDisp) currentTagDisp.textContent = currentTagNo;

      const submitTagDisp = document.getElementById('btnSubmitTag');
      if (submitTagDisp) submitTagDisp.textContent = currentTagNo;

      // Update Next Tag Display in Top Hero
      const nextTagDisp = document.getElementById('nextTagDisplay');
      if (nextTagDisp) {
        if (nextTagDisp.textContent !== nextTagNo) {
          nextTagDisp.textContent = nextTagNo;
          nextTagDisp.classList.remove('tag-updated-anim');
          void nextTagDisp.offsetWidth;
          nextTagDisp.classList.add('tag-updated-anim');
        }
      }
      
      // TRANSPARENCY: Remove school names from judge portal frontend (blind evaluation protocol)
      const curSchool = document.getElementById('currentTagSchool');
      if (curSchool) curSchool.textContent = 'Official Stage Performance • Blind Evaluation Active';
      
      const nxtSchool = document.getElementById('nextTagSchool');
      if (nxtSchool) nxtSchool.textContent = nextTagNo !== 'End of Queue' ? 'Next Up in Queue' : 'Queue Finished';

      // Always update Door Card Next Team Info in real-time (especially while doors are closed!)
      updateDoorCardInfo();

      // If active tag changed from sequence manager (e.g. Next team brought to stage):
      if (prevTag && prevTag !== currentTagNo && currentTagNo !== 'NO TAG') {
        // Automatically open the stage doors and reveal the new team on stage!
        openStageDoors();
        renderCriteriaSection();
        loadExistingScoresForTag();
        triggerStageReveal(currentTagNo, '', currentEvent.name);
      }

      // If no judge chosen, show modal
      if (!activeJudge) {
        showJudgeSelectionModal();
      } else {
        if (isFirstLoad) {
          renderCriteriaSection();
          loadExistingScoresForTag();
        }
      }
    }
  } catch (err) {
    console.error('Error fetching event data:', err);
  }
}

function updateDoorCardInfo() {
  const doorTag = document.getElementById('doorNextTagTitle');
  const doorSchool = document.getElementById('doorNextSchoolName');
  const doorCat = document.getElementById('doorNextCategoryBadge');

  if (doorTag) {
    const formattedTag = nextTagNo || '--';
    if (doorTag.textContent !== formattedTag) {
      doorTag.textContent = formattedTag;
      doorTag.classList.remove('tag-updated-anim');
      void doorTag.offsetWidth;
      doorTag.classList.add('tag-updated-anim');
    }
  }

  // TRANSPARENCY: Keep school names hidden on Judge Portal frontend
  if (doorSchool) {
    doorSchool.textContent = nextTagNo !== 'End of Queue' ? 'Next Performance on Deck' : 'Stage Queue Finished';
  }

  if (doorCat) {
    doorCat.textContent = currentEvent ? `${currentEvent.name} • Stage Sequence` : 'Live Category';
  }
}

/**
 * 🚪 Close Stage Doors with Metallic Sound and Display Next Team Card
 */
function closeStageDoors() {
  isDoorsClosed = true;
  const viewport = document.getElementById('stageDoorsViewport');
  if (viewport) {
    viewport.classList.add('active');
    viewport.classList.add('doors-closed');
  }

  updateDoorCardInfo();
  if (window.lucide) lucide.createIcons();
}

/**
 * 🚪 Open Stage Doors to Reveal On-Stage Team & Criteria Marks
 */
function openStageDoors() {
  isDoorsClosed = false;
  const viewport = document.getElementById('stageDoorsViewport');
  if (viewport) {
    viewport.classList.remove('doors-closed');
    setTimeout(() => {
      viewport.classList.remove('active');
    }, 900);
  }

  // Stagger animate criteria cards
  const cards = document.querySelectorAll('.criteria-card');
  cards.forEach((card, i) => {
    card.classList.remove('animate-in');
    void card.offsetWidth;
    card.style.animationDelay = `${i * 0.08}s`;
    card.classList.add('animate-in');
  });

  if (window.lucide) lucide.createIcons();
}

function reopenCurrentScoring() {
  openStageDoors();
  showToast('Stage doors opened. You can edit your submitted marks and click update.', 'info');
}

/**
 * 🌟 Submit Evaluation: Auto-Close Stage Doors & Show Next Team Card Steadily
 */
async function submitEvaluation() {
  if (!activeJudge) {
    showToast('Please select your judge profile first', 'error');
    showJudgeSelectionModal();
    return;
  }

  if (!currentTagNo || currentTagNo === 'NO TAG') {
    showToast('No active team currently on stage to evaluate', 'error');
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
        scores: currentScores
      })
    });

    const data = await res.json();
    if (data.success) {
      // 1. Play Sound & Confetti
      try {
        const audio = document.getElementById('submitSound');
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      } catch (e) {}

      if (window.confetti) {
        confetti({
          particleCount: 75,
          spread: 80,
          origin: { y: 0.7 },
          colors: ['#fbbf24', '#ff2a4b', '#00e5ff', '#34d399', '#ffffff']
        });
      }

      showToast(`🎯 Score of ${data.score.total}/100 locked for ${currentTagNo}!`, 'success');

      // 2. Update Closed Door Summary & Reopen button
      lastSubmittedTag = currentTagNo;
      document.getElementById('doorSubmittedTotal').textContent = data.score.total;
      document.getElementById('doorSubmittedTag').textContent = currentTagNo;
      document.getElementById('doorSubmittedStatusBadge').style.display = 'inline-flex';
      document.getElementById('btnDoorReopen').style.display = 'inline-flex';

      // 3. Immediately refresh latest event sequence info and close the Stage Doors
      await loadEventData();
      closeStageDoors();

    } else {
      showToast(data.error || 'Failed to submit score', 'error');
    }
  } catch (err) {
    showToast('Network error while submitting score', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check-circle-2"></i> Submit Score for <span id="btnSubmitTag">${currentTagNo}</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

/**
 * 🌟 Trigger Dance India Dance Style Fullscreen Stage Reveal
 */
function triggerStageReveal(tagNo, schoolInfo, eventName) {
  const overlay = document.getElementById('stageRevealOverlay');
  if (!overlay) return;

  const tagText = document.getElementById('revealTagNumber');
  if (tagText) tagText.textContent = tagNo || '--';

  const evText = document.getElementById('revealEventName');
  if (evText) evText.textContent = (eventName || 'AGRASH 2026').toUpperCase();
  
  // TRANSPARENCY: Mask school info on judge portal for 100% blind scoring
  const schoolTitle = document.getElementById('revealSchoolName');
  const roomInfo = document.getElementById('revealRoomInfo');

  if (schoolTitle) {
    schoolTitle.textContent = 'Official Participant Performance';
  }
  if (roomInfo) {
    roomInfo.textContent = 'Live Stage Session • Blind Evaluation Active';
  }

  overlay.classList.add('active');
  startParticleAnimation();

  // Auto-dismiss reveal after 3.5 seconds
  setTimeout(() => {
    dismissStageReveal();
  }, 3500);
}

function dismissStageReveal() {
  const overlay = document.getElementById('stageRevealOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  stopParticleAnimation();
}

/**
 * Particle Canvas Engine for DID Stage Entrance
 */
function initParticleCanvas() {
  particleCanvas = document.getElementById('stageParticleCanvas');
  if (!particleCanvas) return;
  particleCtx = particleCanvas.getContext('2d');
  resizeParticleCanvas();
  window.addEventListener('resize', resizeParticleCanvas);
}

function resizeParticleCanvas() {
  if (!particleCanvas) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function startParticleAnimation() {
  if (!particleCanvas || !particleCtx) return;
  particles = [];
  const count = Math.min(window.innerWidth > 768 ? 120 : 60, 150);
  const colors = ['#fbbf24', '#00e5ff', '#ff2a4b', '#34d399', '#ffffff'];

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * particleCanvas.width,
      y: Math.random() * particleCanvas.height,
      radius: Math.random() * 3 + 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 4 - 1,
      alpha: Math.random() * 0.8 + 0.2,
      decay: Math.random() * 0.005 + 0.002
    });
  }

  function loop() {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0 || p.y < 0) {
        p.x = Math.random() * particleCanvas.width;
        p.y = particleCanvas.height + 10;
        p.alpha = Math.random() * 0.8 + 0.2;
      }

      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      particleCtx.fillStyle = p.color;
      particleCtx.globalAlpha = Math.max(0, p.alpha);
      particleCtx.shadowBlur = 10;
      particleCtx.shadowColor = p.color;
      particleCtx.fill();
    }
    particleCtx.globalAlpha = 1;
    particleAnimationId = requestAnimationFrame(loop);
  }

  if (particleAnimationId) cancelAnimationFrame(particleAnimationId);
  loop();
}

function stopParticleAnimation() {
  if (particleAnimationId) {
    cancelAnimationFrame(particleAnimationId);
    particleAnimationId = null;
  }
  if (particleCtx && particleCanvas) {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
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

async function addNewJudgeFromPortal() {
  const name = prompt('Enter your judge name or title (e.g. Dr. Sharma / Prof. Verma):');
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    showToast('Judge name cannot be empty', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/events/${eventId}/add-judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    });
    const data = await res.json();
    if (data.success && data.event && data.event.judges) {
      currentEvent = data.event;
      const newJudge = data.event.judges.find(j => j.name.toLowerCase() === trimmed.toLowerCase()) || data.event.judges[data.event.judges.length - 1];
      selectJudge(newJudge.id, newJudge.name);
    } else {
      showToast(data.error || 'Failed to add judge profile', 'error');
    }
  } catch (e) {
    showToast('Network error adding judge', 'error');
  }
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
      <div class="criteria-card animate-in" id="card-${crit.id}" style="animation-delay: ${idx * 0.08}s;">
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

// Fetch any existing scores judge already gave to this tag
async function loadExistingScoresForTag() {
  if (!activeJudge || !currentTagNo || currentTagNo === 'NO TAG') return;

  try {
    const res = await fetch(`/api/events/${eventId}/scores`);
    const data = await res.json();
    if (data.success && data.scores) {
      const myScore = data.scores.find(s => s.tag_no === currentTagNo && s.judge_id === activeJudge.id);
      if (myScore && myScore.scores) {
        currentScores = myScore.scores;
        for (let critId in myScore.scores) {
          const val = myScore.scores[critId];
          const numInput = document.getElementById(`num-${critId}`);
          const slider = document.getElementById(`slider-${critId}`);
          if (numInput) numInput.value = val;
          if (slider) slider.value = val;
          updateQuickBtnHighlight(critId, val);
        }
        recalculateTotal();
        document.getElementById('scoreStatusMessage').innerHTML = `<span style="color: #34d399;">✓ Submitted (${myScore.total}/100)</span>`;
      }
      if (window.lucide) lucide.createIcons();
    }
  } catch (e) {}
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
