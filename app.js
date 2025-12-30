/**
 * Sisyphus - A daily boulder-pushing game
 */

// Dev mode - set to false for production
const DEV_MODE = true;

// ============================================
// API Client
// ============================================
const PLAYER_ID_KEY = 'sisyphus-player-id';

const api = {
  getPlayerId() {
    return localStorage.getItem(PLAYER_ID_KEY);
  },

  setPlayerId(id) {
    localStorage.setItem(PLAYER_ID_KEY, id);
  },

  async request(endpoint, options = {}) {
    const playerId = this.getPlayerId();
    const headers = {
      'Content-Type': 'application/json',
      ...(playerId && { 'X-Player-ID': playerId }),
      ...options.headers
    };

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'API error');
      error.code = data.error;
      error.data = data;
      throw error;
    }

    return data;
  },

  async getPlayer() {
    const localDate = getTodayString();
    return this.request(`/api/player?localDate=${localDate}`);
  },

  async register() {
    const result = await this.request('/api/player/register', { method: 'POST' });
    this.setPlayerId(result.id);
    return result;
  },

  async push() {
    return this.request('/api/push', {
      method: 'POST',
      body: JSON.stringify({ localDate: getTodayString() })
    });
  },

  async acknowledgeRollback() {
    return this.request('/api/push/acknowledge-rollback', { method: 'POST' });
  },

  async getLeaderboard(limit = 100) {
    return this.request(`/api/stats/leaderboard?limit=${limit}`);
  },

  async getSurvivorship() {
    return this.request('/api/stats/survivorship');
  }
};

// ============================================
// Game State
// ============================================
const state = {
  height: 0,
  lastPlayedDate: null,
  streak: 0,
  hasPlayedToday: false,
  needsRollback: false,
  previousHeight: 0,
  totalPushes: 0,
  maxHeight: 0,
  deathCount: 0,
};

// DOM elements
const elements = {
  boulder: document.getElementById('boulder'),
  stickman: document.getElementById('stickman'),
  heightValue: document.getElementById('height-value'),
  helpBtn: document.getElementById('help-btn'),
  menuBtn: document.getElementById('menu-btn'),
  helpModal: document.getElementById('help-modal'),
  menuModal: document.getElementById('menu-modal'),
  helpClose: document.getElementById('help-close'),
  menuClose: document.getElementById('menu-close'),
  themeBtn: document.getElementById('theme-btn'),
};

// ============================================
// Theme Handling
// ============================================
function loadTheme() {
  const savedTheme = localStorage.getItem('sisyphus-theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('sisyphus-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('sisyphus-theme', 'dark');
  }
  // Re-render Greek key borders with new color
  initGreekBorders();
}

// ============================================
// Greek Key Borders
// ============================================
async function loadSvg(url) {
  const response = await fetch(url);
  return await response.text();
}

async function initButtonIcons() {
  const [hamburger, questionMark] = await Promise.all([
    loadSvg('assets/borders/hamburger.svg').catch(() => null),
    loadSvg('assets/borders/question-mark.svg').catch(() => null)
  ]);

  if (hamburger) {
    elements.menuBtn.innerHTML = hamburger;
  }
  if (questionMark && questionMark.includes('d="M')) {
    elements.helpBtn.innerHTML = questionMark;
  }
}

async function initGreekBorders() {
  const [leftCap, middleTile, rightCap] = await Promise.all([
    loadSvg('assets/borders/border-left.svg'),
    loadSvg('assets/borders/border-middle.svg'),
    loadSvg('assets/borders/border-right.svg')
  ]);

  const leftCapWidth = 30;
  const middleWidth = 24;
  const rightCapWidth = 33;
  const capsWidth = leftCapWidth + rightCapWidth;

  function buildBorder(container) {
    if (!container) return;
    const availableWidth = container.offsetWidth;
    const spaceForMiddles = availableWidth - capsWidth;
    const tilesNeeded = Math.max(0, Math.floor(spaceForMiddles / middleWidth));
    container.innerHTML = leftCap + middleTile.repeat(tilesNeeded) + rightCap;
    container.style.display = 'flex';
  }

  buildBorder(document.getElementById('greek-border-left'));
  buildBorder(document.getElementById('greek-border-right'));
  buildBorder(document.getElementById('greek-border-footer-left'));
  buildBorder(document.getElementById('greek-border-footer-right'));
}

// ============================================
// Date Utilities
// ============================================

// Debug time machine state
const debugTime = {
  enabled: false,
  date: null,      // YYYY-MM-DD
  time: null,      // HH:MM
  utcOffset: null  // hours offset from UTC (e.g., -5 for Eastern)
};

