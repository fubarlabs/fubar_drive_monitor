// ── Configuration ──────────────────────────────────────
const DATA_URL      = 'data.json';
const POLL_INTERVAL = 60_000; // ms

// Expected flickers per second across the ENTIRE grid of inactive slots.
// e.g. 1 = one flicker per second total; 0.5 = one every two seconds total.
const FLICKERS_PER_SECOND = 0.25;

// Jar SVG geometry (matches jar.svg viewBox: 0 0 146.505 178.692)
const JAR_TOP    = 38;   // y of jar interior top
const JAR_BOTTOM = 158;  // y of jar interior bottom
const JAR_HEIGHT = JAR_BOTTOM - JAR_TOP;

// ── State ──────────────────────────────────────────────
let prevMembers = -1;

// ── DOM refs (non-jar) ─────────────────────────────────
const jarSvgWrap      = document.getElementById('jar-svg-wrap');
const donationDisplay = document.getElementById('donation-display');
const donationGoalLbl = document.getElementById('donation-goal-label');
const memberGrid      = document.getElementById('member-grid');
const membersXY       = document.getElementById('members-xy');
const lastUpdated     = document.getElementById('last-updated');

// Jar SVG element refs — populated after the SVG is inlined
let jarFill, jarLevelLine, jarAmountLabel;

// ── Helpers ────────────────────────────────────────────
function fmt(n) {
  return '$' + n.toLocaleString();
}

function pct(current, goal) {
  return Math.min(current / goal, 1);
}

// ── Jar update ─────────────────────────────────────────
function updateJar(current, goal) {
  donationDisplay.textContent = fmt(current);
  donationGoalLbl.textContent = `of ${fmt(goal)} goal`;

  if (!jarFill || !jarLevelLine || !jarAmountLabel) return;

  const ratio  = pct(current, goal);
  const fillH  = JAR_HEIGHT * ratio;
  const fillY  = JAR_BOTTOM - fillH;
  const lineY  = Math.max(fillY, JAR_TOP + 2);
  const labelY = lineY - 5;

  // Fill clip: rises from bottom
  jarFill.setAttribute('y',      fillY);
  jarFill.setAttribute('height', fillH);

  // Dark overlay clip: covers everything above the fill level
  const jarDark = document.getElementById('jar-dark');
  if (jarDark) {
    jarDark.setAttribute('y',      JAR_TOP);
    jarDark.setAttribute('height', Math.max(0, fillY - JAR_TOP));
  }

  jarLevelLine.setAttribute('y1', lineY);
  jarLevelLine.setAttribute('y2', lineY);
}

// ── Member grid update ─────────────────────────────────
// ── Flicker scheduling (Poisson process) ──────────────
// Expected rate = FLICKERS_PER_SECOND across all inactive slots.
// Each slot independently draws its next inter-arrival from an
// exponential distribution with mean = N_inactive / FLICKERS_PER_SECOND.
const FLICKER_DURATION_MS = 750;

function scheduleFlicker(slot) {
  const N = Math.max(1, memberGrid.querySelectorAll('.member-slot.inactive').length);
  const meanMs = (N / FLICKERS_PER_SECOND) * 1000;
  // Exponential inter-arrival: -ln(U) * mean
  const delay = -Math.log(Math.random()) * meanMs;
  setTimeout(() => {
    if (!slot.classList.contains('inactive')) return;
    slot.classList.add('flickering');
    setTimeout(() => {
      slot.classList.remove('flickering');
      scheduleFlicker(slot);
    }, FLICKER_DURATION_MS);
  }, delay);
}

function buildGrid(total) {
  memberGrid.innerHTML = '';

  // Prefer square grids: cols = ceil(sqrt(total))
  const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
  memberGrid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

  for (let i = 0; i < total; i++) {
    const slot = document.createElement('div');
    slot.className = 'member-slot inactive';
    slot.dataset.index = i;

    const img = document.createElement('img');
    img.src = `member_svgs/${i + 1}.svg`;
    img.alt = '';
    img.onerror = function() { this.style.visibility = 'hidden'; };
    slot.appendChild(img);

    memberGrid.appendChild(slot);
    scheduleFlicker(slot);
  }
}

function updateMembers(current, goal) {
  const slots = memberGrid.querySelectorAll('.member-slot');

  // If goal changed, rebuild the grid
  if (slots.length !== goal) {
    buildGrid(goal);
    prevMembers = -1;
    return updateMembers(current, goal);
  }

  slots.forEach((slot, i) => {
    const shouldBeActive = i < current;
    const wasActive      = slot.classList.contains('active');

    if (shouldBeActive && !wasActive) {
      slot.classList.remove('inactive', 'flickering');
      slot.classList.add('active', 'just-lit');
      setTimeout(() => slot.classList.remove('just-lit'), 700);
    } else if (!shouldBeActive && wasActive) {
      slot.classList.remove('active', 'just-lit');
      slot.classList.add('inactive');
      scheduleFlicker(slot);
    }
  });

  membersXY.textContent = `${current} / ${goal}`;

  prevMembers = current;
}

// ── Fetch & apply data ─────────────────────────────────
async function fetchData() {
  try {
    const res  = await fetch(`${DATA_URL}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    updateJar(data.donations.current, data.donations.goal);
    updateMembers(data.members.current, data.members.goal);

    const now = new Date();
    lastUpdated.textContent =
      `Last updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  } catch (err) {
    lastUpdated.textContent = `Update failed — retrying`;
    console.warn('Fetch error:', err);
  }
}

// ── Init ───────────────────────────────────────────────
async function init() {
  // Inline jar.svg so JS can access its internal elements
  try {
    const res = await fetch(`jar.svg?t=${Date.now()}`);
    if (res.ok) {
      const svgText = await res.text();
      jarSvgWrap.innerHTML = svgText;
    }
  } catch (e) {
    console.warn('Could not load jar.svg:', e);
  }

  jarFill        = document.getElementById('jar-fill');
  jarLevelLine   = document.getElementById('jar-level-line');
  jarAmountLabel = document.getElementById('jar-amount-label');

  // Show defaults immediately before first fetch
  const DEFAULTS = { donations: { current: 4250, goal: 10000 }, members: { current: 3, goal: 5 } };
  updateJar(DEFAULTS.donations.current, DEFAULTS.donations.goal);
  buildGrid(DEFAULTS.members.goal);
  updateMembers(DEFAULTS.members.current, DEFAULTS.members.goal);

  fetchData();
  setInterval(fetchData, POLL_INTERVAL);
}

init();
