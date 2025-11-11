// api/episodes.js
// Vercel Serverless Function
// - Scrape multimovies.mobi episodes (page or page range)
// - Get TMDB id (for series) — TMDB used only for id lookup
// - For each episode link: fetch iframe sources using multi-movies-api (robust + fallbacks)
// - 2-minute in-memory cache
// - query params:
//    page=2         (default)
//    page=1-3       (range)
//    cache=0        bypass caches
// Env:
//    TMDB_API_KEY

const API_KEY = process.env.TMDB_API_KEY || "";
const CACHE_TTL = 1000 * 60 * 2; // 2 minutes
const DEBUG = !!process.env.DEBUG;

const cache = {
  episodes: new Map(),
  tmdb: new Map(),
  src: new Map(),
  base: { value: null, expiry: 0 }
};

export default async function handler(req, res) {
  try {
    const rawPage = (req.query.page || "2").toString();
    const bypassCache = req.query.cache === "0";

    // --- Step 0: fetch base URL dynamically ---
    const baseUrl = await getBaseUrl();

    const cacheKey = `episodes:${rawPage}`;
    if (!bypassCache) {
      const cached = getCache(cache.episodes, cacheKey);
      if (cached) {
        if (DEBUG) console.log("Returning cached episodes for", rawPage);
        return res.status(200).json({ cached: true, ...cached });
      }
    }

    const pages = parsePageRange(rawPage);
    let scrapedEpisodes = [];

    // --- Step 1: scrape listing pages for episode entries ---
    for (const p of pages) {
      const listUrl = `${baseUrl}/episodes/page/${p}/`;
      const html = await fetchWithTimeout(
        listUrl,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)" }
        },
        15000
      )
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "");

      const articleRegex = /<article class="item se episodes"[\s\S]*?<\/article>/g;
      const matches = html.match(articleRegex) || [];

      for (const block of matches) {
        const title = (block.match(/<h3><a[^>]*>(.*?)<\/a><\/h3>/i) || [])[1] || "";
        const link = (block.match(/<h3><a\s+href="([^"]+)"/i) || [])[1] || "";
        const serie = (block.match(/<span class="serie">(.*?)<\/span>/i) || [])[1] || "";
        const episodeInfo = (block.match(/<span>(S\d+\s*E\d+.*?)<\/span>/i) || [])[1] || "";

        if (serie && link) {
          scrapedEpisodes.push({
            serie: decodeHtml(serie.trim()),
            episodeInfo: (episodeInfo || "").trim(),
            title: decodeHtml(title.trim()),
            link: link.trim()
          });
        }
      }
    }

    scrapedEpisodes = deduplicate(scrapedEpisodes);

    // --- Step 2: find TMDB ids (cached) ---
    const uniqueSeries = [...new Set(scrapedEpisodes.map((e) => e.serie))];
    const serieMap = {};
    for (const serie of uniqueSeries) {
      const id = await getTmdbIdCached(serie, bypassCache);
      if (id) serieMap[serie] = id;
    }

    // --- Step 3: fetch sources for each episode using robust logic ---
    const finalData = [];
    for (const ep of scrapedEpisodes) {
      const sources = await getSourcesCached(ep.link, bypassCache);
      finalData.push({
        serie: ep.serie,
        tmdbId: serieMap[ep.serie] || null,
        episodeInfo: ep.episodeInfo,
        title: ep.title,
        link: ep.link,
        sources
      });
    }

    const result = { pages, total: finalData.length, data: finalData };

    setCache(cache.episodes, cacheKey, result);

    return res.status(200).json(result);
  } catch (err) {
    console.error("ERROR handler:", err);
    return res.status(500).json({ error: "Failed", details: err.message });
  }
}

/* ------------------- Helpers ------------------- */

