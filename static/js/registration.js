// Registration Desk Logic
let currentDeskFilter = null;
let currentSearchQuery = '';
let allSchoolsData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  // Auto-detect desk from URL e.g. /registration/1 or /desk/2
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if (pathParts.length > 1 && !isNaN(pathParts[1])) {
    const deskParam = parseInt(pathParts[1]);
    if (deskParam >= 1 && deskParam <= 5) {
      currentDeskFilter = deskParam;
      // Highlight pill
      document.querySelectorAll('.desk-pill').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === deskParam);
      });
    }
  }

  loadRegistrations();
  loadStats();

  setInterval(() => {
    loadStats();
  }, 6000);
});

async function loadRegistrations() {
  const container = document.getElementById('schoolsGrid');
  container.innerHTML = '<div style="text-align: center; padding: 2.5rem; color: var(--text-dim);"><i data-lucide="loader-2" class="spin"></i> Loading Registration Data...</div>';
  if (window.lucide) lucide.createIcons();

  try {
    let url = '/api/registration?';
    if (currentDeskFilter) url += `desk=${currentDeskFilter}&`;
    if (currentSearchQuery) url += `q=${encodeURIComponent(currentSearchQuery)}&`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.schools) {
      allSchoolsData = data.schools;
      renderSchools(data.schools);
    } else {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f87171;">Failed to load registration records</div>';
    }
  } catch (err) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f87171;">Connection error loading data</div>';
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/registration/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const st = data.stats;
      const arrivedEl = document.getElementById('statArrivedText');
      const percentEl = document.getElementById('statPercentText');
      if (arrivedEl) arrivedEl.textContent = `${st.arrived_schools} / ${st.total_schools}`;
      if (percentEl) percentEl.textContent = `${st.arrived_percentage}%`;
    }
  } catch (e) {}
}

function renderSchools(schools) {
  const container = document.getElementById('schoolsGrid');
  const countText = document.getElementById('showingCountText');

  if (countText) {
    const deskLabel = currentDeskFilter ? `Desk ${currentDeskFilter}` : 'All Desks';
    countText.textContent = `Showing ${schools.length} Schools (${deskLabel})`;
  }

  if (schools.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; background: rgba(0,0,0,0.4); border-radius: var(--radius-lg); border: 1px solid var(--border-glass);">
        <i data-lucide="search-x" style="width: 36px; height: 36px; color: var(--text-dim); margin-bottom: 0.5rem;"></i>
        <h4 style="color: #fff; margin-bottom: 0.25rem;">No matching schools found</h4>
        <p style="font-size: 0.8rem; color: var(--text-dim);">Try searching with another school name, tag number, or room code.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = '';
  schools.forEach((s) => {
    const card = document.createElement('div');
    card.className = `school-reg-card ${s.is_arrived ? 'is-arrived' : ''}`;
    card.id = `school-card-${s.id}`;

    // Category chips HTML
    let eventsHtml = '';
    s.events.forEach((ev) => {
      const isPresent = ev.status === 'PRESENT';
      const isAbsent = ev.status === 'ABSENT';
      const boxClass = isPresent ? 'status-present' : (isAbsent ? 'status-absent' : '');

      eventsHtml += `
        <div class="cat-tag-box ${boxClass}" id="cat-box-${s.id}-${ev.tag_no}">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <strong style="color: #fff; font-size: 0.85rem;">${escapeHtml(ev.category)}</strong>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 800; background: rgba(0,0,0,0.6); padding: 0.15rem 0.45rem; border-radius: 4px; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.3);">
              ${escapeHtml(ev.tag_no)}
            </span>
          </div>
          
          <div style="display: flex; gap: 0.4rem; margin-top: 0.25rem;">
            <button class="btn-att-toggle btn-att-present ${isPresent ? 'active' : ''}" onclick="markCategoryAttendance('${s.id}', '${ev.category}', '${ev.tag_no}', 'PRESENT')">
              <i data-lucide="check"></i> Present
            </button>
            <button class="btn-att-toggle btn-att-absent ${isAbsent ? 'active' : ''}" onclick="markCategoryAttendance('${s.id}', '${ev.category}', '${ev.tag_no}', 'ABSENT')">
              <i data-lucide="x"></i> Absent
            </button>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 900; color: #fbbf24; background: rgba(0,0,0,0.6); padding: 0.25rem 0.6rem; border-radius: 6px; border: 1px solid rgba(251, 191, 36, 0.3);">
            #${s.seq_no}
          </span>
          <div>
            <h3 style="font-size: 1.1rem; font-weight: 800; color: #fff; line-height: 1.3;">
              ${escapeHtml(s.school_name)}
            </h3>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.78rem;">
              <span class="badge" style="background: rgba(0, 229, 255, 0.15); color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.3);">
                Desk ${s.desk_no}
              </span>
              <span class="badge" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3);">
                Room: ${escapeHtml(s.room_no)}
              </span>
              ${s.arrived_at ? `<span style="color: #10b981; font-weight: 600;">Checked in at ${s.arrived_at}</span>` : ''}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-emerald btn-sm" onclick="checkInAllCategories('${s.id}')" title="Mark all registered categories of this school as Present">
            <i data-lucide="check-check"></i> Check-In All
          </button>
        </div>
      </div>

      <!-- Categories Matrix -->
      <div class="category-chip-row">
        ${eventsHtml}
      </div>
    `;

    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

async function markCategoryAttendance(schoolId, category, tagNo, status) {
  try {
    const res = await fetch('/api/registration/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        category: category,
        tag_no: tagNo,
        status: status
      })
    });

    const data = await res.json();
    if (data.success && data.school) {
      showToast(`${tagNo} (${category}) marked ${status}! Google Sheet updated.`, status === 'PRESENT' ? 'success' : 'info');
      // Update local item
      const idx = allSchoolsData.findIndex(s => s.id === schoolId);
      if (idx !== -1) allSchoolsData[idx] = data.school;
      renderSchools(allSchoolsData);
      loadStats();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Failed to mark attendance. Check server.', 'error');
  }
}

async function checkInAllCategories(schoolId) {
  try {
    const res = await fetch('/api/registration/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: schoolId,
        status: 'PRESENT',
        mark_all: true
      })
    });

    const data = await res.json();
    if (data.success && data.school) {
      showToast(`✅ ${data.school.school_name} - All categories checked in Present!`, 'success');
      const idx = allSchoolsData.findIndex(s => s.id === schoolId);
      if (idx !== -1) allSchoolsData[idx] = data.school;
      renderSchools(allSchoolsData);
      loadStats();
    }
  } catch (err) {
    showToast('Check-in failed. Check server.', 'error');
  }
}

function selectDeskFilter(deskNo, btn) {
  currentDeskFilter = deskNo;
  document.querySelectorAll('.desk-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadRegistrations();
}

let searchDebounceTimer = null;
function onSearchInput(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSearchQuery = query.trim();
    loadRegistrations();
  }, 250);
}

async function syncRegistrationGSheet() {
  try {
    showToast('Syncing attendance matrix to Google Sheet...', 'info');
    const res = await fetch('/api/registration/sync-sheets', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Google Sheet "Master Registrations" tab updated with live attendance!', 'success');
    } else {
      showToast(`Sync response: ${data.message}`, 'info');
    }
  } catch (err) {
    showToast('Failed to trigger Google Sheet sync', 'error');
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
