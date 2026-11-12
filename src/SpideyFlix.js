// SpideyFlix — dorm TV with live TMDB browse + watch-party sync.
//
// Tabs: Trending · Movies · TV · Anime · Search
// Source: TMDB API (key pool) → vidsrc.sh embed
// Watch party: room owner controls; server broadcasts t:'flix' to all guests.
// Clicking the TV mesh (or ⛶ bar button) → fullscreen theater overlay.

const LS_PROGRESS  = 'spideyflix.progress.v1';
const TMDB_KEYS    = [
  'fb7bb23f03b6994dafc674c074d01761',
  'e55425032d3d0f371fc776f302e7c09b',
  '8301a21598f8b45668d5711a814f01f6',
  '8cf43ad9c085135b9479ad5cf6bbcbda',
];
const TMDB         = 'https://api.themoviedb.org/3';
const IMG          = 'https://image.tmdb.org/t/p/w300';
const IMG_BIG      = 'https://image.tmdb.org/t/p/w780';
const P = url => `/embed-proxy?url=${encodeURIComponent(url)}`;
const EMBED_MOVIE  = id => P(`https://vidsrc.sh/embed/movie/${id}`);
const EMBED_TV     = (id, s = 1, e = 1) => P(`https://vidsrc.sh/embed/tv/${id}/${s}/${e}`);

const SOURCES = [
  { label: 'S1', movie: id => P(`https://vidsrc.sh/embed/movie/${id}`),   tv: (id,s,e) => P(`https://vidsrc.sh/embed/tv/${id}/${s}/${e}`) },
  { label: 'S2', movie: id => P(`https://www.2embed.cc/embed/${id}`),      tv: (id,s,e) => P(`https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`) },
  { label: 'S3', movie: id => P(`https://vidlink.pro/movie/${id}`),        tv: (id,s,e) => P(`https://vidlink.pro/tv/${id}/${s}/${e}`) },
];

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(t) { if (!isFinite(t)) return '0:00'; t = Math.floor(t); const h = Math.floor(t/3600), m = Math.floor(t/60)%60, s = t%60; return (h ? h+':'+String(m).padStart(2,'0') : m)+':'+String(s).padStart(2,'0'); }

