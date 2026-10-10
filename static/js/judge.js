// Judge Portal Logic with Reality-Show Stage Doors (Open/Close) and Strict Non-Interruption Scoring
const pathParts = window.location.pathname.split('/').filter(Boolean);
let eventId = 'evt-agrash';
let targetJudgeId = null;

// Parse Query parameters (e.g. ?judge=j1 or ?judge_id=j1 or ?event=evt-dance)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('judge')) targetJudgeId = urlParams.get('judge').trim();
if (urlParams.get('judge_id')) targetJudgeId = urlParams.get('judge_id').trim();
if (urlParams.get('event')) eventId = urlParams.get('event').trim();

// Parse Path segments: e.g. /judge/evt-dance/j1 or /judge/evt-dance
if (pathParts.length >= 2 && pathParts[0] === 'judge') {
  eventId = pathParts[1];
  if (pathParts.length >= 3) {
    targetJudgeId = pathParts[2];
  }
} else if (pathParts.length === 1 && !['judge', 'judges', 'sequence', 'projector', 'admin', 'registration'].includes(pathParts[0])) {
  eventId = pathParts[0];
}

let currentEvent = null;
let activeJudge = null; // { id, name }
let currentScores = {};

// Active evaluation session for the judge:
let evaluatingTagNo = null;              // Tag currently loaded on judge's scoring sheet
let hasSubmittedForEvaluatingTag = false; // Whether judge has submitted score for evaluatingTagNo
let lastSubmittedTag = null;
let isDoorsClosed = false;

// Notification state
let notifiedTagForFastScoring = null;

