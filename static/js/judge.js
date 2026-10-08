// Judge Portal Logic with Fullscreen Reality-Show (DID Style) Next Team Arena
let pathSegment = window.location.pathname.split('/').filter(Boolean).pop();
let eventId = (pathSegment && !['judge', 'judges', 'sequence', 'projector', 'admin'].includes(pathSegment)) ? pathSegment : 'evt-agrash';

let currentEvent = null;
let activeJudge = null; // { id, name }
let currentScores = {};
let currentTagNo = null;
let currentNotes = '';
let nextTagNo = null;
let nextNotes = '';
let lastRevealedTag = null;
let isScoreSubmittedForCurrentTag = false;
let lastSubmittedTag = null;

// Particle Canvas for DID Stage Reveal
let particleCanvas = null;
let particleCtx = null;
let particleAnimationId = null;
let particles = [];

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
      currentNotes = data.current_notes || '';
      nextTagNo = data.next_tag || 'End of Queue';
      nextNotes = data.next_notes || '';

      // Update Nav title
      const navTitle = document.getElementById('eventTitleNav');
      if (navTitle) navTitle.innerHTML = `${escapeHtml(currentEvent.name)} • <span>Judge Panel</span>`;

      // Update Current & Next Tag
      document.getElementById('currentTagDisplay').textContent = currentTagNo;
      document.getElementById('btnSubmitTag').textContent = currentTagNo;
      document.getElementById('nextTagDisplay').textContent = nextTagNo;
      
      const curSchool = document.getElementById('currentTagSchool');
      if (curSchool) curSchool.textContent = currentNotes || 'On Stage Performance';
      
      const nxtSchool = document.getElementById('nextTagSchool');
      if (nxtSchool) nxtSchool.textContent = nextNotes || (nextTagNo !== 'End of Queue' ? 'Preparing Next' : 'End of Queue');

      // Update Next Team Coming Arena details
      document.getElementById('arenaNextTagNumber').textContent = nextTagNo;
      document.getElementById('arenaNextSchoolName').textContent = nextNotes || (nextTagNo !== 'End of Queue' ? 'Next School Team' : 'Queue Finished');
      document.getElementById('arenaNextCategoryBadge').textContent = currentEvent ? `${currentEvent.name} • Stage Sequence` : 'Live Category';

      // Update Transition Countdown on the arena
      updateArenaCountdown(data.remaining_transition_seconds);

      // If active tag changed in sequence, reset submitted state and show new team!
      if (prevTag && prevTag !== currentTagNo && currentTagNo !== 'NO TAG') {
        isScoreSubmittedForCurrentTag = false;
        showScoringView();
        triggerStageReveal(currentTagNo, currentNotes, currentEvent.name);
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

function updateArenaCountdown(seconds) {
  const digits = document.getElementById('arenaTimerDigits');
  const progress = document.getElementById('arenaTimerProgress');
  const pill = document.getElementById('transitionTimerPill');
  const txt = document.getElementById('transitionTimerText');

  if (seconds > 0) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (digits) digits.textContent = formatted;
    if (txt) txt.textContent = `Next team in: ${formatted}`;
    if (pill) {
      pill.style.background = 'rgba(245, 158, 11, 0.2)';
      pill.style.borderColor = '#f59e0b';
    }

    if (progress) {
      const total = 120;
      const offset = 283 - (283 * (total - seconds) / total);
      progress.style.strokeDashoffset = Math.max(0, offset);
    }
  } else {
    if (digits) digits.textContent = '00:00';
    if (txt) txt.textContent = 'Queue Active';
    if (pill) {
      pill.style.background = 'rgba(255, 255, 255, 0.05)';
      pill.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }
  }
}

