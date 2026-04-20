/* ── CONFIG ──────────────────────────────────────────── */
const CLICK_THROUGH = "https://itslitto.com";

/* ── CANVAS GEOMETRY ─────────────────────────────────── */
const CANVAS_W = 320;
const CUP_W = 82;
const CUP_H = 95;
const GAP = (CANVAS_W - CUP_W * 3) / 4;
const SLOT_L = [GAP, GAP * 2 + CUP_W, GAP * 3 + CUP_W * 2];
const SLOT_C = SLOT_L.map((l) => l + CUP_W / 2);
const BALL_W = 36;
const LIFT_PX = 120;

/* ── ELEMENTS ────────────────────────────────────────── */
const cupEls = [0, 1, 2].map((i) => document.getElementById("cup" + i));
const ballEl = document.getElementById("ball");
const statusEl = document.getElementById("status");
const ctaEl = document.getElementById("cta");
const againEl = document.getElementById("again");
const flashEl = document.getElementById("flash");
const audioToggleEl = document.getElementById("audio-toggle");

/* ── STATE ───────────────────────────────────────────── */
let slotCup = [0, 1, 2];
let cupSlot = [0, 1, 2];
let ballCup = 0;
let phase = "init";

/* ── AUDIO ───────────────────────────────────────────── */
const bgMusic = new Audio("sounds/bg_music_2.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.25;

const sounds = {
  lift: new Audio("sounds/light-pop.mp3"),
  reveal: new Audio("sounds/reveal.mp3"),
  win: new Audio("sounds/tada.mp3"),
  lose: new Audio("sounds/fail.mp3"),
  confetti: new Audio("sounds/winning.mp3"),
};

/* ── SWAP SOUND POOL ─────────────────────────────────────
   On mobile Safari, restarting the same Audio element
   has too much latency at high shuffle speeds.
   We pre-create 4 instances and round-robin between them
   so there's always a fresh one ready to fire instantly.
─────────────────────────────────────────────────────── */
const SWAP_POOL_SIZE = 4;
const swapPool = Array.from(
  { length: SWAP_POOL_SIZE },
  () => new Audio("sounds/shuffle.mp3"),
);
let swapPoolIdx = 0;

function playSwap() {
  if (!audioUnlocked || audioMuted) return;
  const s = swapPool[swapPoolIdx % SWAP_POOL_SIZE];
  swapPoolIdx++;
  try {
    s.currentTime = 0;
    s.volume = 0.35;
    s.playbackRate = 0.92 + Math.random() * 0.16;
    s.play().catch(() => {});
  } catch (_) {}
}

let audioUnlocked = false;
let audioMuted = false;

/* Safari-safe: must call play() synchronously inside gesture */
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  bgMusic.play().catch(() => {});
  // Prime all SFX
  Object.values(sounds).forEach((s) => {
    s.play().catch(() => {});
    s.pause();
    s.currentTime = 0;
  });
  // Prime swap pool
  swapPool.forEach((s) => {
    s.play().catch(() => {});
    s.pause();
    s.currentTime = 0;
  });
  console.log("🔓 Audio unlocked");
}

function playSound(name, volume = 0.6) {
  if (!audioUnlocked || audioMuted) return;
  const s = sounds[name];
  if (!s) return;
  try {
    s.currentTime = 0;
    s.volume = volume;
    s.playbackRate = 0.92 + Math.random() * 0.16;
    s.play().catch(() => {});
  } catch (_) {}
}

const ICON_VOLUME_ON = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#fff">
  <path d="M3 10v4h4l5 5V5L7 10H3z"/>
  <path d="M14.5 12c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02z"/>
  <path d="M14.5 3.97v2.16c2.89 1 5 3.77 5 6.87s-2.11 5.87-5 6.87v2.16c4.01-1.05 7-4.71 7-9.03s-2.99-7.98-7-9.03z"/>
</svg>
`;

const ICON_VOLUME_OFF = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="red">
  <path d="M16.5 12c0 .82-.25 1.58-.67 2.21l1.46 1.46A6.97 6.97 0 0 0 18.5 12c0-1.77-.66-3.39-1.75-4.62l-1.42 1.42c.73.86 1.17 1.96 1.17 3.2z"/>
  <path d="M19 12c0 1.61-.49 3.11-1.33 4.36l1.43 1.43C20.3 16.14 21 14.14 21 12c0-2.21-.7-4.21-1.9-5.79l-1.43 1.43C18.51 8.89 19 10.39 19 12z"/>
  <path d="M3 10v4h4l5 5V5L7 10H3z"/>
  <line x1="1" y1="1" x2="23" y2="23" stroke="red" stroke-width="2"/>
</svg>
`;

/* Mute toggle */
/* Mute toggle */
if (audioToggleEl) {
  audioToggleEl.addEventListener("pointerdown", (e) => e.stopPropagation());
  audioToggleEl.addEventListener("click", (e) => {
    e.stopPropagation();
    audioMuted = !audioMuted;

    audioToggleEl.innerHTML = audioMuted ? ICON_VOLUME_OFF : ICON_VOLUME_ON;
    audioToggleEl.classList.toggle("muted", audioMuted);

    Object.values(sounds).forEach((s) => {
      s.muted = audioMuted;
    });
    swapPool.forEach((s) => {
      s.muted = audioMuted;
    });
    bgMusic.muted = audioMuted;
  });
}

