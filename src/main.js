import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createScene } from './scene.js';
import { detectLang, applyLang, saveLang, t } from './i18n.js';

gsap.registerPlugin(ScrollTrigger);

const ORDER_URL = 'https://svc-vs-98tp.payunicard.ge/?tenant=sachukardi';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const supportsViewTimeline = CSS.supports('animation-timeline: view()');
const supportsScrollTimeline = CSS.supports('animation-timeline: scroll()');
const TAU = Math.PI * 2;

/* ---------- language ----------
   Applied first: everything below (text splitting, marquee copies, layout
   measurements) has to see the final text. */
const lang = detectLang();
applyLang(lang);
if (new URLSearchParams(window.location.search).has('lang')) saveLang(lang);

/* ---------- links ---------- */
document.querySelectorAll('[data-order]').forEach((a) => { a.href = ORDER_URL; });
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

/* ---------- smooth scroll ---------- */
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop(); // until the loading screen is gone
}
window.scrollTo(0, 0);

/* ---------- text splitting ---------- */
function splitChars(el) {
  const chars = Array.from(el.textContent.trim());
  el.setAttribute('aria-label', el.textContent.trim());
  el.innerHTML = chars
    .map((c) => (c === ' ' ? ' ' : `<span class="char" aria-hidden="true">${c}</span>`))
    .join('');
}
function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent.trim());
  el.innerHTML = words.map((w) => `<span class="word" aria-hidden="true">${w}</span>`).join(' ');
}
document.querySelectorAll('[data-split]').forEach(splitChars);
document.querySelectorAll('[data-words]').forEach(splitWords);
document.documentElement.classList.add('split-ready');

/* ---------- 3D scene ---------- */
const scene = createScene(document.getElementById('scene'), {
  cardUrl: '/images/card-face.png',
  wordmarkUrl: '/images/sachukardi-wordmark.svg',
  backLines: [t(lang, 'card.back1'), t(lang, 'card.back2')],
  reducedMotion,
});

/* ---------- hero intro ----------
   Built paused while the loading screen still covers the page, so its start
   state (hidden letters, card off-screen) is in place before anything shows. */
function buildIntro() {
  if (reducedMotion) {
    Object.assign(scene.intro, { y: 0, ry: 0, s: 1, ring: 1 });
    return null;
  }
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
  tl.from('.hero .char', {
    yPercent: 120, rotateX: -95, opacity: 0, transformOrigin: '50% 100% -20px',
    duration: 1.3, stagger: 0.035,
  }, 0.15)
    .from('.reveal-load', { y: 30, opacity: 0, duration: 1.1, stagger: 0.1 }, 0.5)
    .from('.nav', { yPercent: -150, opacity: 0, duration: 1.2 }, 0.3)
    .to(scene.intro, { y: 0, ry: 0, s: 1, duration: 2.4 }, 0)
    .to(scene.intro, { ring: 1, duration: 2, ease: 'power2.out' }, 0.8);
  return tl;
}

/* ---------- loading screen ----------
   Held until the fonts and both faces of the 3D card are ready (at least a
   beat, so a cached load doesn't flicker; at most a few seconds, so a slow
   network never traps the visitor), then lifted like a curtain. */
const loader = document.getElementById('loader');
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

function hideLoader() {
  document.documentElement.classList.remove('is-loading');
  lenis?.start();
  loader.style.animation = 'none'; // drop the CSS failsafe so the loader can be reused
  if (reducedMotion) {
    loader.style.visibility = 'hidden';
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: () => { loader.style.visibility = 'hidden'; } })
      .to(loader.querySelector('.lbar'), { opacity: 0, duration: 0.3 }, 0)
      .to(loader.querySelector('svg'), { y: -24, opacity: 0, duration: 0.5, ease: 'power3.in' }, 0)
      .fromTo(loader, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.9, ease: 'expo.inOut' }, 0.3)
      .call(resolve, null, 0.55);
  });
}

function showLoader() {
  loader.style.animation = 'none';
  loader.style.visibility = 'visible';
  document.documentElement.classList.add('is-loading');
  lenis?.stop();
  if (reducedMotion) return Promise.resolve();
  gsap.set(loader.querySelectorAll('svg, .lbar'), { y: 0, opacity: 1 });
  return new Promise((resolve) => {
    gsap.fromTo(loader, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'expo.inOut', onComplete: resolve });
  });
}

