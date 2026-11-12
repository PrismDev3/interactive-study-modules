/**
 * The Daily Bugle photo archive (file kept as MountChoctaw.js): a newspaper page of photos,
 * four rows of six at a time; click one to view it whole, paged a row at a time by the two yellow
 * arrows on the right — click them with the cursor, or use the arrow keys.
 */
import { MOUNT_CHOCTAW_IMAGES } from './MountChoctawImages.js?v=52';

const COLS = 6;
const ROWS = 4;
const IMG_DIR = 'assets/mount-choctaw/';

// The Links tab: press a card, the link opens in a new tab.
// Every card carries a hand-written name; the URLs are CDN paths nobody should have to read.

// Icons are drawn, not loaded: a two-colour tile from the name plus its initials. The links
// themselves are whole pages, so a shrunk copy of one just read as a dark rectangle.
const ICON_COLORS = ['#d01012', '#0a57c2', '#f5c518', '#237841', '#36aebf', '#f2701e',
                     '#7a3e9d', '#e8469a', '#4c9e3f', '#1f8f9e', '#b5472a', '#2f6d3a'];

function iconStyle(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = ICON_COLORS[h % ICON_COLORS.length];
  const b = ICON_COLORS[(h >>> 7) % ICON_COLORS.length];
  const n = parseInt(a.slice(1), 16);
  const light = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150;
  return `--c1:${a};--c2:${b};--fg:${light ? '#1a1200' : '#fff8ea'}`;
}

// One letter, big: a two-letter mash like "C0" or "GN" read as noise, not a logo.
function monogram(name) {
  const letters = name.replace(/[^A-Za-z0-9]/g, '');
  return (letters.slice(0, 1) || '?').toUpperCase();
}

const LINKS = [
  // The Arctic pair: both links open the same game, so they are Arctic 1 and Arctic 2.
  { name: 'Arctic 1', url: 'https://cdn.jsdelivr.net/gh/lolration/svg/arctic.svg' },
  { name: 'Arctic 2', url: 'https://cdn.jsdelivr.net/gh/apple-bonkers/not-games@2f21dde998e0323646f315adb04dfc5889c506a3/arctic.svg' },
  { name: 'Zaka', url: 'https://cdn.jsdelivr.net/gh/Aglet-0/zaka-upvvue@main/zaka-1-dxbq.svg' },
  { name: 'Zanez Arcade 1', url: 'https://cdn.jsdelivr.net/gh/Aglet-0/niche-ldrgay@main/tuff-1-nsib.svg' },
  { name: 'Flux 1', url: 'https://cdn.jsdelivr.net/gh/dorianhagar506-coder/fluximback-p33sjz@main/index-1-81bp.svg' },
  { name: 'C00lkidisc00l', url: 'https://cdn.jsdelivr.net/gh/dorianhagar506-coder/c00lkidisc00l-ckn4pu@main/frozen-1-ypp7.svg' },
  { name: 'Dogeub', url: 'https://cdn.jsdelivr.net/gh/rykcbaoolNEW/dogeub/index.svg?id=gegZneXJ53RPUT8oGC84bYV69bZF4j4G' },
  { name: 'Windows 10', url: 'https://cdn.jsdelivr.net/gh/googleaccountuser/myfirstrepo@main/windows10background.svg' },
  { name: 'Cherri', url: 'https://cdn.jsdelivr.net/gh/cherriunblocked/svg@main/index.svg' },
  { name: 'Catclass', url: 'https://cdn.jsdelivr.net/gh/Greylinks123/catclass@main/loadcat49.svg' },
  { name: 'Classroom', url: 'https://cdn.jsdelivr.net/gh/task4z/classroom-15x@main/images/0cf82c3f96/catclass/logo.svg' },
  { name: 'StudyHub', url: 'https://cdn.jsdelivr.net/gh/AetherGamesOfficial/EducationalStuff@main/studyhub.svg' },
  { name: 'Nocturne', url: 'https://cdn.jsdelivr.net/gh/unblockedgamesupreme-cmd/nocturne-svg/noc.svg' },
  { name: 'Not A Game', url: 'https://cdn.jsdelivr.net/gh/apple-bonkers/not-games@main/notagame.svg' },
  { name: 'GUST', url: 'https://cdn.jsdelivr.net/gh/nautilus-os/GUST@latest/svg/site.svg' },
  { name: 'ClassLink', url: 'https://cdn.jsdelivr.net/gh/drewalow860-ctrl/securly.com@main/classlink.com/math.svg' },
  { name: 'GitHub', url: 'https://cdn.jsdelivr.net/gh/avaisadev/github.com@latest/index.svg' },
  { name: 'Drift', url: 'https://cdn.jsdelivr.net/gh/drift-education/svg@main/index.svg' },
];

