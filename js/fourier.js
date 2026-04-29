// ─────────────── FOURIER SYNTHESIZER ───────────────
(function() {
  const canvas = document.getElementById('fourier-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // ── State ──
  let mode       = 'draw';  // 'draw' | 'animate'
  let rawPts     = [];      // {x,y} in canvas px, as user draws
  let dftCoeffs  = [];      // [{freq,amp,phase}] sorted amp desc
  let ghostPath  = [];      // centered coords of resampled path
  let trail      = [];      // tip positions for drawing the trace
  let animT      = 0;       // [0,1) phase through one full cycle
  let animReq    = null;
  let isDrawing  = false;

  // ── Controls ──
  let circleCount = 64;
  let animSpeed   = 1.0;
  let showCircles = true;
  let fadeTrail   = true;

  // ── Resize canvas to CSS size ──
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width > 0) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); }
  }

  // ── Arc-length resample to N uniformly spaced points ──
  function resample(pts, N) {
    if (pts.length < 2) return pts.slice();
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      lens.push(lens[i-1] + Math.sqrt(dx*dx + dy*dy));
    }
    const total = lens[lens.length-1];
    if (!total) return pts.slice();
    const out = [];
    for (let i = 0; i < N; i++) {
      const target = (i / N) * total;
      let lo = 0, hi = lens.length - 1;
      while (hi - lo > 1) { const mid = (lo+hi)>>1; if (lens[mid] <= target) lo = mid; else hi = mid; }
      const t = (lens[hi] === lens[lo]) ? 0 : (target - lens[lo]) / (lens[hi] - lens[lo]);
      out.push({ x: pts[lo].x + t*(pts[hi].x - pts[lo].x), y: pts[lo].y + t*(pts[hi].y - pts[lo].y) });
    }
    return out;
  }

  // ── O(N²) DFT treating (x, y) as complex signal x + iy ──
  function computeDFT(pts) {
    const N = pts.length;
    const out = [];
    for (let k = 0; k < N; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const phi = -2 * Math.PI * k * n / N;
        re += pts[n].x * Math.cos(phi) - pts[n].y * Math.sin(phi);
        im += pts[n].x * Math.sin(phi) + pts[n].y * Math.cos(phi);
      }
      out.push({ freq: k, amp: Math.sqrt(re*re + im*im) / N, phase: Math.atan2(im, re) });
    }
    out.sort((a, b) => b.amp - a.amp);
    return out;
  }

  // ── Faint grid ──
  function drawGrid() {
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(16,28,52,0.9)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.restore();
  }

  // ── Draw mode render ──
  function renderDraw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    if (!rawPts.length) {
      ctx.fillStyle  = 'rgba(58,82,112,0.75)';
      ctx.font       = '11px "Share Tech Mono"';
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DRAW ANY SHAPE WITH YOUR MOUSE', W/2, H/2 - 13);
      ctx.fillStyle = 'rgba(58,82,112,0.45)';
      ctx.fillText('THEN PRESS  [ ANALYZE ]', W/2, H/2 + 13);
      return;
    }
    ctx.save();
    ctx.strokeStyle = '#5ca8ff';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.shadowColor = 'rgba(92,168,255,0.5)';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    rawPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
    // Start dot
    ctx.save();
    ctx.fillStyle   = '#ffd000';
    ctx.shadowColor = 'rgba(255,208,0,0.8)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(rawPts[0].x, rawPts[0].y, 4, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Animate mode render ──
  function renderAnimate() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawGrid();

    // Ghost (original drawing, dashed)
    if (ghostPath.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(92,168,255,0.14)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ghostPath.forEach((p, i) => {
        const px = p.x + W/2, py = p.y + H/2;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Epicycle arms + circles
    const count = Math.min(circleCount, dftCoeffs.length);
    const N     = dftCoeffs.length;
    let cx = W/2, cy = H/2;

    for (let i = 0; i < count; i++) {
      const { freq, amp, phase } = dftCoeffs[i];
      const angle = 2 * Math.PI * freq * animT + phase;
      const nx = cx + amp * Math.cos(angle);
      const ny = cy + amp * Math.sin(angle);

      if (showCircles) {
        // Circle outline (opacity scales with amp)
        ctx.save();
        ctx.strokeStyle = `rgba(92,168,255,${Math.min(0.28, amp / 40)})`;
        ctx.lineWidth   = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, amp, 0, Math.PI*2); ctx.stroke();
        // Arm
        ctx.strokeStyle = `rgba(255,208,0,${Math.min(0.65, amp / 20)})`;
        ctx.lineWidth   = 0.8;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.restore();
      }

      cx = nx; cy = ny;
    }

    // Trail
    trail.push({ x: cx, y: cy });
    const maxTrail = Math.max(N, 256);
    if (trail.length > maxTrail) trail.shift();

    for (let i = 1; i < trail.length; i++) {
      const a = fadeTrail ? (i / trail.length) * 0.9 : 0.85;
      ctx.strokeStyle = `rgba(255,208,0,${a})`;
      ctx.lineWidth   = 1.8;
      ctx.beginPath();
      ctx.moveTo(trail[i-1].x, trail[i-1].y);
      ctx.lineTo(trail[i].x,   trail[i].y);
      ctx.stroke();
    }

    // Tip dot
    ctx.save();
    ctx.fillStyle   = '#ffd000';
    ctx.shadowColor = 'rgba(255,208,0,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Advance time — one full cycle takes N / animSpeed frames
    animT = (animT + animSpeed / N) % 1;
    animReq = requestAnimationFrame(renderAnimate);
  }

  // ── Run DFT and switch to animate mode ──
  function analyze() {
    if (rawPts.length < 6) return;
    const DFT_N    = 256;
    const resampled = resample(rawPts, DFT_N);
    const mx = resampled.reduce((s, p) => s + p.x, 0) / DFT_N;
    const my = resampled.reduce((s, p) => s + p.y, 0) / DFT_N;
    const centered = resampled.map(p => ({ x: p.x - mx, y: p.y - my }));

    dftCoeffs = computeDFT(centered);
    ghostPath = centered;
    trail     = [];
    animT     = 0;
    mode      = 'animate';
    canvas.classList.add('animating');
    updateModeUI();
    if (animReq) cancelAnimationFrame(animReq);
    animReq = requestAnimationFrame(renderAnimate);
  }

  // ── Clear everything, go back to draw mode ──
  function clearAll() {
    if (animReq) { cancelAnimationFrame(animReq); animReq = null; }
    rawPts = []; dftCoeffs = []; trail = []; ghostPath = [];
    animT  = 0;
    mode   = 'draw';
    canvas.classList.remove('animating');
    updateModeUI();
    renderDraw();
  }

  function updateModeUI() {
    const el = document.getElementById('f-mode-indicator');
    if (!el) return;
    el.className   = 'f-mode-indicator ' + mode;
    el.textContent = mode === 'draw'
      ? '// MODE: DRAW — Trace any shape on the canvas'
      : '// MODE: ANIMATE — Fourier epicycles running';
  }

  // ── Input helpers ──
  function getPos(e) {
    const r   = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  canvas.addEventListener('mousedown',  e => { if (mode==='draw') { isDrawing=true; rawPts=[getPos(e)]; renderDraw(); } });
  canvas.addEventListener('mousemove',  e => { if (isDrawing && mode==='draw') { rawPts.push(getPos(e)); renderDraw(); } });
  canvas.addEventListener('mouseup',    () => { isDrawing = false; });
  canvas.addEventListener('mouseleave', () => { isDrawing = false; });
  canvas.addEventListener('touchstart', e => { e.preventDefault(); if (mode==='draw') { isDrawing=true; rawPts=[getPos(e)]; renderDraw(); } }, {passive:false});
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (isDrawing && mode==='draw') { rawPts.push(getPos(e)); renderDraw(); } }, {passive:false});
  canvas.addEventListener('touchend',   () => { isDrawing = false; });

  // ── Button wiring ──
  document.getElementById('btn-f-analyze')?.addEventListener('click', analyze);
  document.getElementById('btn-f-clear')  ?.addEventListener('click', clearAll);

  const cSlider = document.getElementById('ctrl-f-circles');
  if (cSlider) cSlider.addEventListener('input', () => {
    circleCount = +cSlider.value;
    document.getElementById('lbl-f-circles').textContent = circleCount;
    trail = [];
  });

  const sSlider = document.getElementById('ctrl-f-speed');
  if (sSlider) sSlider.addEventListener('input', () => {
    animSpeed = +sSlider.value;
    document.getElementById('lbl-f-speed').textContent = animSpeed.toFixed(1) + 'x';
  });

  document.getElementById('btn-f-circles')?.addEventListener('click', function() {
    showCircles = !showCircles;
    this.classList.toggle('on', showCircles);
    this.textContent = showCircles ? 'CIRCLES: ON' : 'CIRCLES: OFF';
  });

  document.getElementById('btn-f-fade')?.addEventListener('click', function() {
    fadeTrail = !fadeTrail;
    this.classList.toggle('on', fadeTrail);
    this.textContent = fadeTrail ? 'FADE: ON' : 'FADE: OFF';
  });

  // ── Lazy activation via IntersectionObserver ──
  const fObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        resize();
        if (mode === 'draw') renderDraw();
        else if (!animReq) animReq = requestAnimationFrame(renderAnimate);
      } else {
        if (animReq) { cancelAnimationFrame(animReq); animReq = null; }
      }
    });
  }, { threshold: 0.1 });
  fObs.observe(canvas);

  window.addEventListener('resize', () => {
    resize();
    if (mode === 'draw') renderDraw();
  });

  resize();
  renderDraw();
  updateModeUI();
})(); // end Fourier IIFE