function getTodayString() {
  if (DEV_MODE && debugTime.enabled && debugTime.date && debugTime.time !== null && debugTime.utcOffset !== null) {
    // Construct a date from the debug settings
    // The debug date/time represents what the user's "local" clock shows
    // We just return that date directly since we're simulating their local date
    return debugTime.date;
  }
  return new Date().toISOString().split('T')[0];
}

function getDebugDateTime() {
  if (!debugTime.date || !debugTime.time) return null;
  return `${debugTime.date} ${debugTime.time} (UTC${debugTime.utcOffset >= 0 ? '+' : ''}${debugTime.utcOffset})`;
}

// ============================================
// State Management (Server-backed)
// ============================================
async function loadState() {
  try {
    let playerId = api.getPlayerId();

    if (!playerId) {
      // First visit - register new player
      const result = await api.register();
      playerId = result.id;
      console.log('Registered new player:', playerId);
    }

    // Fetch current state from server
    const serverState = await api.getPlayer();

    // Store player ID if server gave us one (new player case)
    if (serverState.id && !api.getPlayerId()) {
      api.setPlayerId(serverState.id);
    }

    // Update local state from server
    Object.assign(state, {
      height: serverState.height,
      streak: serverState.streak,
      lastPlayedDate: serverState.lastPlayedDate,
      hasPlayedToday: serverState.hasPlayedToday,
      needsRollback: serverState.needsRollback,
      previousHeight: serverState.previousHeight || serverState.height,
      totalPushes: serverState.totalPushes,
      maxHeight: serverState.maxHeight,
      deathCount: serverState.deathCount,
    });

    // Clear old localStorage state (server is source of truth now)
    localStorage.removeItem('sisyphus-state');

  } catch (err) {
    console.error('Failed to load state from server:', err);
    // Could show an error message to user here
  }

  updateHeightDisplay();
}

// ============================================
// Boulder Physics
// ============================================
const boulder = {
  radiusX: 40,
  radiusY: 35,
  rotation: 0,

  getCenterHeight(angle) {
    const r = (this.radiusX * this.radiusY) /
      Math.sqrt(
        Math.pow(this.radiusY * Math.cos(angle), 2) +
        Math.pow(this.radiusX * Math.sin(angle), 2)
      );
    return r;
  },

  getArcLength(startAngle, endAngle, steps = 100) {
    let length = 0;
    const dAngle = (endAngle - startAngle) / steps;
    for (let i = 0; i < steps; i++) {
      const a1 = startAngle + i * dAngle;
      const a2 = a1 + dAngle;
      const r1 = this.getCenterHeight(a1);
      const r2 = this.getCenterHeight(a2);
      length += Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(r1 * dAngle, 2));
    }
    return length;
  }
};

// Animation state
let isAnimating = false;

// ============================================
// Push Boulder (Server-validated)
// ============================================
async function pushBoulder() {
  if (isAnimating) return;
  if (!DEV_MODE && state.hasPlayedToday) return;

  // If they need to rollback, they must witness their demise first
  if (state.needsRollback && state.previousHeight > 0) {
    triggerRollback();
    return;
  }

  isAnimating = true;

  try {
    // Server validates and records the push
    const result = await api.push();

    // Update state from server response
    state.height = result.height;
    state.streak = result.streak;
    state.hasPlayedToday = true;
    state.lastPlayedDate = getTodayString();

    // Animate the push
    animatePush(() => {
      isAnimating = false;
      updateHeightDisplay();
      if (DEV_MODE && window.updateDebugStateInfo) window.updateDebugStateInfo();
    });

  } catch (err) {
    isAnimating = false;

    if (err.code === 'already_played_today') {
      state.hasPlayedToday = true;
      console.log("You've already pushed today!");
      // Could show a message to user
    } else if (err.code === 'rollback_required') {
      // Server says we need to rollback first (edge case - state was stale)
      state.needsRollback = true;
      state.previousHeight = err.data.heightLost;
      console.log('Rollback required:', err.data);
      triggerRollback();
    } else {
      console.error('Push failed:', err);
      // Could show error to user
    }
  }
}