let built = false;
let els = null;
let row = 0;

const totalRows = () => Math.max(1, Math.ceil(MOUNT_CHOCTAW_IMAGES.length / COLS));
const lastRow = () => Math.max(0, totalRows() - ROWS);
const clampRow = n => Math.max(0, Math.min(lastRow(), n));

// The archive is ~5 MB, which crawls over a tunnel. Only the rows on screen (plus one either
// side) get a real src, so opening the board fetches around a megabyte instead of everything.
function hydrate() {
  if (!els || els.panePhotos.hidden) return;
  const photos = els.grid.children;
  const from = Math.max(0, (row - 1) * COLS);
  const to = Math.min(photos.length, (row + ROWS + 1) * COLS);
  for (let i = from; i < to; i++) {
    const img = photos[i]?.querySelector('img');
    if (img && !img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src;
  }
}

// Visible-first image loading: an observer only fetches clippings approaching the viewport.
// The old open() assigned a src to all 100+ images at once (~5 MB), which is why the board
// crawled on a slow connection and could stall the whole page.
let photoObserver = null;
function observePhotos() {
  if (!els) return;
  const imgs = els.grid.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    for (const img of imgs) if (!img.getAttribute('src')) img.src = img.dataset.src;
    return;
  }
  photoObserver ??= new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      photoObserver.unobserve(img);
      if (!img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src;
    }
  }, { root: els.win, rootMargin: '400px 0px' });
  for (const img of imgs) if (!img.getAttribute('src')) photoObserver.observe(img);
}

function layout() {
  if (!els || els.panePhotos.hidden) return;
  // Keep the grid stable while images stream in: the figures already reserve their space.
  observePhotos();
  hydrate();
}

/** Scroll the page by about a screenful: -1 up, +1 down, 'top' / 'end'. */
function goTo(step) {
  if (!els) return;
  const w = els.win;
  if (step === 'top') w.scrollTo({ top: 0, behavior: 'smooth' });
  else if (step === 'end') w.scrollTo({ top: w.scrollHeight, behavior: 'smooth' });
  else w.scrollBy({ top: Math.sign(step) * w.clientHeight * 0.7, behavior: 'smooth' });
}

function open() {
  if (!built) return;
  // Release anything held in-game and hand the cursor back so the arrows can be clicked
  window.hero?.releaseAll?.();
  if (document.pointerLockElement) document.exitPointerLock();
  els.root.hidden = false;
  document.body.classList.add('mount-open');
  layout();
  els.win.scrollTop = 0;
  requestAnimationFrame(() => els.win.scrollTop = 0);
}

function close() {
  if (!built) return;
  els.root.hidden = true;
  if (els.lb) els.lb.hidden = true;
  document.body.classList.remove('mount-open');
}

function toggle() {
  if (!built) return;
  if (els.root.hidden) open(); else close();
}