// Server state:
let serverCurrentTag = null;
let serverNextTag = null;

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
      currentEvent = data.event;

      serverCurrentTag = data.current_tag || 'NO TAG';
      serverNextTag = data.next_tag || 'End of Queue';

      // Update Nav title
      const navTitle = document.getElementById('eventTitleNav');
      if (navTitle) navTitle.innerHTML = `${escapeHtml(currentEvent.name)} • <span>Judge Panel</span>`;

      // 1. Initial startup logic
      if (isFirstLoad) {
        evaluatingTagNo = serverCurrentTag;
        hasSubmittedForEvaluatingTag = false;

        // Auto-detect judge from personalized link if targetJudgeId is present in URL
        if (targetJudgeId && currentEvent.judges) {
          const matched = currentEvent.judges.find(j => 
            String(j.id).toLowerCase() === String(targetJudgeId).toLowerCase() || 
            String(j.name).toLowerCase() === String(targetJudgeId).toLowerCase()
          );
          if (matched) {
            activeJudge = { id: matched.id, name: matched.name };
            localStorage.setItem(`judge_session_${eventId}`, JSON.stringify(activeJudge));
            updateJudgeUI();
          }
        }

        if (activeJudge) {
          updateJudgeUI();
          // Check if judge has already submitted score for this tag
          const existingScore = await checkExistingScoreForTag(evaluatingTagNo);
          if (existingScore) {
            hasSubmittedForEvaluatingTag = true;
            lastSubmittedTag = evaluatingTagNo;
            document.getElementById('doorSubmittedTotal').textContent = existingScore.total;
            document.getElementById('doorSubmittedTag').textContent = evaluatingTagNo;
            document.getElementById('doorSubmittedStatusBadge').style.display = 'inline-flex';
            document.getElementById('btnDoorReopen').style.display = 'inline-flex';
            closeStageDoors();
          } else {
            renderCriteriaSection();
            openStageDoors();
          }
        } else {
          showJudgeSelectionModal();
        }
      } 
      // 2. Subsequent live synchronization logic
      else {
        // SCENARIO A: Judge has NOT submitted yet for evaluatingTagNo and doors are open
        // CRITICAL: Keep judge locked on evaluatingTagNo even if sequence moves ahead on stage!
        if (!hasSubmittedForEvaluatingTag && !isDoorsClosed && evaluatingTagNo && evaluatingTagNo !== 'NO TAG') {
          const isBackendAdvanced = (serverCurrentTag !== evaluatingTagNo && serverCurrentTag !== 'NO TAG');

          // Pending notice badge in current team card
          const pendingBadge = document.getElementById('currentTagPendingNotice');
          if (pendingBadge) {
            pendingBadge.style.display = isBackendAdvanced ? 'block' : 'none';
          }

          // Urgent fast scoring banner & notification
          const urgentBanner = document.getElementById('urgentFastScoringBanner');
          const urgentTagTarget = document.getElementById('urgentTagTarget');
          const urgentNextTarget = document.getElementById('urgentNextTarget');
          if (urgentBanner) {
            if (isBackendAdvanced) {
              urgentBanner.style.display = 'flex';
              if (urgentTagTarget) urgentTagTarget.textContent = evaluatingTagNo;
              if (urgentNextTarget) urgentNextTarget.textContent = serverCurrentTag;

              // High-priority toast notification: "Please score the team fast because next team is coming"
              if (notifiedTagForFastScoring !== evaluatingTagNo) {
                notifiedTagForFastScoring = evaluatingTagNo;
                showToast(`⚡ Please score team ${evaluatingTagNo} fast because next team (${serverCurrentTag}) is coming on stage!`, 'warning');
              }
            } else {
              urgentBanner.style.display = 'none';
            }
          }

          // Update Next Coming Team Box in Hero
          const nextTagDisp = document.getElementById('nextTagDisplay');
          const nextTagLabel = document.getElementById('nextTagSchool');
          if (nextTagDisp) {
            const displayNext = isBackendAdvanced ? serverCurrentTag : serverNextTag;
            if (nextTagDisp.textContent !== displayNext) {
              nextTagDisp.textContent = displayNext;
              nextTagDisp.classList.remove('tag-updated-anim');
              void nextTagDisp.offsetWidth;
              nextTagDisp.classList.add('tag-updated-anim');
            }
          }
          if (nextTagLabel) {
            nextTagLabel.textContent = isBackendAdvanced 
              ? 'Now Live on Stage (Waiting for your submit)' 
              : (serverNextTag !== 'End of Queue' ? 'Next Up in Queue' : 'Queue Finished');
          }
        }
        // SCENARIO B: Judge HAS submitted evaluatingTagNo OR Doors are Closed waiting for next team
        else {
          const urgentBanner = document.getElementById('urgentFastScoringBanner');
          if (urgentBanner) urgentBanner.style.display = 'none';

          const pendingBadge = document.getElementById('currentTagPendingNotice');
          if (pendingBadge) pendingBadge.style.display = 'none';

          // If server's on-stage team is different from evaluatingTagNo (and valid), advance to the new team!
          if (serverCurrentTag !== evaluatingTagNo && serverCurrentTag !== 'NO TAG') {
            evaluatingTagNo = serverCurrentTag;
            hasSubmittedForEvaluatingTag = false;
            notifiedTagForFastScoring = null;

            openStageDoors();
            renderCriteriaSection();
            loadExistingScoresForTag(evaluatingTagNo);
            triggerStageReveal(evaluatingTagNo, '', currentEvent.name);
          } else {
            // Keep doors closed, showing updated next team in queue
            const nextTagDisp = document.getElementById('nextTagDisplay');
            if (nextTagDisp && nextTagDisp.textContent !== serverNextTag) {
              nextTagDisp.textContent = serverNextTag;
              nextTagDisp.classList.remove('tag-updated-anim');
              void nextTagDisp.offsetWidth;
              nextTagDisp.classList.add('tag-updated-anim');
            }
          }
        }
      }

      // Update Current Tag Display for whichever tag the judge is evaluating
      const currentTagDisp = document.getElementById('currentTagDisplay');
      if (currentTagDisp) currentTagDisp.textContent = evaluatingTagNo || serverCurrentTag || '--';

      const submitTagDisp = document.getElementById('btnSubmitTag');
      if (submitTagDisp) submitTagDisp.textContent = evaluatingTagNo || serverCurrentTag || '--';

      // TRANSPARENCY: Remove school names from judge portal frontend
      const curSchool = document.getElementById('currentTagSchool');
      if (curSchool) curSchool.textContent = 'Official Stage Performance • Blind Evaluation Active';

      // Update Door Card Next Team Info
      updateDoorCardInfo();
    }
  } catch (err) {
    console.error('Error fetching event data:', err);
  }
}

