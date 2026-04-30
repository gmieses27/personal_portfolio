// ════════════════════════════════════════
// ARBITER DEMO — portfolio simulation
// Simulates the authorization gateway locally (no server needed).
// ════════════════════════════════════════

(function () {
  'use strict';

  // ── Policy engine (mirrors the Go implementation) ─────────────────────────

  const POLICIES = [
    { id: 'admin-full-access',  subjects: ['role:admin'],   resources: ['*'],              actions: ['*'],                    effect: 'allow' },
    { id: 'viewer-read-api',    subjects: ['role:viewer'],  resources: ['/api/*'],          actions: ['GET', 'HEAD'],          effect: 'allow' },
    { id: 'service-internal',   subjects: ['role:service'], resources: ['/api/*'],          actions: ['*'],                    effect: 'allow' },
    { id: 'nuke-lockdown',      subjects: ['*'],            resources: ['/api/nuclear'],    actions: ['*'],                    effect: 'deny'  },
    { id: 'viewer-no-admin',    subjects: ['role:viewer'],  resources: ['/admin/*'],        actions: ['*'],                    effect: 'deny'  },
    { id: 'anon-health-only',   subjects: ['role:anonymous'], resources: ['/health'],       actions: ['GET'],                  effect: 'allow' },
  ];

  const IDENTITIES = {
    admin:   { subject: 'alice',       role: 'admin',     source: 'apikey' },
    viewer:  { subject: 'bob',         role: 'viewer',    source: 'apikey' },
    service: { subject: 'svc-backend', role: 'service',   source: 'apikey' },
    anon:    { subject: 'anonymous',   role: 'anonymous', source: 'anonymous' },
  };

  function matchSubject(patterns, subject, role) {
    for (const p of patterns) {
      if (p === '*') return true;
      if (p.startsWith('role:') && p.slice(5) === role) return true;
      if (p.startsWith('subject:') && p.slice(8) === subject) return true;
    }
    return false;
  }

  function matchResource(patterns, path) {
    for (const p of patterns) {
      if (p === '*') return true;
      if (p.endsWith('/*') && path.startsWith(p.slice(0, -1))) return true;
      if (p === path) return true;
    }
    return false;
  }

  function matchAction(patterns, method) {
    const m = method.toUpperCase();
    return patterns.some(p => p === '*' || p.toUpperCase() === m);
  }

  function evaluate(identity, method, path) {
    let allowRule = null;
    let denyRule  = null;
    for (const rule of POLICIES) {
      if (!matchSubject(rule.subjects, identity.subject, identity.role)) continue;
      if (!matchResource(rule.resources, path)) continue;
      if (!matchAction(rule.actions, method)) continue;
      if (rule.effect === 'deny') { denyRule = rule; break; }
      if (rule.effect === 'allow' && !allowRule) allowRule = rule;
    }
    if (denyRule)  return { allow: false, ruleId: denyRule.id,     reason: 'explicit deny' };
    if (allowRule) return { allow: true,  ruleId: allowRule.id,    reason: 'matched allow rule' };
    return            { allow: false, ruleId: 'default-deny', reason: 'no matching allow rule' };
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  const selIdentity = document.getElementById('arb-identity');
  const selMethod   = document.getElementById('arb-method');
  const selPath     = document.getElementById('arb-path');
  const btnSend     = document.getElementById('arb-send');
  const btnFlood    = document.getElementById('arb-flood');
  const feed        = document.getElementById('arb-feed');
  const verdictEl   = document.getElementById('arb-verdict');
  const statsEl     = document.getElementById('arb-stats');

  if (!btnSend) return; // demo not on page

  let total = 0, allowed = 0, denied = 0;
  let floodTimer = null;

  function fmtTime() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2,'0')).join(':');
  }

  function fakeLatency() { return Math.floor(Math.random() * 8 + 1); }

  function sendRequest() {
    const identityKey = selIdentity.value;
    const method      = selMethod.value;
    const path        = selPath.value;
    const identity    = IDENTITIES[identityKey];
    const decision    = evaluate(identity, method, path);
    const latency     = fakeLatency();

    total++;
    if (decision.allow) allowed++; else denied++;

    // Verdict display
    if (decision.allow) {
      verdictEl.style.color = 'var(--green)';
      verdictEl.textContent = '✓ ALLOWED — ' + decision.ruleId;
    } else {
      verdictEl.style.color = 'var(--red)';
      verdictEl.textContent = '✗ DENIED — ' + decision.ruleId;
    }

    // Stats
    const allowPct = total > 0 ? ((allowed / total) * 100).toFixed(0) : 0;
    statsEl.textContent = `${total} total · ${allowPct}% allow`;

    // Feed row (prepend, newest at top)
    const row = document.createElement('div');
    row.className = 'arb-entry';
    row.innerHTML = `
      <span class="arb-time">${fmtTime()}</span>
      <span class="arb-method">${method}</span>
      <span class="arb-path">${path}</span>
      <span class="arb-id">${identity.subject}</span>
      <span class="${decision.allow ? 'arb-allow' : 'arb-deny'}">${decision.allow ? '✓ ALLOW' : '✗ DENY'}</span>
    `;
    feed.prepend(row);

    // Keep feed bounded
    while (feed.children.length > 60) feed.removeChild(feed.lastChild);
  }

  btnSend.addEventListener('click', sendRequest);

  // Auto-flood: cycles through a mix of identities/paths automatically
  const FLOOD_SCENARIOS = [
    { identity: 'admin',   method: 'GET',    path: '/admin/settings' },
    { identity: 'viewer',  method: 'GET',    path: '/api/users' },
    { identity: 'viewer',  method: 'POST',   path: '/api/users' },
    { identity: 'viewer',  method: 'GET',    path: '/admin/settings' },
    { identity: 'admin',   method: 'GET',    path: '/api/nuclear' },
    { identity: 'service', method: 'POST',   path: '/api/reports' },
    { identity: 'anon',    method: 'GET',    path: '/health' },
    { identity: 'anon',    method: 'GET',    path: '/api/users' },
    { identity: 'service', method: 'DELETE', path: '/api/users' },
    { identity: 'admin',   method: 'DELETE', path: '/admin/settings' },
  ];
  let floodIdx = 0;
  let flooding = false;

  btnFlood.addEventListener('click', () => {
    flooding = !flooding;
    btnFlood.textContent = flooding ? 'STOP FLOOD' : 'AUTO-FLOOD';
    if (flooding) {
      const step = () => {
        if (!flooding) return;
        const s = FLOOD_SCENARIOS[floodIdx % FLOOD_SCENARIOS.length];
        floodIdx++;
        selIdentity.value = s.identity;
        selMethod.value   = s.method;
        selPath.value     = s.path;
        sendRequest();
        floodTimer = setTimeout(step, 380);
      };
      step();
    } else {
      clearTimeout(floodTimer);
    }
  });

})();
