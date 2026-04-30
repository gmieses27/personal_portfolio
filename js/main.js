// ════════════════════════════════════════
// GABRIEL MIESES — PORTFOLIO
// main.js: nav, scroll reveal, interactions
// ════════════════════════════════════════

// ── SCROLL REVEAL ──
// Elements with class "rv" fade in when they enter the viewport.
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('in');
  });
}, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

document.querySelectorAll('.rv').forEach(el => revealObserver.observe(el));

// ── ACTIVE NAV LINK ──
// Highlights the nav link for whichever section is currently in view.
const navLinks  = document.querySelectorAll('.nav-links a');
const sections  = document.querySelectorAll('section[id]');

const navObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
      });
    }
  });
}, { threshold: 0.35 });

sections.forEach(s => navObserver.observe(s));

// ── KEYBOARD SHORTCUTS ──
// Numbers 1-5 jump to each section.
const SECTION_MAP = {
  '1': '#hero',
  '2': '#experience',
  '3': '#projects',
  '4': '#education',
  '5': '#demos',
  '6': '#contact',
};
document.addEventListener('keydown', e => {
  const target = SECTION_MAP[e.key];
  if (target) document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
});

// ── THEME TOGGLE ──
const themeBtn = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.dataset.theme = savedTheme;
themeBtn.textContent = savedTheme === 'dark' ? '☀' : '☽';

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  themeBtn.textContent = next === 'dark' ? '☀' : '☽';
});
