// Download modal with platform auto-detect + latest GitHub release lookup.
(() => {
  const REPO = 'cryptopoly/StuffDiver';
  const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
  const LATEST_PAGE = `https://github.com/${REPO}/releases/latest`;
  const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

  const PLATFORMS = [
    {
      id: 'mac-arm64',
      label: 'macOS',
      accent: 'Apple Silicon',
      sub: 'M1 / M2 / M3 / M4',
      emoji: '\uF8FF',
      match: [/(arm64|aarch64|apple[-_ ]?silicon).*\.(dmg|zip|pkg|tar\.gz)$/i,
              /\.(dmg|zip|pkg)$/i],
      excludeIf: [/(x64|x86_64|intel)/i, /(linux|windows|\.exe|\.msi|\.deb|\.rpm|\.AppImage)/i],
    },
    {
      id: 'mac-intel',
      label: 'macOS',
      accent: 'Intel',
      sub: 'x64 \u00b7 also runs on Apple Silicon via Rosetta',
      emoji: '\uF8FF',
      match: [/(x64|x86_64|intel).*\.(dmg|zip|pkg|tar\.gz)$/i],
      excludeIf: [/(linux|windows|\.exe|\.msi|\.deb|\.rpm|\.AppImage)/i],
    },
    {
      id: 'linux',
      label: 'Linux',
      accent: 'x64',
      sub: '.deb / .AppImage',
      emoji: '\ud83d\udc27',
      match: [/linux.*(x64|x86_64|amd64).*\.(deb|AppImage|tar\.gz|rpm)$/i,
              /(linux|\.AppImage|\.deb)/i],
      excludeIf: [/(arm64|aarch64)/i, /(windows|\.exe|\.msi|\.dmg|\.pkg)/i],
    },
    {
      id: 'linux-arm64',
      label: 'Linux',
      accent: 'ARM64',
      sub: 'Raspberry Pi \u00b7 ARM servers',
      emoji: '\ud83d\udc27',
      match: [/linux.*(arm64|aarch64).*\.(deb|AppImage|tar\.gz|rpm)$/i],
      excludeIf: [/(windows|\.exe|\.msi|\.dmg|\.pkg)/i],
    },
    {
      id: 'windows',
      label: 'Windows',
      accent: 'x64',
      sub: '.exe installer',
      emoji: '\ud83e\ude9f',
      match: [/\.(exe|msi)$/i, /windows/i],
      excludeIf: [],
    },
  ];

  function detectFromUA() {
    if (typeof navigator === 'undefined') return null;
    const ua = navigator.userAgent;
    if (/Windows/.test(ua)) return 'windows';
    if (/Linux/.test(ua) && !/Android/.test(ua)) {
      if (/aarch64|arm64/i.test(ua)) return 'linux-arm64';
      return 'linux';
    }
    if (/Macintosh|MacIntel/.test(ua)) return 'mac-unknown';
    return null;
  }

  async function detectPlatform() {
    const base = detectFromUA();
    if (!base) return null;
    if (base !== 'mac-unknown') return base;
    try {
      const uad = navigator.userAgentData;
      if (uad && uad.getHighEntropyValues) {
        const { architecture } = await uad.getHighEntropyValues(['architecture']);
        if (architecture === 'arm') return 'mac-arm64';
        if (architecture === 'x86') return 'mac-intel';
      }
    } catch {}
    return 'mac-both';
  }

  let _releasePromise = null;
  function getRelease() {
    if (_releasePromise) return _releasePromise;
    _releasePromise = fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
    return _releasePromise;
  }

  function matchAsset(assets, plat) {
    if (!assets || !assets.length) return null;
    const filtered = assets.filter(a => !plat.excludeIf.some(rx => rx.test(a.name)));
    for (const rx of plat.match) {
      const hit = filtered.find(a => rx.test(a.name));
      if (hit) return hit;
    }
    return null;
  }

  async function urlFor(platformId) {
    const plat = PLATFORMS.find(p => p.id === platformId);
    if (!plat) return LATEST_PAGE;
    const release = await getRelease();
    const asset = release && matchAsset(release.assets, plat);
    return asset ? asset.browser_download_url : LATEST_PAGE;
  }

  let modal, state = {
    detected: null,
    downloading: null,
    started: null,
    downloaded: new Set(),
    othersOpen: false,
    version: null,
  };

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function platformButton(p, highlighted) {
    const isLoading = state.downloading === p.id;
    const isDone = state.downloaded.has(p.id);
    return el('button', {
      class: 'dl-plat' + (highlighted ? ' dl-plat-highlight' : ''),
      disabled: state.downloading ? 'disabled' : null,
      onclick: () => handleDownload(p.id),
    },
      el('div', { class: 'dl-plat-icon' }, p.emoji),
      el('div', { class: 'dl-plat-body' },
        el('div', { class: 'dl-plat-title' },
          p.label,
          p.accent ? el('span', { class: 'dl-plat-accent' }, ' ' + p.accent) : null,
        ),
        el('div', { class: 'dl-plat-sub' }, isDone ? 'Download started \u2014 click to download again' : p.sub),
      ),
      el('div', { class: 'dl-plat-arrow' }, isLoading ? '\u23f3' : isDone ? '\u21bb' : '\u2192'),
    );
  }

  function render() {
    if (!modal) return;
    const body = modal.querySelector('.dl-body');
    body.innerHTML = '';

    const d = state.detected;
    const recIds = d === 'mac-both' ? ['mac-arm64', 'mac-intel'] : d ? [d] : [];
    const recs = PLATFORMS.filter(p => recIds.includes(p.id));
    const others = PLATFORMS.filter(p => !recIds.includes(p.id));

    body.appendChild(el('p', { class: 'dl-lede' },
      d && d !== 'mac-both' ? 'We detected your platform \u2014 your download is ready.' :
      d === 'mac-both' ? 'We detected macOS \u2014 choose your chip below.' :
      d === null && state.detected === null ? 'Detecting your platform\u2026' :
      'Choose your platform:'));

    if (state.version) {
      body.appendChild(el('div', { class: 'dl-version' }, 'Latest release \u00b7 ' + state.version));
    }

    if (state.downloading || state.started) {
      body.appendChild(el('div', { class: 'dl-status ' + (state.started ? 'dl-status-done' : 'dl-status-loading') },
        state.started ? '\u2713 Your download has started. If it didn\'t begin, click the button again.' : '\u23f3 Preparing your download\u2026'));
    }

    if (recs.length) {
      body.appendChild(el('div', { class: 'dl-rec-label' }, 'Recommended for you'));
      recs.forEach(p => body.appendChild(platformButton(p, true)));

      const toggle = el('button', {
        class: 'dl-toggle',
        onclick: () => { state.othersOpen = !state.othersOpen; render(); },
      }, (state.othersOpen ? '\u25be ' : '\u25b8 ') + 'Other platforms');
      body.appendChild(toggle);
      if (state.othersOpen) {
        const wrap = el('div', { class: 'dl-others' });
        others.forEach(p => wrap.appendChild(platformButton(p, false)));
        body.appendChild(wrap);
      }
    } else {
      body.appendChild(el('div', { class: 'dl-divider' }, 'download manually'));
      PLATFORMS.forEach(p => body.appendChild(platformButton(p, false)));
    }

    body.appendChild(el('p', { class: 'dl-foot' },
      'MIT License \u00b7 macOS, Windows & Linux. ',
      el('a', { href: RELEASES_PAGE, target: '_blank', rel: 'noopener' }, 'All releases \u2192'),
    ));
  }

  async function handleDownload(platformId) {
    if (state.downloading) return;
    state.downloading = platformId;
    render();
    const url = await urlFor(platformId);
    window.location.href = url;
    setTimeout(() => {
      state.downloading = null;
      state.started = platformId;
      state.downloaded.add(platformId);
      render();
      setTimeout(() => { if (state.started === platformId) { state.started = null; render(); } }, 6000);
    }, 1800);
  }

  function openModal() {
    if (!modal) buildModal();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    state.detected = null;
    state.downloading = null;
    state.started = null;
    state.downloaded = new Set();
    state.othersOpen = false;
    render();

    detectPlatform().then(p => { state.detected = p; render(); });
    getRelease().then(r => {
      if (r && r.tag_name) { state.version = r.tag_name; render(); }
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function buildModal() {
    modal = el('div', { class: 'dl-modal', onclick: e => { if (e.target === modal) closeModal(); } },
      el('div', { class: 'dl-card' },
        el('div', { class: 'dl-head' },
          el('h3', {}, 'Download Stuff Diver'),
          el('button', { class: 'dl-close', onclick: closeModal, 'aria-label': 'Close' }, '\u00d7'),
        ),
        el('div', { class: 'dl-body' }),
      ),
    );
    document.body.appendChild(modal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  function wire() {
    const triggers = document.querySelectorAll('[data-download], a[href="#install-download"], a[href="#download"]');
    triggers.forEach(t => t.addEventListener('click', e => { e.preventDefault(); openModal(); }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