// ============================================
// Animations
// ============================================
function animatePush(onComplete) {
  const duration = 1500;
  const startTime = performance.now();
  const startRotation = boulder.rotation;
  const targetRotation = startRotation + Math.PI * 2;
  const startHeight = state.height - 1;
  const targetHeight = state.height;

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    boulder.rotation = startRotation + (targetRotation - startRotation) * eased;
    const currentHeight = startHeight + eased;
    elements.heightValue.textContent = currentHeight.toFixed(2);

    updateBoulderVisuals();
    updateParallax(eased);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      boulder.rotation = targetRotation;
      elements.heightValue.textContent = targetHeight.toFixed(2);
      onComplete();
    }
  }

  requestAnimationFrame(animate);
}

function triggerRollback() {
  if (state.previousHeight > 0) {
    animateRollback(state.previousHeight, async () => {
      console.log('The boulder has returned to the bottom.');
      // Acknowledge rollback to server
      try {
        await api.acknowledgeRollback();
      } catch (err) {
        console.error('Failed to acknowledge rollback:', err);
      }
    });
  }
}

function animateRollback(fromHeight, onComplete) {
  isAnimating = true;

  // Skip the dramatic pause in DEV_MODE for faster testing
  if (DEV_MODE) {
    rollDown(fromHeight, onComplete);
    return;
  }

  const falseHopeDuration = 800;
  const startTime = performance.now();

  function falseHope(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / falseHopeDuration, 1);

    const hopeHeight = Math.sin(progress * Math.PI) * 0.1;
    boulder.rotation += 0.02 * (1 - progress);
    updateBoulderVisuals();

    if (progress < 1) {
      requestAnimationFrame(falseHope);
    } else {
      setTimeout(() => rollDown(fromHeight, onComplete), 300);
    }
  }

  function rollDown(height, done) {
    const rollDuration = Math.min(2000 + height * 100, 5000);
    const rollStart = performance.now();

    function roll(currentTime) {
      const elapsed = currentTime - rollStart;
      const progress = Math.min(elapsed / rollDuration, 1);

      const eased = Math.pow(progress, 2);
      const currentHeight = height * (1 - eased);

      boulder.rotation -= 0.1 * (1 + progress * 3);
      updateBoulderVisuals();

      elements.heightValue.textContent = Math.floor(currentHeight);
      updateParallax(-eased * height);

      if (progress < 1) {
        requestAnimationFrame(roll);
      } else {
        // Update local state (server already reset us)
        state.height = 0;
        state.streak = 0;
        state.hasPlayedToday = false;
        state.needsRollback = false;
        updateHeightDisplay();
        if (DEV_MODE && window.updateDebugStateInfo) window.updateDebugStateInfo();
        isAnimating = false;
        done();
      }
    }

    requestAnimationFrame(roll);
  }

  requestAnimationFrame(falseHope);
}

function updateBoulderVisuals() {
  const bob = boulder.getCenterHeight(boulder.rotation) - boulder.radiusY;
  const boulderEl = elements.boulder;
  boulderEl.style.transform = `rotate(${boulder.rotation}rad) translateY(${bob}px)`;
}

function updateParallax(progress) {
  // TODO: Implement parallax scrolling
}

function updateHeightDisplay() {
  elements.heightValue.textContent = state.height.toFixed(2);
}

// ============================================
// Modal Handling
// ============================================
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// ============================================
// Event Listeners
// ============================================
function initEventListeners() {
  elements.boulder.addEventListener('click', pushBoulder);

  elements.helpBtn.addEventListener('click', () => openModal(elements.helpModal));
  elements.menuBtn.addEventListener('click', () => openModal(elements.menuModal));

  elements.helpClose.addEventListener('click', () => closeModal(elements.helpModal));
  elements.menuClose.addEventListener('click', () => closeModal(elements.menuModal));

  elements.themeBtn.addEventListener('click', toggleTheme);

  [elements.helpModal, elements.menuModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });
}

