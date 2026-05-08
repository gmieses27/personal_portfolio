/**
 * Raft Consensus Simulation — portfolio demo for distributed-key-value-store
 *
 * This is a faithful behavioral simulation of the Raft algorithm:
 * leader election with randomised timeouts, heartbeat-based term propagation,
 * log replication with commit after majority ACK, and network partition.
 *
 * It does NOT talk to the real Go cluster — for that, run ./scripts/start.sh
 * in the distributed-key-value-store repo and open web/index.html.
 */
(function () {

  // ── Config ──────────────────────────────────────────────────────────────
  const TICK_MS        = 80;
  const HEARTBEAT_MS   = 1100;   // leader sends heartbeats this often
  const ELECTION_MIN   = 2800;   // follower election timeout range (ms)
  const ELECTION_MAX   = 5000;
  const REPLICATE_MS   = 380;    // simulated replication delay before commit
  const ANIM_DURATION  = 360;    // flying-message animation duration (ms)
  const MAX_LOG        = 14;     // max log entries rendered

  // SVG node centres (viewBox 0 0 420 295)
  const POS = { 1: [210, 58], 2: [360, 245], 3: [60, 245] };

  // ── State ────────────────────────────────────────────────────────────────
  let nodes, sharedLog, kv, anims, ticker, started;

  function mkNode(id) {
    return {
      id,
      role: 'follower',
      term: 0,
      paused: false,
      // Stagger initial timeouts so they don't all fire at the same time
      lastHb: Date.now() + id * 400,
      electionTo: rndTo(),
      lastHbSent: 0,
    };
  }

  function rndTo() {
    return ELECTION_MIN + Math.random() * (ELECTION_MAX - ELECTION_MIN);
  }

  function init() {
    nodes     = [mkNode(1), mkNode(2), mkNode(3)];
    sharedLog = [];   // {index, term, command, committed}
    kv        = {};
    anims     = [];   // {from, to, t, dur, color}

    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick, TICK_MS);

    render();
    renderKV();
    setResult('Cluster starting — first election in ~3 s');
  }

  // ── Simulation tick ──────────────────────────────────────────────────────
  function tick() {
    const now = Date.now();

    // Election timeout check — followers and candidates
    nodes.forEach(n => {
      if (n.paused || n.role === 'leader') return;
      if (now - n.lastHb >= n.electionTo) runElection(n, now);
    });

    // Leader heartbeats
    const lead = leader();
    if (lead && !lead.paused && now - lead.lastHbSent >= HEARTBEAT_MS) {
      lead.lastHbSent = now;
      nodes.forEach(n => {
        if (n.id === lead.id || n.paused) return;
        n.lastHb    = now;
        n.electionTo = rndTo();
        pushAnim(lead.id, n.id, '#8880a8', now); // purple heartbeat dot
      });
    }

    // Expire old animations
    anims = anims.filter(a => now - a.t < a.dur);

    render();
  }

  // ── Election ─────────────────────────────────────────────────────────────
  function runElection(candidate, now) {
    const active = nodes.filter(n => !n.paused);
    if (active.length < 2) return; // can't win alone

    candidate.term++;
    candidate.role     = 'candidate';
    candidate.lastHb   = now;
    candidate.electionTo = rndTo();

    render(); // show orange immediately

    // Collect votes after a short delay (simulates network round-trip)
    setTimeout(() => {
      if (candidate.paused) return; // partitioned while waiting

      let votes = 1; // vote for self
      const fresh = Date.now();

      active.forEach(n => {
        if (n.id === candidate.id || n.paused) return;
        // Grant vote if candidate's term is higher
        if (candidate.term > n.term) {
          votes++;
          n.term   = candidate.term;
          n.lastHb = fresh;
          pushAnim(n.id, candidate.id, '#f07040', fresh); // orange vote dot
        }
      });

      const majority = Math.floor(active.length / 2) + 1;

      if (votes >= majority && candidate.role === 'candidate') {
        // Won election
        candidate.role       = 'leader';
        candidate.lastHbSent = 0; // force immediate heartbeat
        nodes.forEach(n => {
          if (n.id === candidate.id || n.paused) return;
          n.term  = candidate.term;
          n.role  = 'follower';
          n.lastHb = fresh;
        });
        setResult(`Node ${candidate.id} elected leader (term ${candidate.term})`);
        render();
      } else if (candidate.role === 'candidate') {
        // Election failed — back to follower, retry later
        candidate.role = 'follower';
        render();
      }
    }, 350);
  }

  // ── Log / KV ─────────────────────────────────────────────────────────────
  function submitPut(key, value) {
    if (!key) return setResult('key is required', true);
    const lead = leader();
    if (!lead) return setResult('No leader yet — wait for election', true);

    const cmd   = `put:${key}=${value}`;
    const index = sharedLog.length;
    const entry = { index, term: lead.term, command: cmd, committed: false };
    sharedLog.push(entry);

    const now = Date.now();
    nodes.forEach(n => {
      if (n.id !== lead.id && !n.paused) {
        pushAnim(lead.id, n.id, '#50d080', now); // green replication dot
      }
    });

    renderLog();

    // Commit after replication delay (majority ack simulation)
    setTimeout(() => {
      entry.committed = true;
      kv[key] = value;
      setResult(`put ${key} = "${value}" — committed at log[${index}]`);
      renderLog();
      renderKV();
    }, REPLICATE_MS);
  }

  function submitGet(key) {
    if (!key) return setResult('key is required', true);
    const val = kv[key];
    if (val !== undefined) {
      setResult(`"${key}" → "${val}"`);
    } else {
      setResult(`"${key}" not found`, true);
    }
  }

  function partitionNode(id) {
    const n = nodes.find(n => n.id === id);
    if (!n) return;
    n.paused = true;
    if (n.role === 'leader') n.role = 'follower';
    setResult(`Node ${id} partitioned — other nodes will re-elect`);
    render();
  }

  function reconnectNode(id) {
    const n = nodes.find(n => n.id === id);
    if (!n) return;
    n.paused    = false;
    n.lastHb    = Date.now();
    n.electionTo = rndTo();
    const lead  = leader();
    if (lead) n.term = lead.term;
    setResult(`Node ${id} reconnected — catching up`);
    render();
  }

  function resetCluster() {
    init();
  }

  // ── Animations ───────────────────────────────────────────────────────────
  function pushAnim(from, to, color, t) {
    anims.push({ from, to, color, t, dur: ANIM_DURATION });
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  const ROLE_COLOR = {
    leader:    '#f5c842',
    candidate: '#f07040',
    follower:  '#3cc0a0',
    paused:    '#605c80',
  };

  function render() {
    nodes.forEach(renderNode);
    renderLog();
    renderAnims();
  }

  function renderNode(n) {
    const role  = n.paused ? 'paused' : n.role;
    const color = ROLE_COLOR[role] || '#3cc0a0';

    const roleEl = document.getElementById(`rd-role-${n.id}`);
    const bgEl   = document.getElementById(`rd-bg-${n.id}`);
    const ringEl = document.getElementById(`rd-ring-${n.id}`);
    const termEl = document.getElementById(`rd-term-${n.id}`);

    if (roleEl) { roleEl.textContent = role.toUpperCase(); roleEl.setAttribute('fill', color); }
    if (bgEl)   bgEl.setAttribute('stroke', color);
    if (ringEl) {
      ringEl.setAttribute('stroke', color);
      ringEl.setAttribute('opacity', role === 'leader' ? '0.55' : '0.18');
      ringEl.style.animation = role === 'leader'
        ? 'rdRing 1.4s ease-in-out infinite' : 'none';
    }
    if (termEl) termEl.textContent = `t:${n.term}`;
  }

  function renderLog() {
    const el = document.getElementById('rd-log');
    if (!el) return;
    const slice = sharedLog.slice(-MAX_LOG).reverse();
    el.innerHTML = slice.map(e =>
      `<div class="rd-log-entry${e.committed ? '' : ' pending'}">
        <span class="rd-idx">[${e.index}]</span>
        <span class="rd-trm">t${e.term}</span>
        <span class="rd-cmd">${esc(e.command)}</span>
        <span class="${e.committed ? 'rd-ok' : 'rd-wait'}">${e.committed ? '✓' : '…'}</span>
      </div>`
    ).join('');
  }

  function renderKV() {
    const el = document.getElementById('rd-kv');
    if (!el) return;
    const keys = Object.keys(kv);
    if (keys.length === 0) {
      el.innerHTML = '<span style="color:var(--dim);font-size:10px">empty</span>';
      return;
    }
    el.innerHTML = keys.sort().map(k =>
      `<div class="kv-pair"><span class="kv-k">${esc(k)}</span>: <span class="kv-v">${esc(kv[k])}</span></div>`
    ).join('');
  }

  function renderAnims() {
    const layer = document.getElementById('rd-anim-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const now = Date.now();
    anims.forEach(a => {
      const p = Math.min(1, (now - a.t) / a.dur);
      const [x1, y1] = POS[a.from];
      const [x2, y2] = POS[a.to];
      const x = x1 + (x2 - x1) * p;
      const y = y1 + (y2 - y1) * p;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y);
      c.setAttribute('r', 4);  c.setAttribute('fill', a.color);
      c.setAttribute('opacity', (1 - p * 0.4).toFixed(2));
      layer.appendChild(c);
    });
  }

  function setResult(msg, isErr = false) {
    const el = document.getElementById('rd-result');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'result-box' + (isErr ? ' error' : '');
  }

  function leader() { return nodes.find(n => n.role === 'leader' && !n.paused); }
  function esc(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Inject leader ring keyframe once ─────────────────────────────────────
  const s = document.createElement('style');
  s.textContent = `@keyframes rdRing {
    0%,100% { r: 36; opacity: 0.55; }
    50%      { r: 42; opacity: 0.2; }
  }`;
  document.head.appendChild(s);

  // ── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    // Wire buttons
    const $ = id => document.getElementById(id);

    $('rd-put-btn')?.addEventListener('click', () =>
      submitPut($('rd-put-key')?.value.trim(), $('rd-put-val')?.value.trim()));

    $('rd-get-btn')?.addEventListener('click', () =>
      submitGet($('rd-get-key')?.value.trim()));

    ['rd-put-key','rd-put-val'].forEach(id =>
      $(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter')
          submitPut($('rd-put-key')?.value.trim(), $('rd-put-val')?.value.trim());
      }));

    $('rd-get-key')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitGet($('rd-get-key')?.value.trim());
    });

    $('rd-reset-btn')?.addEventListener('click', resetCluster);

    [1, 2, 3].forEach(id => {
      $(`rd-pause-${id}`)?.addEventListener('click',  () => partitionNode(id));
      $(`rd-resume-${id}`)?.addEventListener('click', () => reconnectNode(id));
    });

    // Start when demo block scrolls into view
    const block = $('rd-demo-block');
    if (!block) return;
    if (started) return;

    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !started) {
        started = true;
        obs.disconnect();
        init();
      }
    }, { threshold: 0.15 });
    obs.observe(block);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
