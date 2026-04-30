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
  let trailAcc   = 0;       // fractional accumulator — keeps trail density constant across speeds
  let animT      = 0;       // [0,1) phase through one full cycle
  let animReq    = null;
  let isDrawing  = false;

  // ── Controls ──
  let circleCount = 64;
  let animSpeed   = 1.0;
  let showCircles = true;
  let showGhost   = true;
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
    if (showGhost && ghostPath.length > 1) {
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
        ctx.save();
        // Circle outline — visible floor so even small circles read clearly
        ctx.strokeStyle = `rgba(92,168,255,${Math.max(0.12, Math.min(0.6, amp / 22))})`;
        ctx.lineWidth   = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, amp, 0, Math.PI*2); ctx.stroke();
        // Arm
        ctx.strokeStyle = `rgba(255,208,0,${Math.max(0.25, Math.min(0.9, amp / 14))})`;
        ctx.lineWidth   = 1.2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.restore();
      }

      cx = nx; cy = ny;
    }

    // Trail — accumulator keeps point density constant regardless of speed
    trailAcc += animSpeed;
    if (trailAcc >= 1) {
      trailAcc -= 1;
      trail.push({ x: cx, y: cy });
    }

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

    // Advance time; on cycle wrap → clear trail and reset accumulator
    const prevT = animT;
    animT = (animT + animSpeed / N) % 1;
    if (animT < prevT) { trail = []; trailAcc = 0; }
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
    trailAcc  = 0;
    animT     = 0;
    mode      = 'animate';
    canvas.classList.add('animating');
    updateModeUI();
    if (animReq) cancelAnimationFrame(animReq);
    animReq = requestAnimationFrame(renderAnimate);
  }

  // ── Clear everything, go back to draw mode ──
  function clearAll() {
    cancelAnimationFrame(animReq);   // safe even if animReq is null
    animReq   = null;
    isDrawing = false;
    rawPts = []; dftCoeffs = []; trail = []; ghostPath = [];
    animT = 0; trailAcc = 0;
    mode   = 'draw';
    canvas.classList.remove('animating');
    updateModeUI();
    resize();        // ensures canvas.width/height are current before clearing
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

  // ── Preset curve generators ──
  function makeHeart(scale) {
    const pts = [], N = 200;
    for (let i = 0; i < N; i++) {
      const t = (2 * Math.PI * i / N) - Math.PI;
      pts.push({
        x:  scale * 16 * Math.pow(Math.sin(t), 3),
        y: -scale * (13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t))
      });
    }
    return pts;
  }

  function makeStar(scale, n = 5) {
    const pts = [], steps = 20;
    const corners = [];
    for (let i = 0; i <= n * 2; i++) {
      const angle = (Math.PI * i / n) - Math.PI/2;
      const r = (i % 2 === 0) ? scale : scale * 0.42;
      corners.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
    for (let i = 0; i < corners.length - 1; i++) {
      const P = corners[i], Q = corners[i+1];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pts.push({ x: P.x + t*(Q.x-P.x), y: P.y + t*(Q.y-P.y) });
      }
    }
    return pts;
  }

  function makeTrefoil(scale) {
    const pts = [], N = 210;
    for (let i = 0; i <= N; i++) {          // <= N so t reaches exactly π (closed)
      const t = Math.PI * i / N;
      const r = Math.cos(3 * t);
      pts.push({ x: scale * r * Math.cos(t), y: scale * r * Math.sin(t) });
    }
    return pts;
  }

  function makeLissajous(scale, a = 3, b = 2) {
    const pts = [], N = 300;
    for (let i = 0; i < N; i++) {
      const t = 2 * Math.PI * i / N;
      pts.push({ x: scale * Math.sin(a * t + Math.PI/2), y: scale * Math.sin(b * t) });
    }
    return pts;
  }

  function loadPreset(normPts) {
    if (animReq) { cancelAnimationFrame(animReq); animReq = null; }
    resize();
    const cx = canvas.width / 2, cy = canvas.height / 2;
    rawPts = normPts.map(p => ({ x: cx + p.x, y: cy + p.y }));
    mode = 'draw';
    canvas.classList.remove('animating');
    updateModeUI();
    analyze();
  }

  const _S = () => Math.min(canvas.width || 400, canvas.height || 300);
  window._fourierPresets = {
    heart:     () => loadPreset(makeHeart(_S() / 40)),
    star:      () => loadPreset(makeStar(_S() * 0.38)),
    trefoil:   () => loadPreset(makeTrefoil(_S() * 0.40)),
    lissajous: () => loadPreset(makeLissajous(_S() * 0.40)),
  };

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
    animSpeed = parseFloat(sSlider.value);
    document.getElementById('lbl-f-speed').textContent = animSpeed.toFixed(1) + 'x';
    trail = []; trailAcc = 0;
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

  document.getElementById('btn-f-ghost')?.addEventListener('click', function() {
    showGhost = !showGhost;
    this.classList.toggle('on', showGhost);
    this.textContent = showGhost ? 'GHOST: ON' : 'GHOST: OFF';
  });

  // ── Lazy activation via IntersectionObserver ──
  let _autoLoaded = false;
  const fObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        resize();
        if (!_autoLoaded && rawPts.length === 0) {
          _autoLoaded = true;
          setTimeout(() => loadPreset(makeHeart(_S() / 40)), 350);
        } else if (mode === 'draw') renderDraw();
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