const introTl = buildIntro();
Promise.race([
  Promise.all([document.fonts.ready, scene.ready, wait(700)]),
  wait(5000),
])
  .then(() => { ScrollTrigger.refresh(); return hideLoader(); })
  .then(() => introTl?.play());

/* ---------- in-page links ----------
   A smooth scroll across several sections would fast-forward every pinned
   and scrubbed animation on the way, which looks frantic. Long jumps instead
   fade the page out, move instantly, settle every animation at its
   destination and fade back in. Short hops still scroll smoothly. */
const veil = document.createElement('div');
veil.className = 'veil';
document.body.appendChild(veil);

function targetY(hash) {
  if (hash === '#top') return 0;
  const el = document.querySelector(hash);
  if (!el) return null;
  // a pinned section lives inside its pin spacer; measure the spacer
  const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el;
  return Math.min(box.getBoundingClientRect().top + window.scrollY, ScrollTrigger.maxScroll(window));
}

function settleAnimations() {
  ScrollTrigger.update();
  ScrollTrigger.getAll().forEach((st) => st.getTween?.()?.progress(1));
  scene.snap();
}

let jumping = false;
function jumpTo(y) {
  if (jumping) return;
  if (reducedMotion || !lenis) {
    window.scrollTo(0, y);
    settleAnimations();
    return;
  }
  if (Math.abs(y - window.scrollY) < window.innerHeight * 1.2) {
    lenis.scrollTo(y, { duration: 1.1 });
    return;
  }
  jumping = true;
  gsap.timeline({ onComplete: () => { jumping = false; } })
    .to(veil, { opacity: 1, duration: 0.3, ease: 'power2.in' })
    .add(() => {
      lenis.scrollTo(y, { immediate: true, force: true });
      settleAnimations();
    })
    .to(veil, { opacity: 0, duration: 0.5, ease: 'power2.out' }, '+=0.08');
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  const hash = a.getAttribute('href');
  if (hash.length < 2) return; // placeholder hrefs (order buttons) are replaced above
  a.addEventListener('click', (e) => {
    const y = targetY(hash);
    if (y === null) return;
    e.preventDefault();
    jumpTo(y);
  });
});

/* ---------- language switch ----------
   Reloads into the other language (behind the loading screen) rather than
   swapping text in place: every split heading, pinned section and measured
   keyframe is built from the text, so a clean start is the reliable path. */
document.querySelectorAll('[data-set-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const next = btn.dataset.setLang;
    if (next === lang) return;
    saveLang(next);
    document.querySelectorAll('[data-set-lang]').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    url.hash = '';
    // the timer covers a throttled background tab where the tween never ends
    Promise.race([showLoader(), wait(700)]).then(() => window.location.assign(url));
  });
});

/* ---------- nav hides on scroll down ---------- */
const nav = document.getElementById('nav');
ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate(self) {
    nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 200);
  },
});

