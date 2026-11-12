// Ad-blocking service worker for SpideyFlix theater embeds.
// Registered from the main page; intercepts all fetch requests from this origin
// (including proxied embed pages served at /embed-proxy) and blocks ad/tracker networks.

const VERSION = 'ab-1';

// Known ad/tracker/popunder domains (added from EasyList + common streaming ad networks)
const BLOCK_PATTERNS = [
  // Generic ad networks
  /doubleclick\.net/,/googlesyndication\.com/,/googleadservices\.com/,/google-analytics\.com/,
  /googletagmanager\.com/,/googletagservices\.com/,/adservice\.google\./,
  /amazon-adsystem\.com/,/ads\.amazon\.com/,
  /rubiconproject\.com/,/pubmatic\.com/,/openx\.net/,/openx\.com/,
  /casalemedia\.com/,/indexworm\.com/,/indexexchange\.com/,
  /appnexus\.com/,/adnxs\.com/,
  /criteo\.com/,/criteo\.net/,
  /taboola\.com/,/outbrain\.com/,
  /revcontent\.com/,/mgid\.com/,
  /sharethrough\.com/,/sovrn\.com/,
  /lijit\.com/,/contextweb\.com/,
  /33across\.com/,/tidaltv\.com/,
  /yieldmo\.com/,/kargo\.com/,
  /spotxchange\.com/,/spotx\.tv/,
  /freewheel\.tv/,/stickyadstv\.com/,
  /lkqd\.net/,/lkqd\.com/,
  /tremormedia\.com/,/videologygroup\.com/,
  /adsymptotic\.com/,/adsafeprotected\.com/,
  /doubleverify\.com/,/moatads\.com/,
  /parsely\.com/,/scorecardsresearch\.com/,
  /quantserve\.com/,/quantcast\.com/,
  /bluekai\.com/,/demdex\.net/,
  /addthis\.com/,/sharethis\.com/,
  /adsrvr\.org/,/adtechus\.com/,
  /yandex\.ru\/an\//,/an\.yandex\./,
  // Streaming-site-specific ad servers
  /popads\.net/,/popcash\.net/,/propellerads\.com/,
  /trafficjunky\.net/,/trafficfactory\.biz/,
  /exoclick\.com/,/juicyads\.com/,/adsteroids\.com/,
  /hilltopads\.net/,/plugrush\.com/,/adsterra\.com/,
  /clickadu\.com/,/pushground\.com/,/evadav\.com/,
  /trafficshop\.com/,/realsrv\.com/,/richads\.com/,
  /eroadvertising\.com/,/adultspatials\.com/,
  /trafficforce\.com/,/zeropark\.com/,/ero-advertising\.com/,
  /trafficstars\.com/,/adspyglass\.com/,
  // Trackers / fingerprinting
  /hotjar\.com/,/fullstory\.com/,/logrocket\.com/,
  /newrelic\.com/,/nr-data\.net/,
  /facebook\.com\/tr/,/connect\.facebook\.net/,
  /analytics\.twitter\.com/,/t\.co\/i\//,
  /snap\.licdn\.com/,/px\.ads\.linkedin\.com/,
  /analytics\.tiktok\.com/,
  /mc\.yandex\.ru/,
  /bing\.com\/action\//,
  // Pop/redirect scripts common on streaming embeds
  /popundermillions\.com/,/clickaine\.com/,/clicksfly\.com/,
  /onclickalgo\.com/,/onclick\.bestadvertising\./,
  /go2cloud\.org/,/go2speed\.org/,
  /onclickads\.net/,/onclickadv\.com/,
];

function shouldBlock(url) {
  try {
    const u = new URL(url);
    // Never block the game's own origin or embed-proxy
    if (u.hostname === self.location.hostname) return false;
    // Never block TMDB or vidsrc player resources
    if (/themoviedb\.org|vidsrc\.sh|vidsrc\.me|2embed\.cc|vidlink\.pro/.test(u.hostname)) return false;
    // Never block CDN resources needed by the player (HLS manifests, segments)
    if (/\.m3u8$|\.ts$|\.mp4$/.test(u.pathname)) return false;
    return BLOCK_PATTERNS.some(p => p.test(url));
  } catch { return false; }
}

self.addEventListener('install', e => { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' && e.request.method !== 'POST') return;
  if (shouldBlock(e.request.url)) {
    // Return empty 200 for scripts/images; 204 for everything else
    const ct = e.request.destination;
    const body = (ct === 'script' || ct === 'style') ? '' : null;
    e.respondWith(new Response(body, { status: 200, headers: { 'Content-Type': ct === 'script' ? 'application/javascript' : 'text/plain' } }));
  }
});
