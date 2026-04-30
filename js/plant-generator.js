// ═══════════════════════════════════════════════
// PLANT GENERATOR — L-System + 3D Turtle (Canvas port of C++/OpenGL project)
// ═══════════════════════════════════════════════
(function() {

// ── VEC3 MATH ──
const v3     = (x,y,z) => ({x,y,z});
const vadd   = (a,b) => v3(a.x+b.x, a.y+b.y, a.z+b.z);
const vscale = (v,s) => v3(v.x*s, v.y*s, v.z*s);
const vdot   = (a,b) => a.x*b.x + a.y*b.y + a.z*b.z;
const vcross = (a,b) => v3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x);
const vlen   = v => Math.sqrt(vdot(v,v));
const vnorm  = v => { const l=vlen(v); return l>1e-8 ? vscale(v,1/l) : v3(0,1,0); };

// Rodrigues rotation formula
function vrot(v, axis, rad) {
  const k = vnorm(axis), c = Math.cos(rad), s = Math.sin(rad);
  return vadd(vadd(vscale(v,c), vscale(vcross(k,v),s)), vscale(k, vdot(k,v)*(1-c)));
}

// ── L-SYSTEM PRESETS (ported from PlantPresets.h) ──
const PRESETS = {
  'Fractal Tree':   { axiom:'F', rule:'F[&+F][&-F][^+F][^-F]',           iters:5, angle:25.7, length:2.0, lscale:0.80, thick:0.15, tscale:0.70, rand:0.10 },
  'Bushy Tree':     { axiom:'F', rule:'F[&+F][^-F][/+F][\\-F]',          iters:6, angle:22.5, length:2.0, lscale:0.75, thick:0.20, tscale:0.65, rand:0.15 },
  'Sparse Tree':    { axiom:'F', rule:'F[&+F][^-F][/+F][\\-F]',          iters:5, angle:30.0, length:3.0, lscale:0.70, thick:0.12, tscale:0.60, rand:0.20 },
  'Willow Tree':    { axiom:'F', rule:'F[&+F][&-F][&F][/&F][\\&F]',      iters:6, angle:25.0, length:2.0, lscale:0.78, thick:0.14, tscale:0.68, rand:0.22 },
  'Vine':           { axiom:'F', rule:'F[&+F][^-F]/F',                   iters:7, angle:18.0, length:1.2, lscale:0.95, thick:0.06, tscale:0.85, rand:0.25 },
  'Symmetric Tree': { axiom:'F', rule:'F[&+F][&-F][^+F][^-F]',           iters:5, angle:25.0, length:1.8, lscale:0.72, thick:0.18, tscale:0.70, rand:0.08 },
  'Seaweed':        { axiom:'F', rule:'F[&+F]/F[^-F]',                   iters:5, angle:12.0, length:1.5, lscale:0.93, thick:0.05, tscale:0.90, rand:0.30 },
  'Complex Tree':   { axiom:'F', rule:'F[&+F][&-F][^+F][^-F][/F][\\F][+F][-F]', iters:5, angle:27.5, length:2.2, lscale:0.80, thick:0.20, tscale:0.64, rand:0.18 },
  'Binary Tree':    { axiom:'F', rule:'F[&+F][^-F]',                     iters:6, angle:45.0, length:1.0, lscale:0.70, thick:0.10, tscale:0.70, rand:0.00 },
};

// ── SEASONS ──
const SEASONS = {
  spring: { barkLo:'#4a2a06', barkHi:'#7a4a18', leaves:['#7ac84a','#9adc60','#5ab02a','#b0e060','#60c030'], ground:'#1a3a0a', sky:['#0e2040','#060d1c'] },
  summer: { barkLo:'#3a2005', barkHi:'#6a3810', leaves:['#2a8a1a','#3aaa2a','#1a7212','#4abc30','#22961a'], ground:'#122a08', sky:['#0a1828','#060d1c'] },
  autumn: { barkLo:'#5a2808', barkHi:'#8a4820', leaves:['#e8832a','#d4502a','#f0c030','#c83820','#f08820','#e06015'], ground:'#1a1205', sky:['#1a1408','#0c0e0a'] },
  winter: { barkLo:'#606880', barkHi:'#8898b0', leaves:null,                                                          ground:'#0a1020', sky:['#1a2030','#0a1020'] },
};

// ── L-SYSTEM EXPANSION ──
function expand(axiom, rule, iters) {
  const map = {'F': rule};
  let s = axiom;
  for (let i = 0; i < iters; i++) {
    let next = '';
    for (const c of s) next += map[c] || c;
    s = next;
    if (s.length > 200000) break; // safety cap
  }
  return s;
}

// ── 3D TURTLE INTERPRETER (ported from TurtleInterpreter.cpp) ──
function interpret(str, cfg, rng) {
  const DEG = Math.PI / 180;
  const ra  = () => cfg.rand > 0 ? (rng()-0.5)*2*cfg.rand*cfg.angle*DEG : 0;
  const rf  = () => cfg.rand > 0 ? 1 + (rng()-0.5)*2*cfg.rand*0.5 : 1;

  let st = { pos:v3(0,0,0), h:v3(0,1,0), l:v3(-1,0,0), u:v3(0,0,1), len:cfg.length, thick:cfg.thick, depth:0 };
  const stack = [], segs = [];

  function rot(axis, rad) {
    st.h = vnorm(vrot(st.h, axis, rad));
    st.l = vnorm(vrot(st.l, axis, rad));
    st.u = vnorm(vrot(st.u, axis, rad));
  }

  const A = cfg.angle * DEG;
  for (const c of str) {
    switch(c) {
      case 'F': case 'G': {
        const s0 = {...st.pos}, t0 = st.thick;
        st.pos = vadd(st.pos, vscale(st.h, st.len * rf()));
        const t1 = st.thick * cfg.tscale;
        segs.push({ s:s0, e:{...st.pos}, st:t0, et:t1, depth:st.depth, hasLeaf:st.depth>=1 });
        st.len   *= cfg.lscale;
        st.thick  = t1;
        break;
      }
      case 'f': case 'g': st.pos = vadd(st.pos, vscale(st.h, st.len)); break;
      case '+': rot(st.u,  A+ra()); break;
      case '-': rot(st.u, -A-ra()); break;
      case '&': rot(st.l, -A-ra()); break;
      case '^': rot(st.l,  A+ra()); break;
      case '\\':rot(st.h, -A-ra()); break;
      case '/': rot(st.h,  A+ra()); break;
      case '|': rot(st.u, Math.PI); break;
      case '[': stack.push({pos:{...st.pos},h:{...st.h},l:{...st.l},u:{...st.u},len:st.len,thick:st.thick,depth:st.depth}); st.depth++; break;
      case ']': if(stack.length){ const r=stack.pop(); Object.assign(st,r); } break;
      case '!': st.thick *= cfg.tscale; break;
    }
  }
  return segs;
}

// ── PROJECTION ──
function proj(v, cx, cy, scale, rotY, rotX) {
  // Rotate around Y then X
  const cy_ = Math.cos(rotY), sy_ = Math.sin(rotY);
  const rx = v.x*cy_ + v.z*sy_;
  const rz = -v.x*sy_ + v.z*cy_;
  const cx_ = Math.cos(rotX), sx_ = Math.sin(rotX);
  const ry = v.y*cx_ - rz*sx_;
  return { x: cx + rx*scale, y: cy - ry*scale };
}

// ── RENDERING ──
function drawTree(canvas, segs, season, cfg, rotY, rotX, wind, t) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const sk = SEASONS[season];

  // Sky background
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0, sk.sky[0]);
  grad.addColorStop(1, sk.sky[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  // Ground
  ctx.fillStyle = sk.ground;
  ctx.fillRect(0, H*0.82, W, H*0.18);
  // Ground highlight line
  ctx.strokeStyle = season==='winter' ? 'rgba(150,160,200,0.2)' : 'rgba(0,255,136,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,H*0.82); ctx.lineTo(W,H*0.82); ctx.stroke();

  if (!segs || !segs.length) return;

  // Compute bounds for auto-scaling
  let minY=Infinity, maxY=-Infinity, minX=Infinity, maxX=-Infinity;
  for (const seg of segs) {
    minY = Math.min(minY, seg.s.y, seg.e.y);
    maxY = Math.max(maxY, seg.s.y, seg.e.y);
    minX = Math.min(minX, seg.s.x, seg.e.x, seg.s.z, seg.e.z);
    maxX = Math.max(maxX, seg.s.x, seg.e.x, seg.s.z, seg.e.z);
  }
  const treeH = maxY - minY || 1;
  const treeW = maxX - minX || 1;
  const scale = Math.min(H * 0.68 / treeH, W * 0.82 / treeW / 2) * zoom;
  const cx = W/2, cy = H * 0.82;

  // Wind offset helper
  const windOffset = (depth, ex) => wind > 0
    ? Math.sin(t*0.0018 + depth*0.6 + ex*0.3) * wind * depth * 0.04 * scale
    : 0;

  // Draw segments back-to-front (sort by z projection)
  const sorted = [...segs].sort((a,b) => {
    const az = -a.s.x*Math.sin(rotY) + a.s.z*Math.cos(rotY);
    const bz = -b.s.x*Math.sin(rotY) + b.s.z*Math.cos(rotY);
    return az - bz;
  });

  for (const seg of sorted) {
    const wox = windOffset(seg.depth, seg.e.x);
    const ep  = { x: seg.e.x + wox / scale, y: seg.e.y, z: seg.e.z };
    const ps  = proj(seg.s, cx, cy, scale, rotY, rotX);
    const pe  = proj(ep,    cx, cy, scale, rotY, rotX);

    const sw = Math.max(0.5, seg.st * scale * 0.8);
    const ew = Math.max(0.3, seg.et * scale * 0.8);

    // Bark color — lerp dark to light based on depth
    const depthT = Math.min(seg.depth / 6, 1);
    const bark = seg.depth === 0 ? sk.barkLo : interpColor(sk.barkLo, sk.barkHi, depthT);

    // Draw tapered branch as quad
    const dx = pe.x - ps.x, dy = pe.y - ps.y;
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    const nx = -dy/len, ny = dx/len;

    ctx.beginPath();
    ctx.moveTo(ps.x + nx*sw, ps.y + ny*sw);
    ctx.lineTo(pe.x + nx*ew, pe.y + ny*ew);
    ctx.lineTo(pe.x - nx*ew, pe.y - ny*ew);
    ctx.lineTo(ps.x - nx*sw, ps.y - ny*sw);
    ctx.closePath();
    ctx.fillStyle = bark;
    ctx.fill();
  }

  // Draw leaves (only non-winter, on deeper branches)
  if (sk.leaves) {
    const lc = sk.leaves;
    for (const seg of sorted) {
      if (!seg.hasLeaf || seg.depth < 2) continue;
      const wox = windOffset(seg.depth, seg.e.x);
      const ep  = { x: seg.e.x + wox / scale, y: seg.e.y, z: seg.e.z };
      const pe  = proj(ep, cx, cy, scale, rotY, rotX);

      const r = Math.max(2, seg.et * scale * 3.5 + 2);
      ctx.beginPath();
      ctx.arc(pe.x, pe.y, r, 0, Math.PI*2);
      ctx.fillStyle = lc[Math.abs(Math.round(seg.s.x*7 + seg.s.z*5)) % lc.length];
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Winter snow dots
  if (season === 'winter') {
    const sr = Math.random;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(sr()*W, sr()*H*0.82, sr()*2+0.5, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(200,210,255,0.6)';
      ctx.fill();
    }
  }
}

function interpColor(a, b, t) {
  const pa = parseInt(a.slice(1),16), pb = parseInt(b.slice(1),16);
  const ar=(pa>>16)&255, ag=(pa>>8)&255, ab=pa&255;
  const br=(pb>>16)&255, bg=(pb>>8)&255, bb=pb&255;
  const r=Math.round(ar+(br-ar)*t), g=Math.round(ag+(bg-ag)*t), bv=Math.round(ab+(bb-ab)*t);
  return `rgb(${r},${g},${bv})`;
}

// ── CONTROLLER ──
const canvas   = document.getElementById('tree-canvas');
if (!canvas) return;

// DPI-aware sizing
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
}

let segs    = [];
let rotY    = 0.3, rotX = 0.08;
let zoom    = 1;
let season  = 'spring';
let animT   = 0;
let seed    = Math.random;
let wind    = 0.30;
let rafId   = null;

function buildTree() {
  const preset = document.getElementById('ctrl-preset').value;
  const cfg = {...PRESETS[preset]};
  cfg.iters  = parseInt(document.getElementById('ctrl-iter').value);
  cfg.angle  = parseFloat(document.getElementById('ctrl-angle').value);
  cfg.lscale = parseFloat(document.getElementById('ctrl-lscale').value);
  cfg.rand   = parseFloat(document.getElementById('ctrl-rand').value);
  // Use seeded RNG for reproducibility with randomness
  const s   = Math.random();
  let   rs  = s * 999999;
  const rng = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  const str = expand(cfg.axiom, cfg.rule, cfg.iters);
  segs = interpret(str, cfg, rng);
}

function render(ts) {
  animT = ts;
  resizeCanvas();
  const w = parseFloat(document.getElementById('ctrl-wind').value);
  drawTree(canvas, segs, season, {}, rotY, rotX, w, ts);
  rafId = requestAnimationFrame(render);
}

function start() {
  if (rafId) cancelAnimationFrame(rafId);
  buildTree();
  rafId = requestAnimationFrame(render);
}

// Controls
document.getElementById('ctrl-preset').addEventListener('change', function() {
  const p = PRESETS[this.value];
  document.getElementById('ctrl-iter').value   = p.iters;
  document.getElementById('ctrl-angle').value  = p.angle;
  document.getElementById('ctrl-lscale').value = p.lscale;
  document.getElementById('ctrl-rand').value   = p.rand;
  document.getElementById('lbl-iter').textContent   = p.iters;
  document.getElementById('lbl-angle').textContent  = p.angle + '°';
  document.getElementById('lbl-lscale').textContent = p.lscale.toFixed(2);
  document.getElementById('lbl-rand').textContent   = p.rand.toFixed(2);
  document.getElementById('lbl-preset').textContent = this.value;
  start();
});

[['ctrl-iter','lbl-iter',v=>v],['ctrl-angle','lbl-angle',v=>v+'°'],['ctrl-lscale','lbl-lscale',v=>parseFloat(v).toFixed(2)],['ctrl-rand','lbl-rand',v=>parseFloat(v).toFixed(2)],['ctrl-wind','lbl-wind',v=>parseFloat(v).toFixed(2)]].forEach(([id,lbl,fmt]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', function() {
    if (lbl) document.getElementById(lbl).textContent = fmt(this.value);
    if (id !== 'ctrl-wind') start();
  });
});