/* ---------- progress bar (only when CSS scroll timelines aren't available) ---------- */
if (!supportsScrollTimeline || reducedMotion) {
  gsap.to('.progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
}

/* ---------- 2. slogan: words light up ---------- */
const sloganST = ScrollTrigger.create({
  trigger: '#slogan',
  start: 'top top',
  end: '+=130%',
  pin: true,
  animation: gsap.timeline()
    .fromTo('.slogan__big', { scale: 0.9 }, { scale: 1, ease: 'none', duration: 1 }, 0)
    .to('.slogan__big .word', {
      opacity: 1, ease: 'none', duration: 0.3, stagger: 0.15,
    }, 0),
  scrub: 0.6,
});

/* ---------- 3. steps: one pinned stage, three messages ---------- */
const steps = gsap.utils.toArray('.step');
const numRoll = document.querySelector('.steps__num-roll');
let activeStep = 0;
function setStep(i) {
  if (i === activeStep) return;
  activeStep = i;
  steps.forEach((s, k) => {
    s.classList.toggle('is-active', k === i);
    s.classList.toggle('is-past', k < i);
  });
  numRoll.style.transform = `translateY(${-i}em)`;
}
const stepsST = ScrollTrigger.create({
  trigger: '#steps',
  start: 'top top',
  end: '+=240%',
  pin: true,
  animation: gsap.fromTo('.steps__bar i', { scaleX: 0 }, { scaleX: 1, ease: 'none' }),
  scrub: true,
  onUpdate(self) {
    setStep(self.progress < 0.335 ? 0 : self.progress < 0.665 ? 1 : 2);
  },
});

/* ---------- 4. how: horizontal track ---------- */
const track = document.querySelector('.how__track');
const trackDistance = () => Math.max(0, track.scrollWidth - window.innerWidth);
const howTween = gsap.to(track, {
  x: () => -trackDistance(),
  ease: 'none',
  scrollTrigger: {
    trigger: '#how',
    start: 'top top',
    end: () => `+=${trackDistance() + window.innerHeight * 0.3}`,
    pin: true,
    scrub: 0.8,
    invalidateOnRefresh: true,
  },
});
const howST = howTween.scrollTrigger;
gsap.utils.toArray('.panel').forEach((panel) => {
  ScrollTrigger.create({
    trigger: panel,
    containerAnimation: howTween,
    start: 'left 92%',
    onEnter: () => panel.classList.add('is-in'),
  });
  // panels already on screen when the section arrives
  ScrollTrigger.create({
    trigger: '#how',
    start: 'top 40%',
    onEnter: () => {
      if (panel.getBoundingClientRect().left < window.innerWidth * 0.92) panel.classList.add('is-in');
    },
  });
  panel.addEventListener('pointermove', (e) => {
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
    panel.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* ---------- 5. marquee, reacts to scroll velocity ---------- */
const marqueeTweens = gsap.utils.toArray('.marquee').map((m) => {
  const t = m.querySelector('.marquee__track');
  t.innerHTML += t.innerHTML; // two copies so -50% loops seamlessly
  t.querySelectorAll(':scope > *').forEach((el, i, all) => { if (i >= all.length / 2) el.setAttribute('aria-hidden', 'true'); });
  const dir = Number(m.dataset.dir) || 1;
  return reducedMotion
    ? null
    : gsap.fromTo(t, { xPercent: dir > 0 ? 0 : -50 }, { xPercent: dir > 0 ? -50 : 0, duration: 40, ease: 'none', repeat: -1 });
}).filter(Boolean);

if (marqueeTweens.length) {
  let boost = 0;
  const skew = gsap.quickTo('.marquee__track', 'skewX', { duration: 0.5, ease: 'power3' });
  ScrollTrigger.create({
    trigger: '#where',
    start: 'top bottom',
    end: 'bottom top',
    onUpdate(self) {
      const v = self.getVelocity();
      boost = Math.min(Math.abs(v) / 200, 10);
      skew(gsap.utils.clamp(-10, 10, -v / 250));
    },
  });
  gsap.ticker.add(() => {
    boost *= 0.94;
    if (boost < 0.05) skew(0);
    marqueeTweens.forEach((t) => t.timeScale(1 + boost));
  });
}

/* ---------- 6. stats count up ---------- */
document.querySelectorAll('[data-count]').forEach((el) => {
  const end = Number(el.dataset.count);
  const fmt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
  if (reducedMotion) { el.textContent = fmt(end); return; }
  const o = { v: 0 };
  ScrollTrigger.create({
    trigger: el,
    start: 'top 85%',
    once: true,
    onEnter: () => gsap.to(o, { v: end, duration: 2, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); } }),
  });
});

/* ---------- reveals: native CSS view timelines, GSAP fallback ---------- */
if (!reducedMotion) {
  if (supportsViewTimeline) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('css-sda'));
  } else {
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.from(el, {
        y: 60, opacity: 0, scale: 0.96, filter: 'blur(10px)', duration: 1.2, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
      });
    });
  }

  // final headline builds letter by letter with the scroll
  gsap.from('.cta .char', {
    yPercent: 100, rotateX: -80, opacity: 0, stagger: 0.03, ease: 'power2.out',
    scrollTrigger: { trigger: '.cta__title', start: 'top 95%', end: 'top 55%', scrub: 0.6 },
  });
}

/* ---------- magnetic buttons ---------- */
if (window.matchMedia('(pointer: fine)').matches && !reducedMotion) {
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.3);
      yTo((e.clientY - r.top - r.height / 2) * 0.4);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });
}

/* ---------- card choreography ----------
   Keyframes are anchored to the pinned sections, so they're rebuilt whenever
   ScrollTrigger re-measures (resize, font load, …). */