/**
 * 🌟 Submit Evaluation: Hide Marks System Immediately & Show Fullscreen Decorated Next Team Arena!
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
          particleCount: 80,
          spread: 80,
          origin: { y: 0.7 },
          colors: ['#fbbf24', '#ff2a4b', '#00e5ff', '#34d399', '#ffffff']
        });
      }

      showToast(`🎯 Score of ${data.score.total}/100 locked for ${currentTagNo}!`, 'success');

      // 2. Hide Marks System & Show Fullscreen "Next Team Coming" Arena
      isScoreSubmittedForCurrentTag = true;
      lastSubmittedTag = currentTagNo;
      
      document.getElementById('lockedScoreSummaryText').textContent = `${data.score.total}/100 for Tag ${currentTagNo} (${currentNotes || 'Stage Performance'})`;
      
      showNextTeamArena();
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

function showNextTeamArena() {
  document.getElementById('scoringView').style.display = 'none';
  document.getElementById('nextTeamComingScreen').style.display = 'block';
  if (window.lucide) lucide.createIcons();
}

function showScoringView() {
  document.getElementById('nextTeamComingScreen').style.display = 'none';
  document.getElementById('scoringView').style.display = 'block';
  if (window.lucide) lucide.createIcons();
}

function reopenCurrentScoring() {
  showScoringView();
  showToast('You can now edit your submitted marks and click update.', 'info');
}

function startScoringNextTeam() {
  isScoreSubmittedForCurrentTag = false;
  showScoringView();
  
  // Trigger reality show DID stage entrance banner for the active/next team
  triggerStageReveal(currentTagNo, currentNotes, currentEvent ? currentEvent.name : 'Competition');
}

/**
 * 🌟 Trigger Dance India Dance Style Fullscreen Stage Reveal
 */
function triggerStageReveal(tagNo, schoolInfo, eventName) {
  lastRevealedTag = tagNo;
  const overlay = document.getElementById('stageRevealOverlay');
  if (!overlay) return;

  document.getElementById('revealTagNumber').textContent = tagNo;
  document.getElementById('revealEventName').textContent = (eventName || 'AGRASH 2026').toUpperCase();
  
  const schoolTitle = document.getElementById('revealSchoolName');
  const roomInfo = document.getElementById('revealRoomInfo');

  if (schoolInfo) {
    schoolTitle.textContent = schoolInfo;
    roomInfo.textContent = `Live On Stage • ${eventName || 'Competition'}`;
  } else {
    schoolTitle.textContent = 'Team Ready on Stage';
    roomInfo.textContent = 'Live Evaluation Active';
  }

  // Play Sound & Confetti
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
      origin: { y: 0.6 },
      colors: ['#fbbf24', '#ff2a4b', '#00e5ff', '#ffffff']
    });
  }

  overlay.classList.add('active');
  startParticleLoop();

  if (window.lucide) lucide.createIcons();

  // Auto dismiss after 3.8 seconds
  clearTimeout(window.revealAutoTimeout);
  window.revealAutoTimeout = setTimeout(() => {
    dismissStageReveal();
  }, 3800);
}

function dismissStageReveal() {
  const overlay = document.getElementById('stageRevealOverlay');
  if (overlay) overlay.classList.remove('active');
  stopParticleLoop();

  // Stagger animate criteria cards
  const cards = document.querySelectorAll('.criteria-card');
  cards.forEach((card, i) => {
    card.classList.remove('animate-in');
    void card.offsetWidth; // trigger reflow
    card.style.animationDelay = `${i * 0.08}s`;
    card.classList.add('animate-in');
  });
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

  particles = [];
  for (let i = 0; i < 45; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 3 + 1,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5 - 0.5,
      alpha: Math.random() * 0.8 + 0.2,
      color: Math.random() > 0.5 ? '#fbbf24' : (Math.random() > 0.5 ? '#00e5ff' : '#ff4d6a')
    });
  }
}

function resizeParticleCanvas() {
  if (!particleCanvas) return;
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
}

function startParticleLoop() {
  if (particleAnimationId) cancelAnimationFrame(particleAnimationId);
  function render() {
    if (!particleCtx || !particleCanvas) return;
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = particleCanvas.width;
      if (p.x > particleCanvas.width) p.x = 0;
      if (p.y < 0) p.y = particleCanvas.height;
      if (p.y > particleCanvas.height) p.y = 0;

      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      particleCtx.fillStyle = p.color;
      particleCtx.globalAlpha = p.alpha;
      particleCtx.shadowBlur = 12;
      particleCtx.shadowColor = p.color;
      particleCtx.fill();
    });
    particleAnimationId = requestAnimationFrame(render);
  }
  render();
}

function stopParticleLoop() {
  if (particleAnimationId) cancelAnimationFrame(particleAnimationId);
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