document.querySelectorAll('.sbn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.sbn').forEach(b => b.classList.remove('on'));
    this.classList.add('on');
    season = this.dataset.season;
  });
});

document.getElementById('btn-regen').addEventListener('click', start);
document.getElementById('btn-reset-cam').addEventListener('click', () => { rotY=0.3; rotX=0.08; zoom=1; });

// Mouse drag to rotate
let dragging=false, lastX=0, lastY=0;
canvas.addEventListener('mousedown',  e => { dragging=true; lastX=e.clientX; lastY=e.clientY; });
canvas.addEventListener('mousemove',  e => {
  if (!dragging) return;
  rotY += (e.clientX - lastX) * 0.008;
  rotX += (e.clientY - lastY) * 0.004;
  rotX  = Math.max(-0.6, Math.min(0.6, rotX));
  lastX=e.clientX; lastY=e.clientY;
});
canvas.addEventListener('mouseup',   () => dragging=false);
canvas.addEventListener('mouseleave',() => dragging=false);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 0.92 : 1.08;
  zoom  = Math.max(0.2, Math.min(4, zoom));
}, {passive:false});

// Touch support
canvas.addEventListener('touchstart', e => { if(e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; } }, {passive:true});
canvas.addEventListener('touchmove',  e => {
  if(!dragging||e.touches.length!==1) return;
  rotY += (e.touches[0].clientX - lastX) * 0.008;
  rotX += (e.touches[0].clientY - lastY) * 0.004;
  lastX=e.touches[0].clientX; lastY=e.touches[0].clientY;
}, {passive:true});
canvas.addEventListener('touchend', () => dragging=false);

// Space bar = regenerate (only when lab is visible)
window.addEventListener('keydown', e => {
  if (e.code==='Space' && canvas.getBoundingClientRect().top < window.innerHeight) {
    e.preventDefault(); start();
  }
});

// Lazy start — only kick off when section scrolls into view
const labObs = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !rafId) start();
  if (!entries[0].isIntersecting && rafId) { cancelAnimationFrame(rafId); rafId=null; }
}, { threshold: 0.1 });
labObs.observe(document.getElementById('lab'));

})(); // end IIFE