/** The Bugle has two sections: the photo page (arrows, row paging) and the link board. */
function setTab(name) {
  if (!built) return;
  const photos = name !== 'links';
  els.tab = photos ? 'photos' : 'links';
  els.panePhotos.hidden = !photos;
  els.paneLinks.hidden = photos;
  for (const b of els.tabs) {
    const on = (b.dataset.tab === 'links') === !photos;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  els.hint.textContent = photos
    ? 'scroll or \u2191 \u2193 to read on · click a photo to see it full size'
    : 'click a link — it opens in a new tab';
  if (photos) layout();
  else els.paneLinks.scrollTop = 0;
}

function build() {
  const n = MOUNT_CHOCTAW_IMAGES.length;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="mount-open" type="button" title="Open the Daily Bugle (M)">DAILY BUGLE</button>
    <div id="mount-overlay" class="bugle-paper" role="dialog" aria-modal="true" aria-label="Daily Bugle" hidden>
      <div class="mount-board">
        <header class="mount-head">
          <div class="bugle-ears"><span>NEW YORK'S<br>FINEST DAILY</span><span>LATE CITY<br>EDITION</span></div>
          <h2 class="mount-title">The Daily Bugle</h2>
          <div class="bugle-dateline"><span>VOL. CXXVII · No. 41,207</span><span>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span><span>25 CENTS</span></div>
          <button id="mount-close" type="button" aria-label="Close the Daily Bugle">&times;</button>
        </header>
        <nav class="bugle-tabs" role="tablist" aria-label="Daily Bugle sections">
          <button class="bugle-tab on" type="button" data-tab="photos" role="tab" aria-selected="true">PHOTOS</button>
          <button class="bugle-tab" type="button" data-tab="links" role="tab" aria-selected="false">LINKS</button>
        </nav>
        <div class="mount-body" id="pane-photos">
          <div class="mount-window">
            <div class="mount-grid" id="mount-grid">
              ${MOUNT_CHOCTAW_IMAGES.map((f, i) => `
                <figure class="mount-photo" style="--tilt:${(((i * 7) % 5) - 2) * 0.6}deg">
                  <img data-src="${IMG_DIR}${f}?v=3" alt="Daily Bugle photograph ${i + 1}" width="720" height="540" loading="lazy" decoding="async" onerror="this.closest('figure').classList.add('missing')">
                  <figcaption>BUGLE PHOTO DESK · No. ${String(i + 1).padStart(2, '0')}</figcaption>
                </figure>`).join('')}
            </div>
          </div>
          <div class="mount-arrows">
            <button class="mount-arrow" id="mount-up" type="button" aria-label="Previous row">
              <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M32 4 L60 36 H4 Z"/></svg>
            </button>
            <div class="mount-rows" id="mount-rows">1–${ROWS} / ${totalRows()}</div>
            <button class="mount-arrow" id="mount-down" type="button" aria-label="Next row">
              <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M32 36 L4 4 H60 Z"/></svg>
            </button>
          </div>
        </div>
        <div class="bugle-links" id="pane-links" hidden>
          <div class="bugle-links-head">
            <span class="bl-kicker">THE LINK BOARD</span>
            <span class="bl-sub">${LINKS.length} links the Bugle meant to read later. Click a card — it opens in a new tab.</span>
          </div>
          <div class="bugle-links-grid">
            ${LINKS.map((l, i) => `
              <a class="bugle-link" href="${l.url}" target="_blank" rel="noopener noreferrer" title="${l.url}">
                <span class="bl-icon" style="${iconStyle(l.name)}" aria-hidden="true"><b>${monogram(l.name)}</b></span>
                <span class="bl-copy">
                  <span class="bl-title">${l.name}</span>
                </span>
                <span class="bl-open">OPEN &nearr;</span>
              </a>`).join('')}
          </div>
        </div>
        <footer class="mount-foot">
          <span id="bugle-hint">scroll or &uarr; &darr; to read on &middot; click a photo to see it full size</span>
          <span>1 / 2 switch sections &middot; ESC to close</span>
        </footer>
      </div>
    </div>
    <div id="bugle-lightbox" role="dialog" aria-modal="true" aria-label="Photo" hidden>
      <img id="bugle-lightbox-img" alt="">
      <button id="bugle-lightbox-close" type="button" aria-label="Close photo">&times;</button>
    </div>`;
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
  built = true;
  els = {
    root: document.getElementById('mount-overlay'),
    win: document.querySelector('.mount-window'),
    grid: document.getElementById('mount-grid'),
    label: document.getElementById('mount-rows'),
    up: document.getElementById('mount-up'),
    down: document.getElementById('mount-down'),
    openBtn: document.getElementById('mount-open'),
    closeBtn: document.getElementById('mount-close'),
    panePhotos: document.getElementById('pane-photos'),
    paneLinks: document.getElementById('pane-links'),
    hint: document.getElementById('bugle-hint'),
    tabs: [...document.querySelectorAll('.bugle-tab')],
    tab: 'photos',
  };

  // Click a photo: blow it up to the whole picture; X, Esc or the dark surround closes it
  const lb = document.getElementById('bugle-lightbox'), lbImg = document.getElementById('bugle-lightbox-img');
  els.lb = lb;
  const closeLb = () => { lb.hidden = true; };
  els.grid.addEventListener('click', e => {
    const img = e.target.closest('.mount-photo')?.querySelector('img');
    if (!img) return;
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lb.hidden = false;
  });
  document.getElementById('bugle-lightbox-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  els.closeLb = closeLb;
  // The newspaper sitting on the menu is a button too: click it, or focus and press Enter/Space
  const card = document.getElementById('bugle-card');
  if (card) {
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Open the Daily Bugle');
    card.tabIndex = 0;
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); open(); }
    });
  }

  els.openBtn.addEventListener('click', open);
  els.closeBtn.addEventListener('click', close);
  for (const b of els.tabs) b.addEventListener('click', () => setTab(b.dataset.tab));

  // Clicking the dark surround leaves, the board itself doesn't
  els.root.addEventListener('click', e => { if (e.target === els.root) close(); });

  // Mouse wheel pages the photo board a row at a time; the link board keeps its own scrollbar
  let wheelAcc = 0, wheelAt = 0;
  els.root.addEventListener('wheel', e => {
    return;   // the page scrolls natively now
    if (els.tab === 'links') return;
    e.preventDefault();
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 18 : 1);
    if (Math.abs(wheelAcc) < 32 || performance.now() - wheelAt < 150) return;
    goTo(row + Math.sign(wheelAcc));
    wheelAcc = 0;
    wheelAt = performance.now();
  }, { passive: false });

  // Capture phase on window: while the board is up, the game's own key handlers never see a key,
  // so the arrow keys page rows instead of moving the character.
  window.addEventListener('keydown', e => {
    if (!els || els.root.hidden) {
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) {
          toggle();
          e.preventDefault();
          e.stopPropagation();
        }
      }
      return;
    }
    if (!els.lb.hidden) { if (e.code === 'Escape' || e.code === 'KeyM') els.closeLb(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Escape' || e.code === 'KeyM') { close(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Digit1') { setTab('photos'); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Digit2') { setTab('links'); e.preventDefault(); e.stopPropagation(); return; }
    if (els.tab === 'links') {
      if (e.code === 'ArrowDown' || e.code === 'PageDown') { els.paneLinks.scrollBy({ top: 240, behavior: 'smooth' }); e.preventDefault(); }
      else if (e.code === 'ArrowUp' || e.code === 'PageUp') { els.paneLinks.scrollBy({ top: -240, behavior: 'smooth' }); e.preventDefault(); }
      e.stopPropagation();
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'PageDown') { goTo(1); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'ArrowUp' || e.code === 'PageUp') { goTo(-1); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Home') { goTo('top'); e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'End') { goTo('end'); e.preventDefault(); e.stopPropagation(); return; }
    e.stopPropagation();
  }, true);
  window.addEventListener('keyup', e => { if (els && !els.root.hidden) e.stopPropagation(); }, true);

  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  });

  window.mountChoctaw = { open, close, toggle, goTo };
}

/** Wire up the board. Safe to call more than once. */
export function initMountChoctaw() {
  if (built) return;
  build();
}
