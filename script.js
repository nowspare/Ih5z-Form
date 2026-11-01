/* ================================================================
   Music Recommendation Platform — script.js
   Sections: helpers · config/backend · theme · router · 3D hero ·
             waveform & visualizer · public content · request form ·
             admin dashboard · init
   ================================================================ */
(() => {
  'use strict';

  /* ---------------------------------------------------------------
     Helpers
  --------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /** Safe element builder (never uses innerHTML, so user text can't inject markup). */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const safeUrl = (u) => {
    if (!u) return '';
    try {
      const url = new URL(String(u).trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (_) { return ''; }
  };
  const clean = (v) => { const s = (v ?? '').toString().trim(); return s === '' ? null : s; };
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  const fmtDate = (iso) => {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
    catch (_) { return iso || ''; }
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const hueOf = (s) => { let n = 0; for (const c of String(s)) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };
  const svgIcon = (markup, size = 26) => {
    const span = h('span', { class: 'svg-wrap', 'aria-hidden': 'true' });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
    return span;
  };

  /* Toasts */
  function toast(type, message, ms = 4200) {
    const box = $('#toasts');
    if (!box) return;
    const t = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
  }

  /* Confirm dialog -> Promise<boolean> */
  function confirmDialog(title, message, okLabel = 'Delete') {
    const dlg = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = message;
    $('#confirmOk').textContent = okLabel;
    return new Promise((resolve) => {
      const onClose = () => { dlg.removeEventListener('close', onClose); resolve(dlg.returnValue === 'ok'); };
      dlg.returnValue = 'cancel';
      dlg.addEventListener('close', onClose);
      openDialog(dlg);
    });
  }

  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = h('textarea', { style: 'position:fixed;opacity:0;left:-999px' });
        ta.value = text; document.body.append(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove();
        if (!ok) throw new Error('copy failed');
      }
      toast('success', 'Copied to clipboard');
    } catch (_) {
      toast('error', 'Couldn’t copy automatically. Select the text and copy manually.');
    }
  }

  /* ---------------------------------------------------------------
     Config & backend
  --------------------------------------------------------------- */
  const CFG = window.SITE_CONFIG || {};
  const MOODS = ['Sad', 'Romantic', 'Chill', 'Dreamy', 'Nostalgic', 'Dark', 'Happy', 'Heartbreak', 'Late Night', 'Energetic', 'Underrated Gems'];
  const STATUSES = ['pending', 'reviewed', 'accepted', 'completed'];
  const CATEGORIES = [
    { key: 'weekly', label: 'Featured of the Week' },
    { key: 'favorites', label: 'My Current Favorites' },
    { key: 'underrated', label: 'Underrated Songs' },
    { key: 'requested', label: 'Most Requested Songs' }
  ];
  const PLATFORMS = [
    { key: 'instagram', name: 'Instagram', base: 'https://www.instagram.com/', at: true,
      icon: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/>' },
    { key: 'tiktok', name: 'TikTok', base: 'https://www.tiktok.com/@', at: true,
      icon: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2 4.2 5 4.5"/>' },
    { key: 'spotify', name: 'Spotify', base: 'https://open.spotify.com/user/', at: false,
      icon: '<circle cx="12" cy="12" r="9.5"/><path d="M7 9.4c3.4-1 7.2-.7 10.2 1"/><path d="M7.6 12.6c2.8-.8 5.8-.5 8.3.9"/><path d="M8.3 15.6c2.2-.6 4.4-.4 6.3.6"/>' },
    { key: 'youtube', name: 'YouTube', base: 'https://www.youtube.com/@', at: true,
      icon: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none"/>' },
    { key: 'pinterest', name: 'Pinterest', base: 'https://www.pinterest.com/', at: false,
      icon: '<circle cx="12" cy="12" r="9.5"/><path d="M11 16.5l1.6-6.8M10.2 13.8c-1.3-2 .3-4.8 2.6-4.8 1.7 0 2.6 1.2 2.4 2.7-.2 1.6-1.1 2.8-2.3 2.8-1 0-1.5-.8-1.3-1.6"/>' },
    { key: 'x', name: 'X / Twitter', base: 'https://x.com/', at: true,
      icon: '<path d="M4 4l16 16M20 4L4 20"/>' },
    { key: 'discord', ih5z: 'Discord', base:https:'//discord.com/users/usingspareaccount' , at: true,
      icon: '<path d="M5.5 6.5c2-1.2 4-1.7 6.5-1.7s4.5.5 6.5 1.7c1.6 2.7 2.4 5.6 2.4 9-1.6 1.4-3.2 2.2-5 2.7l-1-1.8M5.5 6.5C3.9 9.2 3.1 12.1 3.1 15.5c1.6 1.4 3.2 2.2 5 2.7l1-1.8"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/>' }
  ];

  const hasBackend = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && /^https?:\/\//.test(CFG.supabaseUrl) && window.supabase && window.supabase.createClient);
  let sb = null;
  if (hasBackend) {
    try { sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } }); }
    catch (_) { sb = null; }
  }

  const state = {
    page: 'home',
    settings: {
      profile: Object.assign({ siteName: 'Your Name', logoText: '♪', welcome: '', avatarUrl: '', aboutName: '', aboutText: '', genres: [], why: '' }, CFG.profile || {}),
      socials: JSON.parse(JSON.stringify(CFG.socials || {}))
    },
    featured: [],
    featuredLoaded: false,
    featTab: 'all',
    requests: [],
    selected: new Set(),
    adminReady: false
  };

  /* ---------------------------------------------------------------
     Theme (white is the default)
  --------------------------------------------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = $('#themeToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#121214' : '#faf8f4');
    cacheColors();
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (_) { /* storage blocked */ }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('theme', next); } catch (_) { /* ignore */ }
    });
  }

  /* ---------------------------------------------------------------
     Router (hash based) + navigation
  --------------------------------------------------------------- */
  const PAGES = ['home', 'request', 'featured', 'about', 'connect', 'admin'];
  const TITLES = { home: 'Home', request: 'Request Music', featured: 'Featured', about: 'About Me', connect: 'Connect With Me', admin: 'Admin' };

  function showPage(name, { focus = true } = {}) {
    state.page = name;
    $$('.page').forEach((p) => {
      const on = p.dataset.page === name;
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${TITLES[name]} · ${state.settings.profile.siteName || 'Music'}`;
    window.scrollTo({ top: 0, behavior: 'auto' });
    closeMenu();
    if (focus) { const m = $('#main'); if (m) m.focus({ preventScroll: true }); }
    if (name === 'featured') ensureFeatured();
    if (name === 'admin') adminEnter();
    if (name !== 'home' && viz.playing) stopViz();
    observeReveals();
  }
  function route() {
    let name = (location.hash || '#home').slice(1);
    if (!PAGES.includes(name)) name = 'home';
    showPage(name);
  }

  function closeMenu() {
    const links = $('#navLinks'), btn = $('#menuToggle');
    if (!links) return;
    links.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
  }
  function initNav() {
    const btn = $('#menuToggle'), links = $('#navLinks');
    btn.addEventListener('click', () => {
      const open = !links.classList.contains('open');
      links.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.nav')) closeMenu(); });
    $('[data-skip]').addEventListener('click', (e) => { e.preventDefault(); $('#main').focus(); });
    window.addEventListener('hashchange', route);
    // Re-clicking the current tab should still scroll to top
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const target = a.getAttribute('href').slice(1);
      if (PAGES.includes(target) && target === state.page) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); closeMenu(); }
    });
  }

  /* ---------------------------------------------------------------
     Scroll reveal + tilt
  --------------------------------------------------------------- */
  let revealObserver = null;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach((el) => el.classList.add('in')); return; }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    }
    $$('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
  }

  function attachTilt(el, max = 9) {
    if (!finePointer || reduceMotion || el.dataset.tilt) return;
    el.dataset.tilt = '1';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', ((px - 0.5) * max * 2).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((0.5 - py) * max * 2).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  }
  const initTilts = (root = document) => $$('.tilt', root).forEach((el) => attachTilt(el));

  /* ---------------------------------------------------------------
     Shared animation loop (only runs what's visible)
  --------------------------------------------------------------- */
  const animators = [];
  let colors = { ink: '#1d1d1f', accent: '#c9593f' };
  function cacheColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = { ink: cs.getPropertyValue('--ink').trim() || '#1d1d1f', accent: cs.getPropertyValue('--accent').trim() || '#c9593f' };
  }
  function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    for (const a of animators) { if (a.active()) { try { a.draw(t); } catch (_) { a.broken = true; } } }
  }

  function sizeCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h: hgt };
  }

  /* Hero waveform */
  function initWaveHero() {
    const canvas = $('#waveHero');
    if (!canvas) return;
    animators.push({
      active: () => state.page === 'home',
      draw(t) {
        const s = sizeCanvas(canvas); if (!s) return;
        const { ctx, w, h: H } = s;
        ctx.clearRect(0, 0, w, H);
        const n = Math.max(16, Math.floor(w / 8)), gap = w / n;
        const time = reduceMotion ? 0 : t / 1000;
        for (let i = 0; i < n; i++) {
          const a = Math.sin(i * 0.35 + time * 2.2) * 0.5 + 0.5;
          const b = Math.sin(i * 0.13 - time * 1.4 + 1.7) * 0.5 + 0.5;
          const amp = 0.12 + 0.88 * (a * 0.55 + b * 0.45);
          const bh = Math.max(3, amp * H * 0.92);
          ctx.fillStyle = i % 7 === 0 ? colors.accent : colors.ink;
          ctx.globalAlpha = 0.25 + amp * 0.75;
          const x = i * gap + gap * 0.2, bw = gap * 0.6;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, (H - bh) / 2, bw, bh, bw / 2); else ctx.rect(x, (H - bh) / 2, bw, bh);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  /* ---------------------------------------------------------------
     Interactive visualizer (generative sound + analyser)
  --------------------------------------------------------------- */
  const viz = { ctx: null, analyser: null, master: null, data: null, playing: false, timer: null, step: 0, pointerX: -1 };

  function playNote() {
    const ctx = viz.ctx; if (!ctx) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    viz.step++;
    const pick = scale[Math.floor(Math.random() * scale.length)];
    const semis = viz.step % 8 === 0 ? -12 + scale[Math.floor(Math.random() * 4)] : pick;
    const freq = 220 * Math.pow(2, semis / 12);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = viz.step % 8 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
    osc.connect(g); g.connect(viz.master);
    osc.start(now); osc.stop(now + 1.8);
  }
  async function startViz() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('error', 'Audio isn’t supported in this browser.'); return; }
    try {
      if (!viz.ctx) {
        viz.ctx = new AC();
        viz.master = viz.ctx.createGain(); viz.master.gain.value = 0.16;
        viz.analyser = viz.ctx.createAnalyser(); viz.analyser.fftSize = 128; viz.analyser.smoothingTimeConstant = 0.82;
        viz.data = new Uint8Array(viz.analyser.frequencyBinCount);
        viz.master.connect(viz.analyser); viz.analyser.connect(viz.ctx.destination);
      }
      await viz.ctx.resume();
    } catch (_) { toast('error', 'Couldn’t start audio. Check your device’s sound settings.'); return; }
    viz.playing = true;
    playNote(); viz.timer = setInterval(playNote, 520);
    $('#vizToggle').setAttribute('aria-pressed', 'true'); $('#vizLabel').textContent = 'Pause';
  }
  function stopViz() {
    viz.playing = false;
    clearInterval(viz.timer); viz.timer = null;
    const b = $('#vizToggle'); if (b) { b.setAttribute('aria-pressed', 'false'); $('#vizLabel').textContent = 'Play'; }
  }
  function initVisualizer() {
    const canvas = $('#vizCanvas'), btn = $('#vizToggle');
    if (!canvas || !btn) return;
    btn.addEventListener('click', () => (viz.playing ? stopViz() : startViz()));
    const setX = (e) => { const r = canvas.getBoundingClientRect(); viz.pointerX = (e.clientX - r.left) / r.width; };
    canvas.addEventListener('pointermove', setX);
    canvas.addEventListener('pointerdown', setX);
    canvas.addEventListener('pointerleave', () => { viz.pointerX = -1; });
    animators.push({
      active: () => state.page === 'home',
      draw(t) {
        const s = sizeCanvas(canvas); if (!s) return;
        const { ctx, w, h: H } = s;
        ctx.clearRect(0, 0, w, H);
        const n = Math.max(24, Math.min(64, Math.floor(w / 14)));
        const gap = w / n, time = t / 1000;
        if (viz.playing && viz.analyser) viz.analyser.getByteFrequencyData(viz.data);
        for (let i = 0; i < n; i++) {
          let v;
          if (viz.playing && viz.analyser) {
            const idx = Math.floor((i / n) * viz.data.length * 0.75);
            v = viz.data[idx] / 255;
          } else {
            v = 0.1 + 0.08 * (Math.sin(i * 0.5 + (reduceMotion ? 0 : time * 1.6)) + 1);
          }
          if (viz.pointerX >= 0) {
            const d = Math.abs(i / n - viz.pointerX);
            v += Math.max(0, 0.55 - d * 5) * 0.6;
          }
          v = Math.min(1, v);
          const bh = Math.max(4, v * H * 0.94);
          const x = i * gap + gap * 0.18, bw = gap * 0.64;
          ctx.fillStyle = (i / n) > 0.5 ? colors.accent : colors.ink;
          ctx.globalAlpha = 0.35 + v * 0.65;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, (H - bh) / 2, bw, bh, bw / 2); else ctx.rect(x, (H - bh) / 2, bw, bh);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  /* ---------------------------------------------------------------
     Three.js hero (vinyl + floating cards)
  --------------------------------------------------------------- */
  function initThree() {
    const host = $('#three');
    if (!host) return;
    const fallback = () => document.body.classList.add('no-webgl');
    if (!window.THREE) { fallback(); return; }
    const THREE = window.THREE;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (_) { fallback(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.2, 10);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 5, 6); scene.add(key);
    const rim = new THREE.PointLight(0xffd8c8, 0.9, 30); rim.position.set(-5, -2, 5); scene.add(rim);

    const group = new THREE.Group(); scene.add(group);

    // Vinyl record
    const tilt = new THREE.Group(); tilt.rotation.x = 1.12; group.add(tilt);
    const spin = new THREE.Group(); tilt.add(spin);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.08, 96), new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.32, metalness: 0.35 }));
    spin.add(disc);
    const grooveMat = new THREE.MeshBasicMaterial({ color: 0x3b3b40, side: THREE.DoubleSide });
    for (let r = 0.95; r < 1.92; r += 0.11) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 96), grooveMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.042; spin.add(ring);
    }
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.09, 64), new THREE.MeshStandardMaterial({ color: 0xf1d5c6, roughness: 0.6 }));
    spin.add(label);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    spin.add(pin);

    // Floating album cards with generated artwork
    const makeTexture = (c1, c2, glyph) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const x = cv.getContext('2d');
      if (!x) return null;
      const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '120px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(glyph, 128, 136);
      const tex = new THREE.CanvasTexture(cv);
      return tex;
    };
    const cardDefs = [
      { c: ['#e8a58d', '#c9593f'], g: '♪', p: [-2.9, 1.7, 1.2], s: 1.25 },
      { c: ['#9fb1d6', '#5c6fa3'], g: '♫', p: [3.0, -1.5, 1.6], s: 1.1 },
      { c: ['#d9c79a', '#a88f52'], g: '♩', p: [2.6, 2.1, -0.6], s: 0.95 }
    ];
    const cards = cardDefs.map((d, i) => {
      const tex = makeTexture(d.c[0], d.c[1], d.g);
      const mats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      const face = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : new THREE.Color(d.c[1]), roughness: 0.4 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.s, d.s, 0.08), [...mats, face, mats[0]]);
      mesh.position.set(...d.p); mesh.userData = { base: d.p[1], phase: i * 2.1 };
      group.add(mesh); return mesh;
    });

    // Floating notes (small spheres)
    const orbs = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.1, 20, 20), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xc9593f : 0xffffff, roughness: 0.3 }));
      m.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3);
      m.userData = { base: m.position.y, phase: Math.random() * 6 };
      group.add(m); orbs.push(m);
    }

    // Size + interaction
    const resize = () => {
      const w = host.clientWidth, hh = host.clientHeight;
      if (!w || !hh) return;
      renderer.setSize(w, hh, false);
      camera.aspect = w / hh; camera.position.z = w / hh < 0.9 ? 12.5 : 10;
      camera.updateProjectionMatrix();
    };
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host); else window.addEventListener('resize', resize);

    const target = { x: 0, y: 0 };
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      target.y = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.9;
      target.x = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.5;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    let scrollY = 0;
    window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

    let last = performance.now();
    const render = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      if (!reduceMotion) {
        spin.rotation.y += dt * 0.9;
        cards.forEach((c) => { c.position.y = c.userData.base + Math.sin(t * 0.9 + c.userData.phase) * 0.22; c.rotation.y = Math.sin(t * 0.6 + c.userData.phase) * 0.35; c.rotation.x = Math.cos(t * 0.5 + c.userData.phase) * 0.15; });
        orbs.forEach((o) => { o.position.y = o.userData.base + Math.sin(t * 0.8 + o.userData.phase) * 0.3; });
      }
      group.rotation.y = lerp(group.rotation.y, target.y, 0.06);
      group.rotation.x = lerp(group.rotation.x, target.x, 0.06);
      group.position.y = lerp(group.position.y, scrollY * 0.002, 0.08);   // subtle parallax
      renderer.render(scene, camera);
    };
    animators.push({ active: () => state.page === 'home', draw: render });
  }

  /* ---------------------------------------------------------------
     Public content: profile, socials, featured
  --------------------------------------------------------------- */
  function normalizeProfile(p) {
    const out = Object.assign({}, p);
    if (typeof out.genres === 'string') out.genres = out.genres.split(',').map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(out.genres)) out.genres = [];
    return out;
  }

  function applyProfile() {
    const p = normalizeProfile(state.settings.profile);
    const name = p.siteName || 'Your Name';
    $('#brandName').textContent = name;
    $('#brandMark').textContent = (p.logoText || '♪').slice(0, 2);
    $('#footName').textContent = name;
    $('#welcomeMsg').textContent = p.welcome || `Welcome to ${name}’s music recommendation platform.`;
    $('#aboutName').textContent = p.aboutName || name;
    document.title = `${TITLES[state.page]} · ${name}`;

    const av = $('#aboutAvatar'); av.replaceChildren();
    const avatarUrl = safeUrl(p.avatarUrl);
    if (avatarUrl) {
      const img = h('img', { src: avatarUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { av.replaceChildren(document.createTextNode(((p.aboutName || name).trim()[0] || '♪').toUpperCase())); });
      av.append(img);
    } else {
      av.textContent = ((p.aboutName || name).trim()[0] || '♪').toUpperCase();
    }

    const text = $('#aboutText'); text.replaceChildren();
    String(p.aboutText || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).forEach((para) => text.append(h('p', { text: para })));
    const gen = $('#aboutGenres'); gen.replaceChildren();
    p.genres.forEach((g) => gen.append(h('li', { text: g })));
    const why = $('#aboutWhy'); why.textContent = p.why || ''; why.hidden = !p.why;
  }

  function resolveSocial(platform, data) {
    const d = data || {};
    const username = String(d.username || '').trim().replace(/^@/, '');
    let url = safeUrl(d.url);
    if (!url && username && platform.base) url = safeUrl(platform.base + encodeURIComponent(username));
    const shown = username ? (platform.at ? '@' + username : username) : '';
    return { url, shown };
  }

  function applySocials() {
    const grid = $('#socialGrid'); grid.replaceChildren();
    PLATFORMS.forEach((pf) => {
      const { url, shown } = resolveSocial(pf, state.settings.socials[pf.key]);
      const inner = [
        h('span', { class: 'ico' }, svgIcon(pf.icon)),
        h('span', { class: 'txt' }, h('strong', { text: pf.name }), h('span', { text: url ? (shown || url.replace(/^https?:\/\/(www\.)?/, '')) : 'Not linked yet' })),
      ];
      if (url) {
        inner.push(h('span', { class: 'go' }, svgIcon('<path d="M7 17L17 7M8 7h9v9"/>', 20)));
        const a = h('a', { class: 'social-card tilt reveal', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${pf.name}${shown ? ': ' + shown : ''} (opens in a new tab)` }, inner);
        grid.append(a);
      } else {
        grid.append(h('div', { class: 'social-card is-off reveal', 'aria-disabled': 'true' }, inner));
      }
    });
    initTilts(grid); observeReveals();
  }

  async function loadSettings() {
    if (!sb) { applyProfile(); applySocials(); return; }
    try {
      const { data, error } = await sb.from('site_settings').select('key,value');
      if (error) throw error;
      (data || []).forEach((row) => {
        if (row.key === 'profile' && row.value && typeof row.value === 'object') state.settings.profile = Object.assign({}, state.settings.profile, row.value);
        if (row.key === 'socials' && row.value && typeof row.value === 'object') state.settings.socials = Object.assign({}, state.settings.socials, row.value);
      });
    } catch (_) { /* fall back to config.js defaults */ }
    applyProfile(); applySocials();
  }

  /* Featured */
  async function loadFeatured() {
    if (!sb) { state.featured = []; state.featuredLoaded = true; return; }
    try {
      const { data, error } = await sb.from('featured').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      state.featured = data || [];
    } catch (_) {
      state.featured = [];
      toast('error', 'Couldn’t load featured music. Please try again later.');
    }
    state.featuredLoaded = true;
  }
  async function ensureFeatured() {
    if (state.featuredLoaded) { renderFeatured(); return; }
    $('#featContent').replaceChildren(h('div', { class: 'song-grid' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' })));
    await loadFeatured();
    renderFeatured();
  }

  function listenLabel(url) {
    try {
      const host = new URL(url).hostname;
      if (host.includes('spotify')) return 'Listen on Spotify';
      if (host.includes('youtube') || host.includes('youtu.be')) return 'Watch on YouTube';
      if (host.includes('apple')) return 'Listen on Apple Music';
      if (host.includes('soundcloud')) return 'Listen on SoundCloud';
    } catch (_) { /* ignore */ }
    return 'Listen now';
  }

  function songCard(s, big = false) {
    const hue = hueOf(s.title + s.artist);
    const art = h('div', { class: 'art', style: `background:linear-gradient(135deg,hsl(${hue} 55% 72%),hsl(${(hue + 50) % 360} 50% 52%))` }, (s.title || '♪').trim()[0]?.toUpperCase() || '♪');
    const artUrl = safeUrl(s.artwork_url);
    if (artUrl) {
      const img = h('img', { src: artUrl, alt: `Album artwork for ${s.title} by ${s.artist}`, loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => img.remove());
      art.append(img);
    }
    const link = safeUrl(s.link);
    const body = h('div', { class: 'song-body' },
      h('div', { class: 'badges' }, s.genre ? h('span', { class: 'badge', text: s.genre }) : null, s.mood ? h('span', { class: 'badge mood', text: s.mood }) : null),
      h('h4', { text: s.title }),
      h('p', { class: 'song-artist', text: s.artist }),
      s.description ? h('p', { class: 'song-desc', text: s.description }) : null,
      link ? h('a', { class: 'btn btn-primary listen', href: link, target: '_blank', rel: 'noopener noreferrer' }, listenLabel(link), h('span', { class: 'sr-only' }, ' (opens in a new tab)')) : null
    );
    const card = h('article', { class: `song-card tilt reveal${big ? ' big' : ''}` }, art, body);
    attachTilt(card, big ? 4 : 9);
    return card;
  }

  function renderTabs() {
    const tabs = $('#featTabs'); tabs.replaceChildren();
    const defs = [{ key: 'all', label: 'All' }, ...CATEGORIES, { key: 'recent', label: 'Recently Added' }];
    defs.forEach((d) => {
      const b = h('button', { type: 'button', role: 'tab', class: `tab${state.featTab === d.key ? ' is-active' : ''}`, 'aria-selected': String(state.featTab === d.key), text: d.label,
        onclick: () => { state.featTab = d.key; renderFeatured(); } });
      tabs.append(b);
    });
  }

  function renderFeatured() {
    renderTabs();
    const box = $('#featContent'); box.replaceChildren();
    const all = state.featured;
    if (!all.length) {
      box.append(h('div', { class: 'empty glass' }, h('h3', { text: 'Nothing featured yet' }), h('p', { text: sb ? 'New recommendations are on the way. Request a song and it might land here.' : 'Featured music will appear here once the site’s database is connected.' }),
        h('div', { class: 'cta-row center' }, h('a', { class: 'btn btn-primary', href: '#request' }, 'Request a Song'))));
      return;
    }
    const section = (title, list, bigFirst) => {
      const grid = h('div', { class: 'song-grid' });
      list.forEach((s, i) => grid.append(songCard(s, bigFirst && i === 0)));
      return h('section', { class: 'feat-section' }, h('h3', { text: title }), grid);
    };
    const recent = [...all].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
    if (state.featTab === 'all') {
      CATEGORIES.forEach((c) => { const l = all.filter((s) => s.category === c.key); if (l.length) box.append(section(c.label, l, c.key === 'weekly')); });
      box.append(section('Recently Added', recent.slice(0, 6), false));
    } else if (state.featTab === 'recent') {
      box.append(section('Recently Added', recent, false));
    } else {
      const c = CATEGORIES.find((x) => x.key === state.featTab);
      const l = all.filter((s) => s.category === state.featTab);
      if (l.length) box.append(section(c.label, l, c.key === 'weekly'));
      else box.append(h('div', { class: 'empty glass' }, h('h3', { text: 'Nothing here yet' }), h('p', { text: 'Check back soon. This section is being curated.' })));
    }
    observeReveals();
  }

  /* ---------------------------------------------------------------
     Request form
  --------------------------------------------------------------- */
  function initRequestForm() {
    const form = $('#requestForm'), btn = $('#submitBtn');
    const chips = $('#moodChips');
    MOODS.forEach((m, i) => {
      const id = `mood-${i}`;
      chips.append(h('label', { class: 'chip', for: id }, h('input', { type: 'radio', name: 'mood', value: m, id }), h('span', { text: m })));
    });
    chips.append(h('button', { type: 'button', class: 'tab', text: 'Clear', 'aria-label': 'Clear mood selection', onclick: () => $$('input[name="mood"]', chips).forEach((r) => { r.checked = false; }) }));

    if (!sb) { $('#requestNotice').hidden = false; }

    const setErr = (name, msg) => {
      const el = $(`#err-${name}`), input = form.elements[name];
      if (el) el.textContent = msg || '';
      if (input && input.setAttribute) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    };
    const setState = (st) => { btn.dataset.state = st; btn.disabled = st === 'loading' || st === 'success'; };

    // live validation clearing
    form.addEventListener('input', (e) => { if (e.target.name) setErr(e.target.name, ''); if (btn.dataset.state === 'error') setState('idle'); });

    function validate(v) {
      let ok = true; const bad = (n, m) => { setErr(n, m); ok = false; };
      ['name', 'email', 'song_name', 'link', 'looking_for'].forEach((n) => setErr(n, ''));
      if (!v.name) bad('name', 'Please tell me your name or username.');
      if (v.email && !isEmail(v.email)) bad('email', 'That email doesn’t look right.');
      if (v.link && !safeUrl(v.link)) bad('link', 'Please enter a full link starting with https://');
      if (!v.song_name && !v.looking_for) { bad('song_name', 'Add a song name, or describe what you’re looking for below.'); bad('looking_for', 'Describe what you’re after, or add a song name above.'); }
      if (!ok) { const first = $('[aria-invalid="true"]', form); if (first) first.focus(); }
      return ok;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.dataset.state === 'loading') return;
      const fd = new FormData(form);
      if (clean(fd.get('website'))) { showConfirm(clean(fd.get('name')) || ''); return; }   // honeypot: silently accept bots
      const v = {
        name: clean(fd.get('name')), email: clean(fd.get('email')), song_name: clean(fd.get('song_name')), artist: clean(fd.get('artist')),
        genre: clean(fd.get('genre')), mood: clean(fd.get('mood')), language: clean(fd.get('language')),
        link: clean(fd.get('link')), looking_for: clean(fd.get('looking_for')), message: clean(fd.get('message'))
      };
      if (!validate(v)) { toast('error', 'Please fix the highlighted fields.'); return; }
      if (!sb) { setState('error'); toast('error', 'Requests aren’t connected yet. The site owner needs to finish setup.'); setTimeout(() => setState('idle'), 2500); return; }
      let last = 0; try { last = Number(localStorage.getItem('lastRequestAt')) || 0; } catch (_) { /* ignore */ }
      if (Date.now() - last < 15000) { toast('error', 'Please wait a few seconds before sending another request.'); return; }

      setState('loading');
      try {
        const { error } = await sb.from('requests').insert([v]);
        if (error) throw error;
        try { localStorage.setItem('lastRequestAt', String(Date.now())); } catch (_) { /* ignore */ }
        setState('success'); toast('success', 'Request sent!');
        setTimeout(() => showConfirm(v.name), 700);
      } catch (_) {
        setState('error'); toast('error', 'Something went wrong while sending. Please try again.');
        setTimeout(() => { if (btn.dataset.state === 'error') setState('idle'); }, 3000);
      }
    });

    function showConfirm(name) {
      $('#formCard').hidden = true;
      $('#confirmText').textContent = `Thank you${name ? ', ' + name : ''}! I’ll listen and come back with something good.`;
      const c = $('#confirmCard'); c.hidden = false; c.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    $('#anotherBtn').addEventListener('click', () => {
      form.reset(); setState('idle');
      $('#confirmCard').hidden = true; $('#formCard').hidden = false;
      const n = $('#f-name'); if (n) n.focus();
    });
  }

  /* ---------------------------------------------------------------
     Admin dashboard
  --------------------------------------------------------------- */
  function adminShowGate(msg = '') {
    $('#adminGate').hidden = false; $('#adminApp').hidden = true; state.adminReady = false;
    $('#adminSetupNotice').hidden = !!sb;
    $('#loginForm').hidden = !sb;
    $('#loginError').textContent = msg;
  }
  async function adminEnter() {
    if (!sb) { adminShowGate(); return; }
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) await adminVerify(data.session); else adminShowGate();
    } catch (_) { adminShowGate('Couldn’t reach the server. Check your connection.'); }
  }
  async function adminVerify(session) {
    const { data, error } = await sb.rpc('is_admin');
    if (error || data !== true) {
      await sb.auth.signOut();
      adminShowGate(error ? 'Couldn’t verify admin access. Is supabase-setup.sql installed?' : 'This account isn’t authorised as admin.');
      return;
    }
    $('#adminGate').hidden = true; $('#adminApp').hidden = false; state.adminReady = true;
    $('#adminUser').textContent = `Signed in as ${session.user.email}`;
    buildAdminStatic();
    await Promise.all([loadRequests(), loadFeatured().then(renderFeatAdmin)]);
    fillSettingsForm();
  }

  function initAdmin() {
    const form = $('#loginForm'), btn = $('#loginBtn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!sb) return;
      const email = $('#l-email').value.trim(), pass = $('#l-pass').value;
      const err = $('#loginError'); err.textContent = '';
      if (!isEmail(email) || !pass) { err.textContent = 'Enter your email and password.'; return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        $('#l-pass').value = '';
        await adminVerify(data.session);
      } catch (_) { err.textContent = 'Incorrect email or password.'; }
      finally { btn.disabled = false; btn.textContent = 'Sign in'; }
    });
    $('#logoutBtn').addEventListener('click', async () => { if (sb) await sb.auth.signOut(); state.requests = []; state.selected.clear(); adminShowGate(); toast('success', 'Signed out'); });
    $('#refreshBtn').addEventListener('click', async () => { await Promise.all([loadRequests(), loadFeatured().then(renderFeatAdmin)]); toast('success', 'Refreshed'); });
    if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT' && state.page === 'admin') adminShowGate(); });

    // Tabs
    $('#adminTabs').addEventListener('click', (e) => {
      const t = e.target.closest('[data-admintab]'); if (!t) return;
      $$('[data-admintab]').forEach((b) => { const on = b === t; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
      ['requests', 'featured', 'settings'].forEach((k) => { $(`#panel-${k}`).hidden = k !== t.dataset.admintab; });
    });

    // Request filters
    ['reqSearch', 'reqStatus', 'reqMood', 'reqSort'].forEach((id) => $(`#${id}`).addEventListener('input', renderRequests));
    $('#selectAll').addEventListener('change', (e) => {
      const ids = filteredRequests().map((r) => r.id);
      if (e.target.checked) ids.forEach((i) => state.selected.add(i)); else ids.forEach((i) => state.selected.delete(i));
      renderRequests();
    });
    $('#exportBtn').addEventListener('click', exportCsv);

    // Edit request dialog
    $('#reqEditForm').addEventListener('submit', saveRequestEdit);
    $('#featForm').addEventListener('submit', saveFeatured);
    $('#addFeatBtn').addEventListener('click', () => openFeatDialog());
    $('#findArtBtn').addEventListener('click', findArtwork);
    $('#x-art').addEventListener('input', updateArtPreview);
    $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(b.closest('dialog'))));
    $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); }));  // click backdrop
    $('#settingsForm').addEventListener('submit', saveSettings);
  }

  let adminBuilt = false;
  function buildAdminStatic() {
    if (adminBuilt) return; adminBuilt = true;
    const moodFilter = $('#reqMood');
    MOODS.forEach((m) => moodFilter.append(h('option', { value: m, text: m })));
    [$('#e-mood'), $('#x-mood')].forEach((sel) => { sel.append(h('option', { value: '', text: '—' })); MOODS.forEach((m) => sel.append(h('option', { value: m, text: m }))); });
    const ed = $('#socialEditor');
    PLATFORMS.forEach((pf) => {
      ed.append(h('div', { class: 'social-row' },
        h('strong', { text: pf.name }),
        h('input', { type: 'text', name: `${pf.key}__username`, placeholder: pf.key === 'discord' ? 'Display name (optional)' : 'username', maxlength: '60', 'aria-label': `${pf.name} username` }),
        h('input', { type: 'url', name: `${pf.key}__url`, placeholder: pf.base ? `${pf.base}… (optional)` : 'https://discord.gg/… (profile or invite URL)', maxlength: '500', 'aria-label': `${pf.name} URL` })));
    });
  }

  /* ---- Requests ---- */
  async function loadRequests() {
    if (!sb) return;
    try {
      let all = [], from = 0;
      for (;;) {
        const { data, error } = await sb.from('requests').select('*').order('created_at', { ascending: false }).range(from, from + 999);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      state.requests = all;
    } catch (_) { toast('error', 'Couldn’t load requests. Are you signed in as admin?'); }
    renderStats(); renderRequests();
  }

  function renderStats() {
    const box = $('#adminStats'); box.replaceChildren();
    const count = (s) => state.requests.filter((r) => r.status === s).length;
    [['Total', state.requests.length], ['Pending', count('pending')], ['Reviewed', count('reviewed')], ['Accepted', count('accepted')], ['Completed', count('completed')]]
      .forEach(([l, n]) => box.append(h('div', { class: 'stat' }, h('b', { text: String(n) }), h('span', { text: l }))));
  }

  function filteredRequests() {
    const q = $('#reqSearch').value.trim().toLowerCase();
    const st = $('#reqStatus').value, mood = $('#reqMood').value, sort = $('#reqSort').value;
    let list = state.requests.filter((r) => {
      if (st && r.status !== st) return false;
      if (mood && r.mood !== mood) return false;
      if (!q) return true;
      return [r.name, r.email, r.song_name, r.artist, r.genre, r.mood, r.language, r.link, r.looking_for, r.message, r.admin_notes].some((f) => (f || '').toLowerCase().includes(q));
    });
    list.sort((a, b) => (sort === 'old' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at)));
    return list;
  }

  function requestDetails(r) {
    return [
      r.song_name ? `Song: ${r.song_name}` : null, r.artist ? `Artist: ${r.artist}` : null, r.genre ? `Genre: ${r.genre}` : null,
      r.mood ? `Mood: ${r.mood}` : null, r.language ? `Language: ${r.language}` : null, r.link ? `Link: ${r.link}` : null,
      r.looking_for ? `Looking for: ${r.looking_for}` : null, `Requested by: ${r.name}${r.email ? ' <' + r.email + '>' : ''}`
    ].filter(Boolean).join('\n');
  }

  function requestCard(r) {
    const link = safeUrl(r.link);
    const title = r.song_name ? `${r.song_name}${r.artist ? ' — ' + r.artist : ''}` : (r.artist || 'Open request');
    const statusSel = h('select', { 'aria-label': `Status for request from ${r.name}`, onchange: (e) => updateRequest(r.id, { status: e.target.value }, 'Status updated') },
      STATUSES.map((s) => h('option', { value: s, text: s[0].toUpperCase() + s.slice(1), selected: s === r.status })));
    const chk = h('input', { type: 'checkbox', 'aria-label': `Select request from ${r.name}`, checked: state.selected.has(r.id),
      onchange: (e) => { if (e.target.checked) state.selected.add(r.id); else state.selected.delete(r.id); } });
    return h('article', { class: 'req-card' },
      h('div', { class: 'req-top' }, chk,
        h('div', { class: 'req-title' }, h('h4', { text: title }), h('small', { text: `${r.name} · ${fmtDate(r.created_at)}` })),
        h('span', { class: `status ${r.status}`, text: r.status })),
      h('div', { class: 'req-body' },
        r.email && isEmail(r.email) ? h('div', {}, 'Email: ', h('a', { href: `mailto:${r.email}`, text: r.email })) : null,
        [r.genre, r.mood, r.language].filter(Boolean).length ? h('div', { class: 'badges' }, [r.genre, r.mood, r.language].filter(Boolean).map((x) => h('span', { class: 'badge', text: x }))) : null,
        link ? h('div', {}, 'Link: ', h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: link })) : null,
        r.looking_for ? h('div', {}, h('strong', { text: 'Looking for: ' }), r.looking_for) : null,
        r.message ? h('q', { text: r.message }) : null),
      r.admin_notes ? h('div', { class: 'req-notes' }, h('strong', { text: 'Private note: ' }), r.admin_notes) : null,
      h('div', { class: 'req-actions' }, statusSel,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openRequestDialog(r.id) }, 'Edit / Notes'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => copyText(requestDetails(r)) }, 'Copy details'),
        link ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => copyText(link) }, 'Copy link') : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openFeatDialog(null, r) }, '★ Add to Featured'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => deleteRequest(r) }, 'Delete')));
  }

  function renderRequests() {
    const list = filteredRequests();
    $('#reqCount').textContent = `${list.length} of ${state.requests.length} shown${state.selected.size ? ` · ${state.selected.size} selected` : ''}`;
    const box = $('#reqList'); box.replaceChildren();
    $('#selectAll').checked = list.length > 0 && list.every((r) => state.selected.has(r.id));
    if (!list.length) {
      box.append(h('div', { class: 'empty glass' }, h('h3', { text: state.requests.length ? 'No matches' : 'No requests yet' }), h('p', { text: state.requests.length ? 'Try a different search or filter.' : 'New submissions from your visitors will appear here.' })));
      return;
    }
    list.forEach((r) => box.append(requestCard(r)));
  }

  async function updateRequest(id, patch, okMsg = 'Saved') {
    try {
      const { data, error } = await sb.from('requests').update(patch).eq('id', id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('not permitted');
      const i = state.requests.findIndex((r) => r.id === id);
      if (i >= 0) state.requests[i] = data[0];
      renderStats(); renderRequests(); toast('success', okMsg);
      return true;
    } catch (_) { toast('error', 'Couldn’t save the change. Check your connection and admin access.'); renderRequests(); return false; }
  }

  async function deleteRequest(r) {
    const ok = await confirmDialog('Delete this request?', `The request from ${r.name}${r.song_name ? ' for “' + r.song_name + '”' : ''} will be permanently removed.`);
    if (!ok) return;
    try {
      const { data, error } = await sb.from('requests').delete().eq('id', r.id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('not permitted');
      state.requests = state.requests.filter((x) => x.id !== r.id); state.selected.delete(r.id);
      renderStats(); renderRequests(); toast('success', 'Request deleted');
    } catch (_) { toast('error', 'Couldn’t delete that request.'); }
  }

  function openRequestDialog(id) {
    const r = state.requests.find((x) => x.id === id); if (!r) return;
    const f = $('#reqEditForm');
    ['id', 'name', 'email', 'song_name', 'artist', 'genre', 'mood', 'language', 'status', 'link', 'looking_for', 'message', 'admin_notes'].forEach((k) => { if (f.elements[k]) f.elements[k].value = r[k] ?? ''; });
    $('#reqEditError').textContent = '';
    openDialog($('#reqDialog'));
  }
  async function saveRequestEdit(e) {
    e.preventDefault();
    const f = e.target, fd = new FormData(f), err = $('#reqEditError'); err.textContent = '';
    const patch = { name: clean(fd.get('name')), email: clean(fd.get('email')), song_name: clean(fd.get('song_name')), artist: clean(fd.get('artist')), genre: clean(fd.get('genre')),
      mood: clean(fd.get('mood')), language: clean(fd.get('language')), status: fd.get('status'), link: clean(fd.get('link')), looking_for: clean(fd.get('looking_for')),
      message: clean(fd.get('message')), admin_notes: clean(fd.get('admin_notes')) };
    if (!patch.name) { err.textContent = 'Name can’t be empty.'; return; }
    if (patch.email && !isEmail(patch.email)) { err.textContent = 'That email doesn’t look right.'; return; }
    if (patch.link && !safeUrl(patch.link)) { err.textContent = 'Link must start with http:// or https://'; return; }
    const btn = $('#reqSaveBtn'); btn.disabled = true;
    const ok = await updateRequest(fd.get('id'), patch, 'Request updated');
    btn.disabled = false;
    if (ok) closeDialog($('#reqDialog')); else err.textContent = 'Couldn’t save. Please try again.';
  }

  function exportCsv() {
    const list = state.selected.size ? state.requests.filter((r) => state.selected.has(r.id)) : filteredRequests();
    if (!list.length) { toast('error', 'There’s nothing to export.'); return; }
    const cols = [['Submitted', 'created_at'], ['Name', 'name'], ['Email', 'email'], ['Song', 'song_name'], ['Artist', 'artist'], ['Genre', 'genre'], ['Mood', 'mood'], ['Language', 'language'],
      ['Link', 'link'], ['Looking for', 'looking_for'], ['Message', 'message'], ['Status', 'status'], ['Admin notes', 'admin_notes']];
    const esc = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // neutralise spreadsheet formulas
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [cols.map((c) => c[0]).join(','), ...list.map((r) => cols.map(([, k]) => esc(r[k])).join(','))];
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `music-requests-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('success', `Exported ${list.length} request${list.length === 1 ? '' : 's'}`);
  }

  /* ---- Featured admin ---- */
  function renderFeatAdmin() {
    const box = $('#featList'); box.replaceChildren();
    if (!state.featured.length) { box.append(h('div', { class: 'empty glass' }, h('h3', { text: 'No featured songs yet' }), h('p', { text: 'Add one with the button above, or use “Add to Featured” on a request.' }))); return; }
    state.featured.forEach((s) => {
      const cat = (CATEGORIES.find((c) => c.key === s.category) || {}).label || s.category;
      box.append(h('article', { class: 'req-card' },
        h('div', { class: 'req-top' }, h('div', { class: 'req-title' }, h('h4', { text: `${s.title} — ${s.artist}` }), h('small', { text: `${cat} · order ${s.sort_order}` })),
          h('span', { class: 'status reviewed', text: cat })),
        s.description ? h('p', { class: 'req-body', text: s.description }) : null,
        h('div', { class: 'req-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openFeatDialog(s) }, 'Edit'),
          safeUrl(s.link) ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => copyText(safeUrl(s.link)) }, 'Copy link') : null,
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => deleteFeatured(s) }, 'Remove'))));
    });
  }

  function openFeatDialog(song = null, fromRequest = null) {
    const f = $('#featForm'); f.reset(); $('#featError').textContent = '';
    const v = song || (fromRequest ? { title: fromRequest.song_name || '', artist: fromRequest.artist || '', genre: fromRequest.genre || '', mood: fromRequest.mood || '', link: fromRequest.link || '', category: 'requested', sort_order: 0, source_request_id: fromRequest.id } : { category: 'favorites', sort_order: 0 });
    ['id', 'title', 'artist', 'genre', 'mood', 'category', 'sort_order', 'link', 'artwork_url', 'description', 'source_request_id'].forEach((k) => { if (f.elements[k]) f.elements[k].value = v[k] ?? ''; });
    if (!f.elements.category.value) f.elements.category.value = 'favorites';
    $('#featDialogTitle').textContent = song ? 'Edit featured song' : 'Add featured song';
    updateArtPreview(); openDialog($('#featDialog'));
  }

  function updateArtPreview() {
    const img = $('#artPreview'), url = safeUrl($('#x-art').value);
    if (url) { img.src = url; img.hidden = false; img.onerror = () => { img.hidden = true; }; } else { img.hidden = true; img.removeAttribute('src'); }
  }

  async function findArtwork() {
    const t = $('#x-title').value.trim(), a = $('#x-artist').value.trim();
    if (!t) { $('#featError').textContent = 'Enter a title (and artist) first.'; return; }
    const btn = $('#findArtBtn'); btn.disabled = true; btn.textContent = 'Searching…'; $('#featError').textContent = '';
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${t} ${a}`.trim())}&entity=song&limit=1`);
      if (!res.ok) throw new Error('bad status');
      const json = await res.json();
      const art = json.results && json.results[0] && json.results[0].artworkUrl100;
      if (!art) { $('#featError').textContent = 'No artwork found. Paste an image URL instead.'; return; }
      $('#x-art').value = art.replace('100x100bb', '600x600bb'); updateArtPreview(); toast('success', 'Artwork found');
    } catch (_) { $('#featError').textContent = 'Couldn’t look up artwork automatically. Paste an image URL instead.'; }
    finally { btn.disabled = false; btn.textContent = 'Find artwork'; }
  }

  async function saveFeatured(e) {
    e.preventDefault();
    const fd = new FormData(e.target), err = $('#featError'); err.textContent = '';
    const row = { title: clean(fd.get('title')), artist: clean(fd.get('artist')), genre: clean(fd.get('genre')), mood: clean(fd.get('mood')), category: fd.get('category'),
      sort_order: parseInt(fd.get('sort_order'), 10) || 0, link: clean(fd.get('link')), artwork_url: clean(fd.get('artwork_url')), description: clean(fd.get('description')) };
    const src = clean(fd.get('source_request_id')); if (src) row.source_request_id = src;
    if (!row.title || !row.artist) { err.textContent = 'Title and artist are required.'; return; }
    if (row.link && !safeUrl(row.link)) { err.textContent = 'Listening link must start with http:// or https://'; return; }
    if (row.artwork_url && !safeUrl(row.artwork_url)) { err.textContent = 'Artwork URL must start with http:// or https://'; return; }
    const id = clean(fd.get('id')), btn = $('#featSaveBtn'); btn.disabled = true;
    try {
      const q = id ? sb.from('featured').update(row).eq('id', id).select() : sb.from('featured').insert([row]).select();
      const { data, error } = await q;
      if (error) throw error;
      if (!data || !data.length) throw new Error('not permitted');
      await loadFeatured(); renderFeatAdmin(); if (state.page === 'featured') renderFeatured();
      closeDialog($('#featDialog')); toast('success', id ? 'Featured song updated' : 'Added to Featured');
    } catch (_) { err.textContent = 'Couldn’t save. Check your connection and admin access.'; }
    finally { btn.disabled = false; }
  }

  async function deleteFeatured(s) {
    if (!(await confirmDialog('Remove from Featured?', `“${s.title}” will no longer appear on the Featured page.`, 'Remove'))) return;
    try {
      const { data, error } = await sb.from('featured').delete().eq('id', s.id).select();
      if (error) throw error;
      if (!data || !data.length) throw new Error('not permitted');
      state.featured = state.featured.filter((x) => x.id !== s.id); renderFeatAdmin(); toast('success', 'Removed');
    } catch (_) { toast('error', 'Couldn’t remove that song.'); }
  }

  /* ---- Profile & socials ---- */
  function fillSettingsForm() {
    const f = $('#settingsForm'), p = normalizeProfile(state.settings.profile);
    ['siteName', 'logoText', 'welcome', 'aboutName', 'avatarUrl', 'aboutText', 'why'].forEach((k) => { if (f.elements[k]) f.elements[k].value = p[k] || ''; });
    f.elements.genres.value = p.genres.join(', ');
    PLATFORMS.forEach((pf) => {
      const d = state.settings.socials[pf.key] || {};
      f.elements[`${pf.key}__username`].value = d.username || '';
      f.elements[`${pf.key}__url`].value = d.url || '';
    });
  }
  async function saveSettings(e) {
    e.preventDefault();
    const f = e.target, err = $('#settingsError'); err.textContent = '';
    const profile = {
      siteName: f.elements.siteName.value.trim(), logoText: f.elements.logoText.value.trim() || '♪', welcome: f.elements.welcome.value.trim(),
      aboutName: f.elements.aboutName.value.trim(), avatarUrl: f.elements.avatarUrl.value.trim(), aboutText: f.elements.aboutText.value.trim(),
      genres: f.elements.genres.value.split(',').map((s) => s.trim()).filter(Boolean), why: f.elements.why.value.trim()
    };
    if (profile.avatarUrl && !safeUrl(profile.avatarUrl)) { err.textContent = 'Profile picture URL must start with http:// or https://'; return; }
    const socials = {};
    for (const pf of PLATFORMS) {
      const username = f.elements[`${pf.key}__username`].value.trim(), url = f.elements[`${pf.key}__url`].value.trim();
      if (url && !safeUrl(url)) { err.textContent = `${pf.name}: URL must start with http:// or https://`; return; }
      socials[pf.key] = { username, url };
    }
    const btn = $('#saveSettingsBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { error } = await sb.from('site_settings').upsert([{ key: 'profile', value: profile }, { key: 'socials', value: socials }], { onConflict: 'key' });
      if (error) throw error;
      state.settings.profile = Object.assign({}, state.settings.profile, profile); state.settings.socials = socials;
      applyProfile(); applySocials(); toast('success', 'Profile & socials saved');
    } catch (_) { err.textContent = 'Couldn’t save. Check your connection and admin access.'; }
    finally { btn.disabled = false; btn.textContent = 'Save changes'; }
  }

  /* ---------------------------------------------------------------
     Init
  --------------------------------------------------------------- */
  function hideLoader() { const l = $('#loader'); if (l) { l.classList.add('done'); setTimeout(() => l.remove(), 700); } }

  function init() {
    $('#footYear').textContent = new Date().getFullYear();
    initTheme(); initNav(); initRequestForm(); initAdmin(); initVisualizer(); initWaveHero();
    try { initThree(); } catch (_) { document.body.classList.add('no-webgl'); }
    applyProfile(); applySocials(); initTilts(); observeReveals();
    route();
    requestAnimationFrame(loop);
    loadSettings();
    setTimeout(hideLoader, reduceMotion ? 0 : 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
