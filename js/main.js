// ─────────────── BOOT SCREEN ───────────────
const BOOT_LINES = [
  '> BOOT SEQUENCE INITIATED...',
  '> LOADING PLAYER DATA: GABRIEL MIESES',
  '> SCANNING PROJECT VAULT... [16 MISSIONS FOUND]',
  '> SKILL TREE: UNLOCKED',
  '> PARTICLE ENGINE: ONLINE',
  '> RENDER PIPELINE: READY',
  '> ALL SYSTEMS NOMINAL. WELCOME.'
];
const bootEl   = document.getElementById('boot');
const bootText = document.getElementById('boot-text');
let bi = 0;

function showLine() {
  if (bi >= BOOT_LINES.length) { setTimeout(endBoot, 500); return; }
  const d = document.createElement('div');
  d.className = 'bl';
  d.textContent = BOOT_LINES[bi++];
  bootText.appendChild(d);
  requestAnimationFrame(() => { setTimeout(() => d.classList.add('show'), 10); });
  setTimeout(showLine, 180);
}
function endBoot() {
  bootEl.style.transition = 'opacity 0.55s';
  bootEl.style.opacity = '0';
  setTimeout(() => { bootEl.style.display = 'none'; }, 560);
}
bootEl.addEventListener('click',  endBoot, { once: true });
window.addEventListener('keydown', endBoot, { once: true });
showLine();

// ─────────────── PARTICLE CANVAS ───────────────
const cv = document.getElementById('bg-canvas');
const cx = cv.getContext('2d');
let W, H, pts = [];

function resize() { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

class Pt {
  constructor() { this.init(); }
  init() {
    this.x  = Math.random() * W;
    this.y  = Math.random() * H;
    this.vx = (Math.random() - 0.5) * 0.28;
    this.vy = (Math.random() - 0.5) * 0.28;
    this.r  = Math.random() * 1.4 + 0.4;
    this.a  = Math.random() * 0.45 + 0.08;
    this.col = Math.random() > 0.6 ? '#5ca8ff' : (Math.random() > 0.5 ? '#ffd000' : '#8fc8ff');
  }
  step() {
    this.x += this.vx; this.y += this.vy;
    if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.init();
  }
  draw() {
    cx.beginPath(); cx.arc(this.x, this.y, this.r, 0, Math.PI*2);
    cx.fillStyle = this.col; cx.globalAlpha = this.a; cx.fill();
  }
}
for (let i = 0; i < 110; i++) pts.push(new Pt());

function grid() {
  cx.strokeStyle = 'rgba(92,168,255,0.03)'; cx.lineWidth = 1;
  const g = 70;
  for (let x = 0; x < W; x += g) { cx.beginPath(); cx.moveTo(x,0); cx.lineTo(x,H); cx.stroke(); }
  for (let y = 0; y < H; y += g) { cx.beginPath(); cx.moveTo(0,y); cx.lineTo(W,y); cx.stroke(); }
}

(function loop() {
  cx.clearRect(0,0,W,H); cx.globalAlpha = 1;
  grid();
  cx.globalAlpha = 0.07;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i+1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const d = Math.sqrt(dx*dx+dy*dy);
      if (d < 90) {
        cx.beginPath(); cx.strokeStyle='#5ca8ff';
        cx.lineWidth = (1-d/90)*0.5;
        cx.moveTo(pts[i].x,pts[i].y); cx.lineTo(pts[j].x,pts[j].y); cx.stroke();
      }
    }
  }
  pts.forEach(p => { p.step(); p.draw(); });
  requestAnimationFrame(loop);
})();

// ─────────────── CURSOR BLOOM ───────────────
const bloom = document.getElementById('bloom');
document.addEventListener('mousemove', e => {
  bloom.style.left = e.clientX + 'px';
  bloom.style.top  = e.clientY + 'px';
});

// ─────────────── TYPED ROLES ───────────────
const ROLES = ['Full-Stack Engineer','Game Developer','Systems Builder','AI Tinkerer','Problem Solver'];
let ri = 0, ci = 0, del = false;
const tEl = document.getElementById('typed');
function type() {
  const r = ROLES[ri];
  if (!del) { tEl.textContent = r.slice(0, ++ci); if (ci === r.length) { del = true; setTimeout(type, 1900); return; } }
  else       { tEl.textContent = r.slice(0, --ci); if (ci === 0) { del = false; ri = (ri+1) % ROLES.length; } }
  setTimeout(type, del ? 38 : 78);
}
setTimeout(type, 2000);

// ─────────────── ACTIVE NAV ───────────────
const secs    = document.querySelectorAll('section[id]');
const navAs   = document.querySelectorAll('.nav-links a');
const secObs  = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navAs.forEach(a => a.classList.remove('active'));
      const a = document.querySelector(`.nav-links a[data-s="${e.target.id}"]`);
      if (a) a.classList.add('active');
    }
  });
}, { threshold: 0.35 });
secs.forEach(s => secObs.observe(s));

// ─────────────── SMOOTH SCROLL ───────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const t = document.querySelector(a.getAttribute('href'));
    if (t) t.scrollIntoView({ behavior: 'smooth' });
  });
});

// ─────────────── KEYBOARD NAV ───────────────
const SEC_ORDER = ['hero','projects','lab','skills','about','contact'];
function curSec() {
  let cur = 'hero';
  secs.forEach(s => { if (window.scrollY >= s.offsetTop - 220) cur = s.id; });
  return cur;
}
document.addEventListener('keydown', e => {
  if (bootEl.style.display !== 'none') return;
  if (['1','2','3','4','5'].includes(e.key)) {
    document.querySelector('#'+SEC_ORDER[parseInt(e.key)-1]).scrollIntoView({behavior:'smooth'});
  }
  if (e.key==='ArrowDown'||e.key==='s') {
    const nx = SEC_ORDER[SEC_ORDER.indexOf(curSec())+1];
    if (nx) document.querySelector('#'+nx).scrollIntoView({behavior:'smooth'});
  }
  if (e.key==='ArrowUp'||e.key==='w') {
    const pv = SEC_ORDER[SEC_ORDER.indexOf(curSec())-1];
    if (pv) document.querySelector('#'+pv).scrollIntoView({behavior:'smooth'});
  }
});

// ─────────────── SCROLL REVEAL ───────────────
const rvObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll('.sk-fill').forEach(bar => {
      setTimeout(() => { bar.style.width = bar.dataset.l + '%'; }, 250);
    });
  });
}, { threshold: 0.08 });
document.querySelectorAll('.rv').forEach(el => rvObs.observe(el));

// ─────────────── PROJECT FILTERS ───────────────
const fBtns = document.querySelectorAll('.fb');
const pCards = document.querySelectorAll('.pc');
fBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    fBtns.forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const f = btn.dataset.f;
    pCards.forEach(c => {
      const cats = c.dataset.c || '';
      const show = f === 'all' || cats.includes(f);
      c.style.display = show ? '' : 'none';
    });
  });
});