// ============================================
// Debug Time Machine
// ============================================
function initDebugPanel() {
  if (!DEV_MODE) return;

  const panel = document.getElementById('debug-panel');
  const dateInput = document.getElementById('debug-date');
  const timeInput = document.getElementById('debug-time');
  const tzSelect = document.getElementById('debug-timezone');
  const resultDisplay = document.getElementById('debug-result');
  const lastPlayedDisplay = document.getElementById('debug-last-played');
  const stateInfoDisplay = document.getElementById('debug-state-info');
  const prevDayBtn = document.getElementById('debug-prev-day');
  const nextDayBtn = document.getElementById('debug-next-day');
  const resetBtn = document.getElementById('debug-reset');
  const reloadBtn = document.getElementById('debug-reload-state');
  const newPlayerBtn = document.getElementById('debug-new-player');

  // Show the panel
  panel.classList.add('visible');

  // Initialize with current values
  const now = new Date();
  const localOffset = -now.getTimezoneOffset() / 60; // Convert minutes to hours

  dateInput.value = now.toISOString().split('T')[0];
  timeInput.value = now.toTimeString().slice(0, 5);

  // Find and select the closest timezone option
  const tzOptions = Array.from(tzSelect.options);
  const closestTz = tzOptions.reduce((prev, curr) => {
    return Math.abs(parseFloat(curr.value) - localOffset) < Math.abs(parseFloat(prev.value) - localOffset) ? curr : prev;
  });
  tzSelect.value = closestTz.value;

  // Set initial debug state
  debugTime.enabled = true;
  debugTime.date = dateInput.value;
  debugTime.time = timeInput.value;
  debugTime.utcOffset = parseFloat(tzSelect.value);

  updateDebugResult();

  function updateDebugResult() {
    resultDisplay.textContent = getTodayString();
  }

  async function updateDebugState(autoReload = false) {
    debugTime.date = dateInput.value;
    debugTime.time = timeInput.value;
    debugTime.utcOffset = parseFloat(tzSelect.value);
    updateDebugResult();

    if (autoReload) {
      await loadState();
      updateHeightDisplay();
      updateDebugStateInfo();
    }
  }

  // Update the state info display
  window.updateDebugStateInfo = function() {
    lastPlayedDisplay.textContent = state.lastPlayedDate || '(never)';
    const canRoll = !state.hasPlayedToday || state.needsRollback;
    stateInfoDisplay.textContent = `h:${state.height} rb:${state.needsRollback ? 'Y' : 'N'} roll:${canRoll ? 'Y' : 'N'}`;
  };

  dateInput.addEventListener('change', updateDebugState);
  timeInput.addEventListener('change', updateDebugState);
  tzSelect.addEventListener('change', updateDebugState);

  prevDayBtn.addEventListener('click', async () => {
    const d = new Date(dateInput.value);
    d.setDate(d.getDate() - 1);
    dateInput.value = d.toISOString().split('T')[0];
    await updateDebugState(true); // auto-reload
  });

  nextDayBtn.addEventListener('click', async () => {
    const d = new Date(dateInput.value);
    d.setDate(d.getDate() + 1);
    dateInput.value = d.toISOString().split('T')[0];
    await updateDebugState(true); // auto-reload
  });

  resetBtn.addEventListener('click', () => {
    const now = new Date();
    dateInput.value = now.toISOString().split('T')[0];
    timeInput.value = now.toTimeString().slice(0, 5);
    updateDebugState();
  });

  reloadBtn.addEventListener('click', async () => {
    await loadState();
    updateHeightDisplay();
    updateDebugStateInfo();
    console.log('State reloaded. needsRollback:', state.needsRollback, 'height:', state.height, 'lastPlayed:', state.lastPlayedDate);
  });

  newPlayerBtn.addEventListener('click', () => {
    if (confirm('This will delete your player and start fresh. Continue?')) {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem('sisyphus-state');
      window.location.reload();
    }
  });
}

// ============================================
// Initialization
// ============================================
async function init() {
  loadTheme();
  initEventListeners();
  initSVGs();
  initGreekBorders();
  initButtonIcons();
  initDebugPanel();

  // Load state from server (async)
  await loadState();

  // Update debug panel with state info
  if (DEV_MODE && window.updateDebugStateInfo) {
    window.updateDebugStateInfo();
  }

  // If needsRollback, we do NOT auto-trigger it.
  // They must click the boulder to witness their own demise.
}

function initSVGs() {
  elements.boulder.innerHTML = `
    <ellipse
      cx="50"
      cy="50"
      rx="${boulder.radiusX}"
      ry="${boulder.radiusY}"
      fill="var(--fg)"
    />
  `;

  elements.stickman.innerHTML = `
    <line x1="50" y1="40" x2="35" y2="90" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
    <circle cx="50" cy="30" r="12" fill="var(--fg)"/>
    <line x1="45" y1="55" x2="70" y2="45" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
    <line x1="40" y1="60" x2="68" y2="55" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
    <line x1="35" y1="90" x2="20" y2="130" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
    <line x1="35" y1="90" x2="50" y2="130" stroke="var(--fg)" stroke-width="4" stroke-linecap="round"/>
  `;

  const groundSvg = document.querySelector('.ground-layer');
  groundSvg.innerHTML = `
    <polygon
      points="0,600 800,200 800,600"
      fill="var(--fg)"
    />
  `;
}

window.addEventListener('resize', initGreekBorders);
document.addEventListener('DOMContentLoaded', init);
