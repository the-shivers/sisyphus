/**
 * Sisyphus - A daily boulder-pushing game
 */

// Game state
const state = {
  height: 0,
  lastPlayedDate: null,
  streak: 0,
  hasPlayedToday: false,
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
};

// Date utilities
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function isYesterday(dateString) {
  if (!dateString) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateString === yesterday.toISOString().split('T')[0];
}

// Save/Load state
function saveState() {
  localStorage.setItem('sisyphus-state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('sisyphus-state');
  if (saved) {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
  }

  // Check if we need to reset
  const today = getTodayString();

  if (state.lastPlayedDate === today) {
    // Already played today
    state.hasPlayedToday = true;
  } else if (isYesterday(state.lastPlayedDate)) {
    // Played yesterday, streak continues
    state.hasPlayedToday = false;
  } else if (state.lastPlayedDate !== null) {
    // Missed a day - THE BOULDER ROLLS BACK
    // We'll trigger this animation after load
    state.needsRollback = true;
    state.previousHeight = state.height;
  }

  updateHeightDisplay();
}

// Boulder physics for non-circular rolling
const boulder = {
  // Boulder is slightly elliptical
  radiusX: 40,  // horizontal radius
  radiusY: 35,  // vertical radius
  rotation: 0,  // current rotation in radians

  // Calculate the height of center given rotation angle
  // For an ellipse rolling on a flat surface, this varies with angle
  getCenterHeight(angle) {
    // Distance from center to edge at angle
    const r = (this.radiusX * this.radiusY) /
      Math.sqrt(
        Math.pow(this.radiusY * Math.cos(angle), 2) +
        Math.pow(this.radiusX * Math.sin(angle), 2)
      );
    return r;
  },

  // Calculate arc length for a rotation (for syncing with distance traveled)
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

// Push the boulder!
function pushBoulder() {
  if (state.hasPlayedToday || isAnimating) return;

  isAnimating = true;
  state.hasPlayedToday = true;
  state.lastPlayedDate = getTodayString();
  state.streak++;
  state.height += 1; // 1 meter per day

  // Animate the push
  animatePush(() => {
    saveState();
    isAnimating = false;
    updateHeightDisplay();
  });
}

// Animate the boulder push
function animatePush(onComplete) {
  const duration = 1500; // 1.5 seconds
  const startTime = performance.now();
  const startRotation = boulder.rotation;
  const targetRotation = startRotation + Math.PI * 2; // One full rotation

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out
    const eased = 1 - Math.pow(1 - progress, 3);

    boulder.rotation = startRotation + (targetRotation - startRotation) * eased;

    // Update visuals
    updateBoulderVisuals();
    updateParallax(eased);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      boulder.rotation = targetRotation;
      onComplete();
    }
  }

  requestAnimationFrame(animate);
}

// The tragic rollback animation
function animateRollback(fromHeight, onComplete) {
  isAnimating = true;

  // First, a moment of false hope - try to push
  const falseHopeDuration = 800;
  const startTime = performance.now();

  function falseHope(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / falseHopeDuration, 1);

    // Boulder rises slightly then stops
    const hopeHeight = Math.sin(progress * Math.PI) * 0.1;
    boulder.rotation += 0.02 * (1 - progress);
    updateBoulderVisuals();

    if (progress < 1) {
      requestAnimationFrame(falseHope);
    } else {
      // Now the tragedy begins
      setTimeout(() => rollDown(fromHeight, onComplete), 300);
    }
  }

  function rollDown(height, done) {
    const rollDuration = Math.min(2000 + height * 100, 5000); // Longer for higher heights
    const rollStart = performance.now();

    function roll(currentTime) {
      const elapsed = currentTime - rollStart;
      const progress = Math.min(elapsed / rollDuration, 1);

      // Accelerating descent
      const eased = Math.pow(progress, 2);
      const currentHeight = height * (1 - eased);

      // Faster and faster rotation
      boulder.rotation -= 0.1 * (1 + progress * 3);
      updateBoulderVisuals();

      // Update height display during fall
      elements.heightValue.textContent = Math.floor(currentHeight);

      // Scroll parallax backwards
      updateParallax(-eased * height);

      if (progress < 1) {
        requestAnimationFrame(roll);
      } else {
        // Hit bottom
        state.height = 0;
        state.streak = 0;
        state.hasPlayedToday = false;
        state.needsRollback = false;
        saveState();
        updateHeightDisplay();
        isAnimating = false;
        done();
      }
    }

    requestAnimationFrame(roll);
  }

  requestAnimationFrame(falseHope);
}