let _keyIdx = 0;
async function tmdb(path, params = {}) {
  const url = new URL(TMDB + path);
  url.searchParams.set('api_key', TMDB_KEYS[_keyIdx % TMDB_KEYS.length]);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  if (r.status === 429) { _keyIdx++; return tmdb(path, params); }
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

const TABS = [
  { id: 'trending', label: '🔥 Trending' },
  { id: 'movies',   label: '🎬 Movies'   },
  { id: 'tv',       label: '📺 TV Shows' },
  { id: 'anime',    label: '⚡ Anime'    },
  { id: 'search',   label: '🔍 Search'   },
];

export class SpideyFlix {
  constructor(dorm) {
    this.dorm    = dorm;
    this.items   = [];   // local library.json entries
    this.isOwner = true;
    this.current = null;
    this.video   = document.createElement('video');
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto';
    this._theater     = null;
    this._tvFullscreen = null;
    this._activeTab   = 'trending';
    this._pages       = {};   // tab → current page
    this._results     = {};   // tab → array of items
    this._loading     = false;
    this._searchQ     = '';
    this._searchTimer = null;
    this._detail      = null; // currently expanded TV detail
    try { this.progress = JSON.parse(localStorage.getItem(LS_PROGRESS) || '{}'); } catch { this.progress = {}; }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/adblock-sw.js', { scope: '/' }).catch(() => {});
    }
    this._ui();
    this._loadLocal();
    this.video.addEventListener('timeupdate', () => this._tick());
    this.video.addEventListener('ended', () => { this._saveProgress(0); if (this.isOwner) { this.stop(); this._broadcast(null); } });
    this.video.addEventListener('play',  () => this._syncBtn());
    this.video.addEventListener('pause', () => this._syncBtn());
  }

  // ─── Ownership ────────────────────────────────────────────────────────────

  setOwner(isOwner) {
    this.isOwner = !!isOwner;
    if (!this.bar) return;
    const hide = el => { if (el) el.style.display = isOwner ? '' : 'none'; };
    hide(this.bar.querySelector('.pp'));
    hide(this.bar.querySelector('.stop'));
    hide(this.bar.querySelector('.menu'));
    const seek = this.bar.querySelector('.seek');
    if (seek) { seek.style.pointerEvents = isOwner ? '' : 'none'; seek.style.opacity = isOwner ? '' : '0.4'; }
    // Show/hide the tab bar + search for guests
    if (this._tabBar) this._tabBar.style.display = isOwner ? '' : 'none';
    if (this._addBtn) this._addBtn.style.display  = isOwner ? '' : 'none';
    this._setGuestBanner(!isOwner);
  }

  _setGuestBanner(show) {
    let b = this.root?.querySelector('.sflix-guest-banner');
    if (show && !b) {
      b = document.createElement('p');
      b.className = 'sflix-guest-banner';
      b.textContent = '🎬 Watch party — the room owner controls playback';
      this._tabBar?.after(b);
    } else if (!show && b) b.remove();
  }

  // ─── Sync / broadcast ────────────────────────────────────────────────────

  _broadcast(flixOrNull) { this.dorm.net?.send?.({ t: 'flix', flix: flixOrNull }); }

  _broadcastState(playing) {
    if (!this.current) return;
    this._broadcast({ item: this.current, playing: !!playing, t: this.current.embed ? 0 : (this.video.currentTime || 0) });
  }

  applySync(flix) {
    if (!flix) { this._stopInternal(); return; }
    const { item, playing, t, ts } = flix;
    if (!item) return;
    if (!this.current || this.current.id !== item.id) {
      this._playInternal(item, t, playing, ts);
    } else if (!item.embed) {
      const v = this.video, lag = (Date.now() - ts) / 1000;
      const target = t + (playing ? lag : 0);
      if (Math.abs(v.currentTime - target) > 2) v.currentTime = target;
      playing ? v.play().catch(() => {}) : v.pause();
    }
    this.bar.classList.add('show');
    this.np.textContent = item.title || item.name || 'Untitled';
    this._syncBtn();
  }

  // ─── Playback internal ───────────────────────────────────────────────────

  _playInternal(item, seekTo = 0, playing = true, ts = Date.now()) {
    if (this.current && this.current !== item) this._saveProgress();
    this.current = item;
    if (item.embed) {
      this._playEmbed(item);
    } else {
      this._closeTheater(); this._closeTV();
      const v = this.video;
      if (v.src !== new URL(item.src, location.href).href) v.src = item.src;
      const lag  = (Date.now() - ts) / 1000;
      const target = seekTo + (playing ? lag : 0);
      v.addEventListener('loadedmetadata', () => {
        v.currentTime = target > 5 ? target : (this.progress[item.id] > 5 ? this.progress[item.id] : 0);
      }, { once: true });
      playing ? v.play().catch(() => {}) : v.pause();
      this.dorm.setTV(v);
    }
    this.bar.classList.add('show');
    this.np.textContent = item.title || item.name || 'Untitled';
    this.close();
  }

  _stopInternal() {
    if (this.current) this._saveProgress();
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    this._closeTheater(); this._closeTV();
    this.current = null;
    this.dorm.setTV(null);
    this.bar.classList.remove('show');
  }

  // ─── Owner play / stop ───────────────────────────────────────────────────

  play(item) {
    if (!this.isOwner) return;
    this._playInternal(item, 0, true);
    this._broadcastState(true);
  }

  stop() {
    if (!this.isOwner) return;
    this._stopInternal(); this._broadcast(null);
  }

  // ─── Embed theater ────────────────────────────────────────────────────────

  _playEmbed(item) {
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    this._closeTheater(); this._drawStreamingCanvas(item); this._openTheater(item);
  }

  _drawStreamingCanvas(item) {
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 360;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0, 0, 640, 360);
    if (item.poster) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.globalAlpha = 0.18;
        ctx.drawImage(img, 0, 0, 640, 360);
        ctx.globalAlpha = 1;
        this._drawStreamingText(ctx, item);
        this.dorm.setTV(cv);
      };
      img.src = item.poster;
    } else {
      this._drawStreamingText(ctx, item);
    }
    this.dorm.setTV(cv);
    this._streamCanvas = cv;
  }

  _drawStreamingText(ctx, item) {
    ctx.fillStyle = '#0b0b0f88'; ctx.fillRect(0, 0, 640, 360);
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px sans-serif'; ctx.fillStyle = '#e50914'; ctx.fillText('SPIDEY', 320, 148);
    ctx.fillStyle = '#fff'; ctx.fillText('FLIX', 320, 200);
    ctx.font = '20px sans-serif'; ctx.fillStyle = '#aaa'; ctx.fillText('▶ Streaming — click TV to watch', 320, 258);
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#888'; ctx.fillText(item.title || item.name || '', 320, 290);
  }

  _getEmbedForSource(item, srcIdx) {
    const src = SOURCES[srcIdx] ?? SOURCES[0];
    const tmdbId = item._tmdbId ?? (typeof item.id === 'number' ? item.id : null);
    if (!tmdbId) return item.embed; // fallback: original embed
    if (item._isTV) return src.tv(tmdbId, item._season ?? 1, item._episode ?? 1);
    return src.movie(tmdbId);
  }

  _openTheater(item, srcIdx = this._srcIdx ?? 0) {
    this._closeTheater();
    this._srcIdx = srcIdx;
    const hasTmdb = !!(item._tmdbId ?? (typeof item.id === 'number' ? item.id : null));
    const ov = this._theater = document.createElement('div');
    ov.id = 'sflix-theater';
    const closeLabel = this.isOwner ? '■ Stop & Exit' : '✕ Hide';
    const srcBtns = SOURCES.map((s, i) =>
      `<button type="button" class="sflix-th-src${i === srcIdx ? ' active' : ''}" data-src="${i}" ${hasTmdb ? '' : 'disabled title="No TMDB ID"'}>${s.label}</button>`
    ).join('');
    ov.innerHTML = `<div class="sflix-th-top">
      <span class="sflix-th-title">${esc(item.title || item.name || '')}</span>
      ${!this.isOwner ? '<span class="sflix-th-badge">Watch Party</span>' : ''}
      <div class="sflix-th-srcs">${srcBtns}</div>
      <button type="button" class="sflix-th-cc" title="Subtitles / CC">CC</button>
      <button type="button" class="sflix-th-close">${closeLabel}</button>
    </div>
    <iframe src="${esc(this._getEmbedForSource(item, srcIdx))}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>
    <div class="sflix-th-cc-tip" hidden>Subtitles are built into the player — look for the CC or ⚙ button inside the video.</div>`;
    document.body.appendChild(ov);
    ov.querySelector('.sflix-th-close').addEventListener('click', () => {
      this.isOwner ? this.stop() : this._closeTheater();
    });
    ov.querySelector('.sflix-th-cc').addEventListener('click', e => {
      const tip = ov.querySelector('.sflix-th-cc-tip');
      tip.hidden = !tip.hidden;
      e.currentTarget.classList.toggle('active', !tip.hidden);
    });
    ov.querySelectorAll('.sflix-th-src').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.src;
        this._srcIdx = idx;
        const iframe = ov.querySelector('iframe');
        iframe.src = this._getEmbedForSource(item, idx);
        ov.querySelectorAll('.sflix-th-src').forEach((b, i) => b.classList.toggle('active', i === idx));
      });
    });
  }

  _closeTheater() { if (this._theater) { this._theater.remove(); this._theater = null; } }
  _closeTV()      { this._streamCanvas = null; }

  onTVClick() {
    if (!this.current) return;
    if (this.current.embed) {
      this._theater ? this._closeTheater() : this._openTheater(this.current);
    } else {
      this._toggleVideoFullscreen();
    }
  }

  _toggleVideoFullscreen() {
    if (this._tvFullscreen) { this._closeVideoFullscreen(); return; }
    const ov = this._tvFullscreen = document.createElement('div');
    ov.id = 'sflix-tv-fs';
    ov.appendChild(this.video);
    this.video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'sflix-th-close'; btn.textContent = '✕';
    ov.appendChild(btn);
    document.body.appendChild(ov);
    btn.addEventListener('click', () => this._closeVideoFullscreen());
  }

  _closeVideoFullscreen() {
    if (!this._tvFullscreen) return;
    this.video.style.cssText = '';
    document.body.appendChild(this.video);
    this._tvFullscreen.remove(); this._tvFullscreen = null;
  }

  // ─── Progress ─────────────────────────────────────────────────────────────

  _saveProgress(t = this.video.currentTime) {
    if (!this.current || this.current.embed) return;
    this.progress[this.current.id] = t;
    try { localStorage.setItem(LS_PROGRESS, JSON.stringify(this.progress)); } catch {}
  }

  _tick() {
    const v = this.video;
    if (!v.duration) return;
    this.seek.value = String(v.currentTime / v.duration * 1000);
    this.time.textContent = `${fmt(v.currentTime)} / ${fmt(v.duration)}`;
    if ((this._lastSave ?? 0) + 5 < v.currentTime || v.currentTime < (this._lastSave ?? 0)) { this._lastSave = v.currentTime; this._saveProgress(); }
  }
  _syncBtn() { this.ppBtn.textContent = this.video.paused ? '▶' : '❚❚'; }

  // ─── Local library (library.json) ────────────────────────────────────────

  async _loadLocal() {
    try {
      const r = await fetch('assets/spideyflix/library.json', { cache: 'no-cache' });
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) this.items.push(...list.filter(x => x && (x.src || x.embed)).map(x => ({ ...x, id: x.id || x.src || x.embed, _local: true })));
      }
    } catch {}
    if (this._activeTab === 'trending') this._fetchTab('trending');
  }

  _addFiles(files) {
    if (!this.isOwner) return;
    for (const f of files) {
      if (!f.type.startsWith('video/')) continue;
      const id = 'file:' + f.name + ':' + f.size;
      if (this.items.some(x => x.id === id)) continue;
      this.items.push({ id, title: f.name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' '), src: URL.createObjectURL(f), _local: true, genre: 'From your PC' });
    }
    if (this._activeTab === 'trending') this._renderGrid(this.items.filter(x => x._local));
  }

  // ─── TMDB fetching ────────────────────────────────────────────────────────

  async _fetchTab(tab, page = 1) {
    if (this._loading) return;
    this._loading = true;
    this._setLoadingState(true);
    try {
      let data;
      if (tab === 'trending') {
        data = await tmdb('/trending/all/week', { page });
      } else if (tab === 'movies') {
        data = await tmdb('/movie/popular', { page });
      } else if (tab === 'tv') {
        data = await tmdb('/tv/popular', { page });
      } else if (tab === 'anime') {
        data = await tmdb('/discover/tv', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', page });
      } else if (tab === 'search') {
        if (!this._searchQ) { this._setLoadingState(false); this._loading = false; return; }
        data = await tmdb('/search/multi', { query: this._searchQ, page });
      }
      const items = (data?.results ?? []).map(x => this._tmdbToItem(x)).filter(Boolean);
      if (page === 1) this._results[tab] = items;
      else this._results[tab] = [...(this._results[tab] ?? []), ...items];
      this._pages[tab] = page;
      this._renderGrid(this._results[tab], tab, data?.total_pages > page);
    } catch (e) {
      this._showError('Could not load: ' + e.message);
    }
    this._loading = false;
    this._setLoadingState(false);
  }

  _tmdbToItem(x) {
    const isMovie = x.media_type === 'movie' || x.first_air_date === undefined;
    const id      = (isMovie ? 'tmdb-movie-' : 'tmdb-tv-') + x.id;
    const title   = x.title || x.name || '';
    const year    = (x.release_date || x.first_air_date || '').slice(0, 4);
    const poster  = x.poster_path ? IMG + x.poster_path : null;
    const embed   = isMovie ? EMBED_MOVIE(x.id) : null; // TV: open detail picker
    return { id, title, year, poster, embed, desc: x.overview?.slice(0, 220) || '', _tmdbId: x.id, _isTV: !isMovie, _isTVShow: !isMovie };
  }

  // ─── TV episode detail ────────────────────────────────────────────────────

  async _openTVDetail(item) {
    if (!this.isOwner) return;
    this._detail = item;
    this._detailPanel.innerHTML = `<div class="sflix-det-loading">Loading seasons…</div>`;
    this._detailPanel.classList.add('show');
    try {
      const data = await tmdb(`/tv/${item._tmdbId}`);
      const seasons = (data.seasons ?? []).filter(s => s.season_number > 0);
      this._detail._seasons = seasons;
      this._detail._poster  = item.poster || (data.poster_path ? IMG_BIG + data.poster_path : null);
      this._renderDetailPanel(item, data, seasons);
    } catch (e) {
      this._detailPanel.innerHTML = `<p class="sflix-det-err">Failed to load: ${esc(e.message)}</p><button class="sflix-det-close">✕</button>`;
      this._detailPanel.querySelector('.sflix-det-close')?.addEventListener('click', () => this._closeDetail());
    }
  }

  _renderDetailPanel(item, data, seasons) {
    const bg = data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '';
    this._detailPanel.innerHTML = `
      <div class="sflix-det-bg" style="${bg ? `background-image:url('${esc(bg)}')` : ''}"></div>
      <div class="sflix-det-inner">
        <button class="sflix-det-close" aria-label="Close">✕</button>
        <h2 class="sflix-det-title">${esc(item.title)}</h2>
        <p class="sflix-det-meta">${esc([item.year, data.number_of_seasons + ' seasons'].filter(Boolean).join(' · '))}</p>
        <p class="sflix-det-desc">${esc(item.desc)}</p>
        <div class="sflix-det-pickers">
          <label>Season
            <select class="sflix-det-season">
              ${seasons.map(s => `<option value="${s.season_number}">Season ${s.season_number} (${s.episode_count} eps)</option>`).join('')}
            </select>
          </label>
          <label>Episode
            <select class="sflix-det-ep"></select>
          </label>
          <button class="sflix-det-play brick small">▶ Play on TV</button>
        </div>
      </div>`;
    const panelEl = this._detailPanel;
    const selS  = panelEl.querySelector('.sflix-det-season');
    const selE  = panelEl.querySelector('.sflix-det-ep');
    const updateEps = () => {
      const s = seasons.find(x => x.season_number === +selS.value);
      selE.innerHTML = Array.from({ length: s?.episode_count ?? 1 }, (_, i) =>
        `<option value="${i + 1}">Episode ${i + 1}</option>`).join('');
    };
    updateEps();
    selS.addEventListener('change', updateEps);
    panelEl.querySelector('.sflix-det-play').addEventListener('click', () => {
      const s = +selS.value, e = +selE.value;
      const playItem = { ...item, embed: EMBED_TV(item._tmdbId, s, e), id: item.id + `-s${s}e${e}`, title: `${item.title} S${s}E${e}`, _season: s, _episode: e };
      this.play(playItem);
      this._closeDetail();
    });
    panelEl.querySelector('.sflix-det-close').addEventListener('click', () => this._closeDetail());
  }

  _closeDetail() { this._detailPanel.classList.remove('show'); this._detail = null; }

  // ─── DOM ──────────────────────────────────────────────────────────────────

  get isOpen() { return this.root.classList.contains('show'); }
  open() {
    if (!this.isOwner) return;
    this.root.classList.add('show');
    document.exitPointerLock?.();
    if (!this._results[this._activeTab]) this._fetchTab(this._activeTab);
    else this._renderGrid(this._results[this._activeTab], this._activeTab);
  }
  close() { this.root.classList.remove('show'); this._closeDetail(); }
  toggle() { this.isOwner ? (this.isOpen ? this.close() : this.open()) : null; }

  _ui() {
    const root = this.root = document.createElement('div');
    root.id = 'sflix';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'SpideyFlix');

    // ── Header ──
    const hdr = document.createElement('header');
    hdr.className = 'sflix-top';
    hdr.innerHTML = `<div class="sflix-logo">SPIDEY<span>FLIX</span></div>
      <input class="sflix-search-input" type="search" placeholder="Search movies, shows, anime…" aria-label="Search">
      <label class="sflix-add">+ Add<input type="file" accept="video/*" multiple hidden></label>
      <button class="sflix-x" type="button" aria-label="Close">✕</button>`;
    root.appendChild(hdr);
    this._addBtn = hdr.querySelector('.sflix-add');
    hdr.querySelector('.sflix-x').addEventListener('click', () => this.close());
    hdr.querySelector('input[type=file]').addEventListener('change', e => { this._addFiles(e.target.files); e.target.value = ''; });

    const searchInput = hdr.querySelector('.sflix-search-input');
    searchInput.addEventListener('input', () => {
      this._searchQ = searchInput.value.trim();
      clearTimeout(this._searchTimer);
      if (this._searchQ) {
        this._switchTab('search');
        this._searchTimer = setTimeout(() => this._fetchTab('search'), 400);
      } else if (this._activeTab === 'search') {
        this._switchTab('trending');
      }
    });

    // ── Tabs ──
    const tabBar = this._tabBar = document.createElement('div');
    tabBar.className = 'sflix-tabs';
    for (const t of TABS) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'sflix-tab'; btn.dataset.tab = t.id; btn.textContent = t.label;
      if (t.id === 'search') btn.style.display = 'none';
      btn.addEventListener('click', () => {
        searchInput.value = ''; this._searchQ = '';
        this._switchTab(t.id);
      });
      tabBar.appendChild(btn);
    }
    root.appendChild(tabBar);

    // ── Hero / grid area ──
    const body = document.createElement('div');
    body.className = 'sflix-body';
    body.innerHTML = `
      <section class="sflix-hero"></section>
      <div class="sflix-grid-wrap">
        <div class="sflix-grid"></div>
        <button class="sflix-load-more" type="button">Load more</button>
      </div>
      <p class="sflix-hint"><kbd>T</kbd> open/close · click TV mesh to fullscreen</p>`;
    root.appendChild(body);
    this.hero     = body.querySelector('.sflix-hero');
    this._grid    = body.querySelector('.sflix-grid');
    this._loadMoreBtn = body.querySelector('.sflix-load-more');
    this._loadMoreBtn.style.display = 'none';
    this._loadMoreBtn.addEventListener('click', () => this._fetchTab(this._activeTab, (this._pages[this._activeTab] ?? 1) + 1));
    root.addEventListener('dragover', e => e.preventDefault());
    root.addEventListener('drop',     e => { e.preventDefault(); this._addFiles(e.dataTransfer.files); });

    // ── TV show detail panel ──
    const det = this._detailPanel = document.createElement('div');
    det.className = 'sflix-detail';
    root.appendChild(det);

    document.body.appendChild(root);

    // ── Bottom control bar ──
    const bar = this.bar = document.createElement('div');
    bar.id = 'sflix-bar';
    bar.innerHTML = `<span class="sflix-mini">SPIDEY<b>FLIX</b></span>
      <button type="button" class="pp" aria-label="Play/pause">❚❚</button>
      <span class="np"></span>
      <input type="range" class="seek" min="0" max="1000" value="0" aria-label="Seek">
      <span class="tm">0:00</span>
      <input type="range" class="vol" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      <button type="button" class="screen" aria-label="Fullscreen/theater">⛶</button>
      <button type="button" class="menu" aria-label="Open SpideyFlix">☰</button>
      <button type="button" class="stop" aria-label="Stop">■</button>`;
    document.body.appendChild(bar);
    this.ppBtn = bar.querySelector('.pp');
    this.np    = bar.querySelector('.np');
    this.seek  = bar.querySelector('.seek');
    this.time  = bar.querySelector('.tm');
    this.ppBtn.addEventListener('click', () => {
      if (!this.isOwner) return;
      this.video.paused ? (this.video.play().catch(() => {}), this._broadcastState(true)) : (this.video.pause(), this._broadcastState(false));
    });
    bar.querySelector('.stop').addEventListener('click',   () => { if (this.isOwner) this.stop(); });
    bar.querySelector('.menu').addEventListener('click',   () => { if (this.isOwner) this.open(); });
    bar.querySelector('.screen').addEventListener('click', () => this.onTVClick());
    this.seek.addEventListener('input', () => {
      if (!this.isOwner || !this.video.duration) return;
      this.video.currentTime = this.seek.value / 1000 * this.video.duration;
      this._broadcastState(!this.video.paused);
    });
    bar.querySelector('.vol').addEventListener('input', e => { this.video.volume = +e.target.value; });
  }

  _switchTab(tabId) {
    this._activeTab = tabId;
    this._detailPanel?.classList.remove('show');
    this._tabBar?.querySelectorAll('.sflix-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
      if (b.dataset.tab === 'search') b.style.display = tabId === 'search' ? '' : 'none';
    });
    if (!this._results[tabId]) {
      this._fetchTab(tabId);
    } else {
      this._renderGrid(this._results[tabId], tabId, (this._pages[tabId] ?? 1) < 500);
    }
  }

  _setLoadingState(on) {
    if (on) {
      this._grid.innerHTML = '<div class="sflix-spinner"></div>';
      this._loadMoreBtn.style.display = 'none';
    }
  }

  _showError(msg) {
    this._grid.innerHTML = `<p class="sflix-empty" style="padding:40px">${esc(msg)}</p>`;
  }

  // ─── Render grid ──────────────────────────────────────────────────────────

  _renderGrid(items, tab = this._activeTab, hasMore = false) {
    if (!items?.length) {
      this._grid.innerHTML = `<p class="sflix-empty">Nothing here yet.</p>`;
      this._loadMoreBtn.style.display = 'none';
      return;
    }

    // Hero from first item
    const feat = items[0];
    this.hero.innerHTML = `
      <div class="sflix-hero-bg" style="${feat.poster ? `background-image:url('${esc(feat.poster)}')` : ''}"></div>
      <div class="sflix-hero-txt">
        <h2>${esc(feat.title)}</h2>
        <p class="meta">${esc([feat.year, feat._isTV ? 'TV Show' : 'Movie'].filter(Boolean).join(' · '))}</p>
        <p>${esc(feat.desc || '')}</p>
        ${this.isOwner ? `<button type="button" class="sflix-play" data-feat="1">▶ Play</button>` : `<p class="sflix-owner-note">Waiting for owner…</p>`}
      </div>`;
    this.hero.querySelector('[data-feat]')?.addEventListener('click', () => this._onCardClick(feat));

    // Grid cards
    this._grid.innerHTML = items.map((item, i) => {
      const lock = !this.isOwner ? ' sflix-card-locked' : '';
      const prog = !item.embed && item.id in this.progress && this.progress[item.id] > 5 ? '<i class="sflix-prog"></i>' : '';
      const badge = item._isTV ? '<span class="sflix-tv-badge">TV</span>' : '';
      const art   = item.poster
        ? `<img src="${esc(item.poster)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`+
          `<div class="sflix-art" style="display:none;background:linear-gradient(135deg,#d0242c,#1f3f9f)">${esc(item.title)}</div>`
        : `<div class="sflix-art" style="background:linear-gradient(135deg,#d0242c,#1f3f9f)">${esc(item.title)}</div>`;
      return `<button type="button" class="sflix-card${lock}" data-i="${i}" ${!this.isOwner ? 'disabled' : ''}>${art}${prog}${badge}<span class="sflix-cap">${esc(item.title)}</span></button>`;
    }).join('');

    this._grid.querySelectorAll('.sflix-card:not([disabled])').forEach(b => {
      b.addEventListener('click', () => this._onCardClick(items[+b.dataset.i]));
    });

    this._loadMoreBtn.style.display = this.isOwner && hasMore ? '' : 'none';
  }

  _onCardClick(item) {
    if (!this.isOwner) return;
    if (item._isTVShow) {
      this._openTVDetail(item);
    } else {
      this.play(item);
    }
  }
}