function decodeHtml(html) {
  return (html || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function deduplicate(arr) {
  const seen = new Set();
  return arr.filter((ep) => {
    const key = (ep.serie || "") + "|" + (ep.episodeInfo || "") + "|" + (ep.title || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePageRange(input) {
  input = (input || "2").toString();
  if (input === "all") return [2];
  if (input.includes("-")) {
    const [s, e] = input.split("-").map((x) => parseInt(x, 10));
    if (!s || !e || e < s) return [Math.max(1, s || 2)];
    const out = [];
    for (let i = s; i <= e; i++) out.push(i);
    return out;
  }
  const n = parseInt(input, 10);
  return [isNaN(n) ? 2 : n];
}

/* ----------------- Simple TTL Cache ----------------- */
function getCache(map, key) {
  const it = map.get(key);
  if (!it) return null;
  if (Date.now() > it.expiry) {
    map.delete(key);
    return null;
  }
  return it.value;
}
function setCache(map, key, value) {
  map.set(key, { value, expiry: Date.now() + CACHE_TTL });
}

/* ----------------- TMDB lookup with cache ----------------- */
async function getTmdbIdCached(name, bypass = false) {
  const slug = slugify(name);
  if (!bypass) {
    const c = getCache(cache.tmdb, slug);
    if (c) return c;
  }
  if (!API_KEY) return null;
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(
    name
  )}`;
  const resp = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } }, 8000).catch(
    () => null
  );
  if (!resp || !resp.ok) return null;
  const json = await resp.json().catch(() => null);
  if (!json || !Array.isArray(json.results) || json.results.length === 0) return null;
  const match = json.results.find((r) => slugify(r.name) === slug) || json.results[0];
  if (match && match.id) {
    setCache(cache.tmdb, slug, match.id);
    return match.id;
  }
  return null;
}

/* ------------- Robust sources fetching ------------- */
async function getSourcesCached(link, bypass = false) {
  if (!link) return [];
  if (!bypass) {
    const c = getCache(cache.src, link);
    if (c) return c;
  }

  const endpoints = [
    "https://multi-movies-api.vercel.app/api/video",
    "https://multi-movies-api.vercel.app/api/tv"
  ];

  const variants = [
    (l) => `${l}`,
    (l) => encodeURIComponent(l),
    (l) => encodeURIComponent(l.replace(/\/$/, "")),
    (l) => encodeURIComponent(l.replace(/^https?:\/\//, ""))
  ];

  for (const ep of endpoints) {
    for (const v of variants) {
      const u = `${ep}?url=${v(link)}`;
      const sources = await tryFetchSources(u, link);
      if (sources && sources.length) {
        setCache(cache.src, link, sources);
        return sources;
      }
    }
  }

  for (const ep of endpoints) {
    try {
      const resp = await fetchWithTimeout(
        ep,
        {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)",
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json",
            Referer: link
          },
          body: JSON.stringify({ url: link })
        },
        12000
      ).catch(() => null);
      if (resp && resp.ok) {
        const json = await safeJson(resp);
        const srcs = extractSourcesFromApiJson(json);
        if (srcs.length) {
          setCache(cache.src, link, srcs);
          return srcs;
        }
      }
    } catch (e) {}
  }

  try {
    const htmlResp = await fetchWithTimeout(
      link,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)", Accept: "text/html" }
      },
      10000
    );
    const html = htmlResp && htmlResp.ok ? await htmlResp.text().catch(() => "") : "";
    if (html) {
      const scanned = scanHtmlForHosts(html);
      if (scanned.length) {
        setCache(cache.src, link, scanned);
        return scanned;
      }
    }
  } catch (e) {}

  setCache(cache.src, link, []);
  return [];
}

async function tryFetchSources(url, referer) {
  try {
    const resp = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)",
          Accept: "application/json, text/plain, */*",
          Referer: referer
        }
      },
      10000
    );
    if (!resp) return [];
    const contentType =
      (resp.headers && resp.headers.get && resp.headers.get("content-type")) || "";
    let json = null;
    if (contentType.includes("application/json") || contentType.includes("text/json")) {
      json = await resp.json().catch(() => null);
    } else {
      const txt = await resp.text().catch(() => "");
      try {
        json = JSON.parse(txt);
      } catch (e) {
        json = null;
      }
    }
    const sources = extractSourcesFromApiJson(json);
    if (sources && sources.length) return sources;

    return [];
  } catch (e) {
    return [];
  }
}

function extractSourcesFromApiJson(json) {
  if (!json) return [];
  const found = new Set();

  if (Array.isArray(json.sources)) {
    for (const s of json.sources) if (isUrlString(s)) found.add(s.toString());
  }

  if (json.data) collectUrlsDeep(json.data, found);
  if (json.result) collectUrlsDeep(json.result, found);

  if (Array.isArray(json.options)) {
    for (const o of json.options) {
      collectUrlsDeep(o, found);
    }
  }

  collectUrlsDeep(json, found);

  return Array.from(found).filter((s) => looksLikeEmbedUrl(s));
}

function collectUrlsDeep(obj, set) {
  if (!obj) return;
  if (typeof obj === "string") {
    if (isUrlString(obj)) set.add(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) collectUrlsDeep(it, set);
    return;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && isUrlString(v)) set.add(v);
      else collectUrlsDeep(v, set);
    }
  }
}

function isUrlString(s) {
  if (!s || typeof s !== "string") return false;
  return /^https?:\/\/\S+/i.test(s);
}

function looksLikeEmbedUrl(s) {
  if (!s) return false;
  const hostKeywords = [
    "embed",
    "gdmirror",
    "gdrive",
    "drive.google",
    "drive.google.com",
    "streamtape",
    "streamlare",
    "fembed",
    "mp4upload",
    "rapidvideo",
    "vidcloud",
    "openload",
    "dood",
    "sbplay",
    "player",
    "cdn"
  ];
  const lower = s.toLowerCase();
  for (const k of hostKeywords) if (lower.includes(k)) return true;
  if (lower.match(/\.(mp4|m3u8)(\?.*)?$/)) return true;
  return /^https?:\/\/[^\/]+\/embed\//i.test(s);
}

function scanHtmlForHosts(html) {
  if (!html) return [];
  const hostPattern = /https?:\/\/[^\s"'<>]{20,300}/gi;
  const candidates = new Set();
  const matchAll = html.match(hostPattern) || [];
  for (const cand of matchAll) {
    const c = cand.replace(/&amp;/g, "&").trim();
    if (looksLikeEmbedUrl(c)) candidates.add(c);
  }
  return Array.from(candidates);
}

async function safeJson(resp) {
  if (!resp) return null;
  try {
    return await resp.json();
  } catch (e) {
    try {
      const t = await resp.text();
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
}

async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return resp;
  } catch (e) {
    clearTimeout(id);
    return null;
  }
}

function slugify(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ---------------- Dynamic Base URL ---------------- */
async function getBaseUrl() {
  const now = Date.now();
  if (cache.base.value && cache.base.expiry > now) return cache.base.value;

  const fallback = "https://multimovies.sale";
  try {
    const resp = await fetchWithTimeout(
      "https://raw.githubusercontent.com/tanbirst1/multi-movies-api/refs/heads/main/src/baseurl.txt",
      { headers: { "User-Agent": "Mozilla/5.0" } },
      8000
    );
    if (!resp || !resp.ok) return fallback;
    const txt = (await resp.text()).trim();
    if (txt && txt.startsWith("http")) {
      cache.base = { value: txt, expiry: now + CACHE_TTL };
      return txt;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