// Update boulder SVG rotation and bobbing
function updateBoulderVisuals() {
  const bob = boulder.getCenterHeight(boulder.rotation) - boulder.radiusY;
  const boulderEl = elements.boulder;
  boulderEl.style.transform = `rotate(${boulder.rotation}rad) translateY(${bob}px)`;
}

// Update parallax layers based on progress
function updateParallax(progress) {
  // TODO: Implement parallax scrolling
  // Move layers at different rates based on progress
}

// Update the height display
function updateHeightDisplay() {
  elements.heightValue.textContent = state.height;
}

// Modal handling
function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// Event listeners
function initEventListeners() {
  elements.boulder.addEventListener('click', pushBoulder);

  elements.helpBtn.addEventListener('click', () => openModal(elements.helpModal));
  elements.menuBtn.addEventListener('click', () => openModal(elements.menuModal));

  elements.helpClose.addEventListener('click', () => closeModal(elements.helpModal));
  elements.menuClose.addEventListener('click', () => closeModal(elements.menuModal));

  // Close modals on backdrop click
  [elements.helpModal, elements.menuModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });
}

// Initialize the game
function init() {
  loadState();
  initEventListeners();
  initSVGs();

  // Check for rollback
  if (state.needsRollback && state.previousHeight > 0) {
    setTimeout(() => {
      animateRollback(state.previousHeight, () => {
        console.log('The boulder has returned to the bottom.');
      });
    }, 500);
  }
}

// Initialize SVG elements with actual shapes
function initSVGs() {
  // Boulder - slightly irregular ellipse
  elements.boulder.innerHTML = `
    <ellipse
      cx="50"
      cy="50"
      rx="${boulder.radiusX}"
      ry="${boulder.radiusY}"
      fill="var(--boulder)"
      stroke="#5A4A3A"
      stroke-width="2"
    />
    <!-- Add some texture/detail to boulder -->
    <ellipse cx="35" cy="40" rx="8" ry="6" fill="#6A5A4A" opacity="0.5"/>
    <ellipse cx="60" cy="55" rx="6" ry="4" fill="#8A7A6A" opacity="0.4"/>
  `;

  // Stickman in pushing pose
  elements.stickman.innerHTML = `
    <!-- Body leaning forward -->
    <line x1="50" y1="40" x2="35" y2="90" stroke="var(--stickman)" stroke-width="4" stroke-linecap="round"/>
    <!-- Head -->
    <circle cx="50" cy="30" r="12" fill="var(--stickman)"/>
    <!-- Arms pushing forward -->
    <line x1="45" y1="55" x2="70" y2="45" stroke="var(--stickman)" stroke-width="4" stroke-linecap="round"/>
    <line x1="40" y1="60" x2="68" y2="55" stroke="var(--stickman)" stroke-width="4" stroke-linecap="round"/>
    <!-- Back leg (planted) -->
    <line x1="35" y1="90" x2="20" y2="130" stroke="var(--stickman)" stroke-width="4" stroke-linecap="round"/>
    <!-- Front leg (pushing) -->
    <line x1="35" y1="90" x2="50" y2="130" stroke="var(--stickman)" stroke-width="4" stroke-linecap="round"/>
  `;

  // Ground/hill - diagonal slope
  const groundSvg = document.querySelector('.ground');
  groundSvg.innerHTML = `
    <polygon
      points="0,600 800,200 800,600"
      fill="var(--ground)"
    />
    <!-- Slope line -->
    <line x1="0" y1="600" x2="800" y2="200" stroke="#4A3F2F" stroke-width="3"/>
  `;

  // Far mountains
  const farMountains = document.querySelector('.mountains-far');
  farMountains.innerHTML = `
    <polygon points="0,400 150,250 300,400" fill="var(--mountain-far)"/>
    <polygon points="200,400 400,200 600,400" fill="var(--mountain-far)"/>
    <polygon points="500,400 700,280 800,400" fill="var(--mountain-far)"/>
  `;

  // Mid mountains
  const midMountains = document.querySelector('.mountains-mid');
  midMountains.innerHTML = `
    <polygon points="0,400 200,300 350,400" fill="var(--mountain-mid)"/>
    <polygon points="300,400 500,250 700,400" fill="var(--mountain-mid)"/>
    <polygon points="600,400 750,320 800,400" fill="var(--mountain-mid)"/>
  `;
}

// Start the game when DOM is ready
document.addEventListener('DOMContentLoaded', init);