/* ── HELPERS ─────────────────────────────────────────── */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function setStatus(txt, color) {
  statusEl.textContent = txt;
  statusEl.style.color = color || "rgba(100,220,140,0.85)";
}

/* ── GPU-ACCELERATED POSITION HELPERS ────────────────────
   All movement uses transform: translateX/Y — never `left`.
   transform is GPU-composited → zero repaints → silky on iOS.
─────────────────────────────────────────────────────── */
function cupX(cupIdx) {
  return SLOT_L[cupSlot[cupIdx]];
}

function setCupTransform(el, x, y = 0) {
  el.style.transform = `translateX(${x}px) translateY(${y}px)`;
}

function placeCup(idx, instant) {
  const el = cupEls[idx];
  el.style.left = "0px"; // anchor — never changes
  if (instant) el.style.transition = "none";
  setCupTransform(el, SLOT_L[cupSlot[idx]], 0);
  el.style.zIndex = "5";
}

function initBoard() {
  cupEls.forEach((_, i) => {
    cupSlot[i] = i;
    slotCup[i] = i;
    placeCup(i, true);
  });
  ballCup = 0;
  updateBallPos();
  ballEl.style.opacity = "0";
}

function updateBallPos() {
  const x = SLOT_C[cupSlot[ballCup]] - BALL_W / 2;
  ballEl.style.left = "0px";
  ballEl.style.transform = `translateX(${x}px)`;
}

function showBall(visible) {
  updateBallPos();
  ballEl.style.opacity = visible ? "1" : "0";
}

/* ── LIFT ────────────────────────────────────────────── */
async function lift(cupIdx, up, dur = 320) {
  if (up) playSound("lift", 0.55);
  const el = cupEls[cupIdx];
  const x = cupX(cupIdx);
  el.style.transition = `transform ${dur}ms ease`;
  setCupTransform(el, x, up ? -LIFT_PX : 0);
  await delay(dur + 30);
}

/* ── SWAP ────────────────────────────────────────────── */
async function swap(sA, sB, dur) {
  playSwap(); // ← pool-based, no restart latency

  const cA = slotCup[sA];
  const cB = slotCup[sB];
  const xA = SLOT_L[sB]; // destination x for cup A
  const xB = SLOT_L[sA]; // destination x for cup B

  cupEls[cA].style.zIndex = sB > sA ? "7" : "4";
  cupEls[cB].style.zIndex = sA > sB ? "7" : "4";

  // Animate ONLY transform — GPU composited, no repaints
  const tr = `transform ${dur}ms ease-in-out`;
  cupEls[cA].style.transition = tr;
  cupEls[cB].style.transition = tr;

  // Arc lift + slide simultaneously
  setCupTransform(cupEls[cA], xA, -16);
  setCupTransform(cupEls[cB], xB, -16);

  // Update tracking immediately
  slotCup[sA] = cB;
  slotCup[sB] = cA;
  cupSlot[cA] = sB;
  cupSlot[cB] = sA;

  // Land cups mid-animation
  await delay(Math.round(dur * 0.52));
  cupEls[cA].style.transition =
    `transform ${Math.round(dur * 0.48)}ms ease-out`;
  cupEls[cB].style.transition =
    `transform ${Math.round(dur * 0.48)}ms ease-out`;
  setCupTransform(cupEls[cA], xA, 0);
  setCupTransform(cupEls[cB], xB, 0);

  await delay(Math.round(dur * 0.55));
  cupEls[cA].style.zIndex = "5";
  cupEls[cB].style.zIndex = "5";
  cupEls[cA].style.transition = "none";
  cupEls[cB].style.transition = "none";
}

/* ── SHUFFLE ─────────────────────────────────────────── */
async function shuffle() {
  phase = "shuffle";
  const N = 9 + Math.floor(Math.random() * 3);
  const pairs = [];

  for (let i = 0; i < N; i++) {
    const prev = pairs[pairs.length - 1];
    let a, b;
    do {
      a = Math.floor(Math.random() * 3);
      b = Math.floor(Math.random() * 3);
    } while (
      a === b ||
      (prev && a === prev.a && b === prev.b) ||
      (prev && a === prev.b && b === prev.a)
    );
    pairs.push({ a, b });
  }

  for (let i = 0; i < pairs.length; i++) {
    const t = i / Math.max(pairs.length - 1, 1);
    const spd = Math.round(480 - t * 220); // 480ms → 260ms
    const gap = Math.round(60 - t * 40); // 60ms → 20ms

    if (i === 3) setStatus("Can you track it?");
    if (i === 6) setStatus("Almost...");

    await swap(pairs[i].a, pairs[i].b, spd);
    await delay(gap);
  }

  await delay(300);
  setStatus("🎯  Pick a cup!", "#4dff88");
  enablePick();
}