const ctaEnter = ScrollTrigger.create({ trigger: '#order', start: 'top bottom' });
const ctaStage = document.querySelector('.cta__stage');
const heroText = document.querySelector('.hero__text');

function buildFrames() {
  const mobile = window.innerWidth < 900;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const at = (st, p = 0) => st.start + (st.end - st.start) * p;
  const max = ScrollTrigger.maxScroll(window);
  const fit = mobile ? { fitW: 0.66, fitH: 0.26 } : { fitW: 0.36, fitH: 0.5 };

  // Desktop hero: the card sits in the space right of the text column,
  // which runs to halfway into the right margin, and keeps at least an 80px
  // gap from the headline (shrinking on very wide screens if it must).
  const contentL = heroText.offsetLeft;
  const textR = contentL + heroText.offsetWidth;
  const spaceR = vw - contentL / 2;
  const cardW = Math.min(fit.fitW * vw, fit.fitH * vh * 1.586); // card width at s = 1
  const heroX = ((textR + spaceR) / 2 + 30 - vw / 2) / (vw / 2);
  const heroS = Math.min(1, (spaceR - textR - 80) / cardW);

  // Where the final section's empty stage sits on screen once the page is
  // fully scrolled; the card lands in the middle of it, sized to fit.
  const r = ctaStage.getBoundingClientRect();
  const stageTop = Math.max(r.top + window.scrollY - max, 80);
  const stageBottom = r.bottom + window.scrollY - max;
  const cardPx = Math.min((fit.fitW * vw) / 1.586, fit.fitH * vh); // card height at s = 1
  const ctaY = 1 - (stageTop + stageBottom) / vh;
  const ctaS = Math.min(mobile ? 1 : 1.1, (0.7 * (stageBottom - stageTop)) / cardPx);

  // three step poses: front, back, front — each a half turn apart
  const stepX = mobile ? 0 : -0.5;
  const stepY = mobile ? 0.5 : 0;
  const stepS = mobile ? 0.8 : 0.95;
  const stepPose = (i) => ({
    x: stepX, y: stepY, s: stepS, ring: 0.15,
    rx: [0.1, -0.12, 0.18][i],
    ry: TAU + Math.PI * i + (mobile ? 0.15 : 0.4),
    rz: [0.05, -0.06, 0.08][i],
  });

  const hidden = { x: mobile ? 0 : -0.1, y: 2.2, rx: 0.8, ry: TAU * 2 + 2, rz: 0.3, s: 0.7, ring: 0 };
  const ctaPose = { x: 0, y: ctaY, rx: 0.1, ry: TAU * 3, rz: -0.05, s: ctaS, ring: 1 };

  const frames = [
    {
      at: 0,
      pose: mobile
        ? { x: 0, y: 0.47, rx: 0.16, ry: -0.3, rz: 0.08, s: 1, ring: 1 }
        : { x: heroX, y: 0.02, rx: 0.12, ry: -0.5, rz: 0.14, s: heroS, ring: 1 },
    },
    // slogan: card slips behind the words, showing its back (which carries the slogan)
    {
      at: at(sloganST),
      pose: mobile
        ? { x: 0, y: 0.6, rx: 0.3, ry: Math.PI + 0.2, rz: -0.1, s: 0.7, ring: 0.3 }
        : { x: 0.22, y: -0.08, rx: 0.3, ry: Math.PI - 0.3, rz: -0.12, s: 0.75, ring: 0.3 },
    },
    { at: at(sloganST, 1), pose: stepPose(0) },
    // steps: flip at each step change
    { at: at(stepsST, 0.27), pose: stepPose(0) },
    { at: at(stepsST, 0.4), pose: stepPose(1) },
    { at: at(stepsST, 0.6), pose: stepPose(1) },
    { at: at(stepsST, 0.73), pose: stepPose(2) },
    { at: at(stepsST, 1), pose: stepPose(2) },
    // fly out while the horizontal track takes over
    { at: at(howST, 0), pose: hidden },
    // teleport below the fold while off-screen, then rise into the final section
    { at: ctaEnter.start - 2, pose: hidden },
    { at: ctaEnter.start - 1, pose: { ...hidden, y: -2.2, ry: TAU * 3 - 2.4 } },
    { at: max, pose: ctaPose },
  ];

  scene.setKeyframes(frames, fit);
}

ScrollTrigger.addEventListener('refresh', buildFrames);
buildFrames();