function updateDoorCardInfo() {
  const doorTag = document.getElementById('doorNextTagTitle');
  const doorSchool = document.getElementById('doorNextSchoolName');
  const doorCat = document.getElementById('doorNextCategoryBadge');

  // Next team to show on closed doors is serverCurrentTag (if judge just finished previous) or serverNextTag
  let targetNext = serverNextTag;
  if (serverCurrentTag && serverCurrentTag !== evaluatingTagNo && serverCurrentTag !== 'NO TAG') {
    targetNext = serverCurrentTag;
  }

  if (doorTag) {
    const formattedTag = targetNext || '--';
    if (doorTag.textContent !== formattedTag) {
      doorTag.textContent = formattedTag;
      doorTag.classList.remove('tag-updated-anim');
      void doorTag.offsetWidth;
      doorTag.classList.add('tag-updated-anim');
    }
  }

  // TRANSPARENCY: Keep school names hidden on Judge Portal frontend
  if (doorSchool) {
    doorSchool.textContent = targetNext !== 'End of Queue' ? 'Next Performance on Deck' : 'Stage Queue Finished';
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
  hasSubmittedForEvaluatingTag = false;
  notifiedTagForFastScoring = null;
  if (lastSubmittedTag) {
    evaluatingTagNo = lastSubmittedTag;
  }
  openStageDoors();
  renderCriteriaSection();
  loadExistingScoresForTag(evaluatingTagNo);
  showToast(`Stage doors opened for ${evaluatingTagNo}. Edit your submitted marks and click update.`, 'info');
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

  const targetTag = evaluatingTagNo || serverCurrentTag;
  if (!targetTag || targetTag === 'NO TAG') {
    showToast('No active team currently to evaluate', 'error');
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
        tag_no: targetTag,
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
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f43f5e', '#38bdf8', '#ffffff']
        });
      }

      showToast(`🎯 Score of ${data.score.total}/100 locked for ${targetTag}!`, 'success');

      hasSubmittedForEvaluatingTag = true;
      lastSubmittedTag = targetTag;
      notifiedTagForFastScoring = null;

      const urgentBanner = document.getElementById('urgentFastScoringBanner');
      if (urgentBanner) urgentBanner.style.display = 'none';

      document.getElementById('doorSubmittedTotal').textContent = data.score.total;
      document.getElementById('doorSubmittedTag').textContent = targetTag;
      document.getElementById('doorSubmittedStatusBadge').style.display = 'inline-flex';
      document.getElementById('btnDoorReopen').style.display = 'inline-flex';

      // 2. Fetch latest server state to see if stage sequence already moved ahead
      const resLatest = await fetch(`/api/events/${eventId}`);
      const latestData = await resLatest.json();
      if (latestData.success) {
        currentEvent = latestData.event;
        serverCurrentTag = latestData.current_tag || 'NO TAG';
        serverNextTag = latestData.next_tag || 'End of Queue';
      }

      // 3. If stage sequence has already moved ahead to another team (e.g. D34 while judge was scoring D22):
      if (serverCurrentTag && serverCurrentTag !== targetTag && serverCurrentTag !== 'NO TAG') {
        // Quick 1.2s closed door transition, then seamlessly open doors for the new on-stage team!
        closeStageDoors();
        setTimeout(() => {
          evaluatingTagNo = serverCurrentTag;
          hasSubmittedForEvaluatingTag = false;
          notifiedTagForFastScoring = null;
          openStageDoors();
          renderCriteriaSection();
          loadExistingScoresForTag(evaluatingTagNo);
          triggerStageReveal(evaluatingTagNo, '', currentEvent.name);
        }, 1200);
      } else {
        // Sequence has not advanced yet -> Stay closed waiting for next team call
        closeStageDoors();
      }

    } else {
      showToast(data.error || 'Failed to submit score', 'error');
    }
  } catch (err) {
    showToast('Network error while submitting score', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check-circle-2"></i> Submit Score for <span id="btnSubmitTag">${evaluatingTagNo || '--'}</span>`;
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
      colors: ['#fbbf24', '#f43f5e', '#38bdf8', '#ffffff']
    });
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

async function selectJudge(id, name) {
  activeJudge = { id, name };
  localStorage.setItem(`judge_session_${eventId}`, JSON.stringify(activeJudge));
  document.getElementById('judgeModal').classList.remove('active');
  updateJudgeUI();

  // Check if judge already submitted for evaluatingTagNo
  const target = evaluatingTagNo || serverCurrentTag;
  const existing = await checkExistingScoreForTag(target);
  if (existing) {
    hasSubmittedForEvaluatingTag = true;
    lastSubmittedTag = target;
    document.getElementById('doorSubmittedTotal').textContent = existing.total;
    document.getElementById('doorSubmittedTag').textContent = lastSubmittedTag;
    document.getElementById('doorSubmittedStatusBadge').style.display = 'inline-flex';
    document.getElementById('btnDoorReopen').style.display = 'inline-flex';
    closeStageDoors();
  } else {
    hasSubmittedForEvaluatingTag = false;
    renderCriteriaSection();
    loadExistingScoresForTag(target);
    openStageDoors();
  }

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
async function checkExistingScoreForTag(tagNo) {
  if (!activeJudge || !tagNo || tagNo === 'NO TAG') return null;
  try {
    const res = await fetch(`/api/events/${eventId}/scores`);
    const data = await res.json();
    if (data.success && data.scores) {
      return data.scores.find(s => s.tag_no === tagNo && s.judge_id === activeJudge.id) || null;
    }
  } catch (e) {}
  return null;
}

async function loadExistingScoresForTag(tagNo) {
  if (!activeJudge || !tagNo || tagNo === 'NO TAG') return;

  try {
    const myScore = await checkExistingScoreForTag(tagNo);
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
    } else {
      document.getElementById('scoreStatusMessage').innerHTML = `All criteria ready for evaluation`;
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {}
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type} ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  const duration = (type === 'warning' || type === 'error') ? 6000 : 3500;

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
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