/* ── PICK ────────────────────────────────────────────── */
function enablePick() {
  phase = "pick";
  cupEls.forEach((el, ci) => {
    el.classList.add("pickable");
    el.addEventListener("click", () => onPick(ci), { once: true });
  });
}

async function onPick(pickedCup) {
  if (phase !== "pick") return;
  phase = "reveal";
  cupEls.forEach((el) => el.classList.remove("pickable"));

  const won = pickedCup === ballCup;
  setStatus(
    won ? "🎉  You found it!" : "😬  Wrong cup!",
    won ? "#4dff88" : "#ff5555",
  );

  cupEls[pickedCup].style.zIndex = "8";
  await lift(pickedCup, true, 360);

  if (won) {
    playSound("win", 0.75);
    showBall(true);
    await delay(160);
    flashEl.className = "result-flash win";
    setTimeout(() => (flashEl.style.opacity = "1"), 20);
    cupEls[pickedCup].style.animation = "winBounce .65s ease";
    await delay(800);
    spawnConfetti();
    ctaEl.style.display = "block";
    ctaEl.style.animation = "none";
    ctaEl.offsetHeight;
    ctaEl.style.animation = "";
  } else {
    playSound("lose", 0.65);
    await delay(320);
    showBall(true);
    cupEls[ballCup].style.zIndex = "7";
    await lift(ballCup, true, 360);
    await delay(280);
    flashEl.className = "result-flash lose";
    setTimeout(() => (flashEl.style.opacity = "1"), 20);
    cupEls[pickedCup].style.animation = "shake .45s ease";
    await delay(520);
    againEl.style.display = "block";
  }
  phase = "done";
}

/* ── START ───────────────────────────────────────────── */
async function startGame() {
  initBoard();
  setStatus("✦  Watch carefully  ✦");
  await delay(600);

  phase = "peek";
  playSound("reveal", 0.5);
  showBall(true);
  await lift(ballCup, true, 300);
  await delay(850);
  showBall(false);
  await lift(ballCup, false, 300);
  await delay(400);

  await shuffle();
}

/* ── CONFETTI ────────────────────────────────────────── */
function spawnConfetti() {
  playSound("confetti", 0.7);

  const cols = [
    "#4dff88",
    "#39d669",
    "#00ff44",
    "#ff4d6d",
    "#ff6b35",
    "#ffd700",
    "#ffaa00",
    "#7eb8ff",
    "#a259ff",
    "#ff59e6",
    "#ffffff",
    "#fffacd",
    "#b8ffcc",
  ];

  for (let i = 0; i < 90; i++) {
    setTimeout(() => {
      const el = document.createElement("div");
      el.className = "confetti";
      const s = Math.random() * 14 + 4;
      const dur = 1.4 + Math.random() * 1.2;
      const del = Math.random() * 1.0;
      const shape = Math.random();
      const w = shape < 0.33 ? s * 2.5 : shape < 0.66 ? s : s * 0.5;
      const h = shape < 0.33 ? s * 0.5 : s;
      el.style.cssText = [
        `left:${Math.random() * 320}px`,
        `top:-12px`,
        `width:${w}px`,
        `height:${h}px`,
        `background:${cols[~~(Math.random() * cols.length)]}`,
        `border-radius:${shape < 0.66 ? "50%" : "2px"}`,
        `animation-duration:${dur}s`,
        `animation-delay:${del}s`,
        `opacity:0`,
      ].join(";");
      document.getElementById("ad").appendChild(el);
      setTimeout(() => el.remove(), (dur + del) * 1000 + 100);
    }, i * 18);
  }
}

/* ── BUTTONS ─────────────────────────────────────────── */
ctaEl.addEventListener("click", () => window.open(CLICK_THROUGH, "_blank"));
againEl.addEventListener("click", () => {
  flashEl.style.opacity = "0";
  flashEl.className = "result-flash";
  againEl.style.display = "none";
  ctaEl.style.display = "none";
  startGame();
});

/* Show cups immediately before tap */
initBoard();

/* ── TAP TO START ────────────────────────────────────── */
const tapIndicator = document.createElement("div");
tapIndicator.id = "tap-indicator";
tapIndicator.innerHTML = `<img src="images/tap_to_start.png" alt="Tap to Start" style="height:58px;width:auto;display:block;" />`;
tapIndicator.style.cssText = `
  position: absolute;
  bottom: 80px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  pointer-events: none;
  animation: tapPulse 1.1s ease-in-out infinite;
`;

const tapStyle = document.createElement("style");
tapStyle.textContent = `
  @keyframes tapPulse {
    0%,100% { opacity:1;   transform:scale(1); }
    50%      { opacity:0.85; transform:scale(0.95); }
  }
`;
document.head.appendChild(tapStyle);
document.getElementById("ad").appendChild(tapIndicator);

document.getElementById("ad").addEventListener(
  "pointerdown",
  () => {
    unlockAudio();
    tapIndicator.remove();
    startGame();
  },
  { once: true },
);
