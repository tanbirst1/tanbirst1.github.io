// api/episodes.js
// Scrape multimovies episodes, get TMDB ID, fetch iframe sources with caching

const API_KEY = process.env.TMDB_API_KEY; // set in Vercel
const CACHE_TTL = 1000 * 60 * 2; // 2 minutes

// In-memory cache
const cache = {
  episodes: new Map(), // key: page(s), value: data
  tmdb: new Map(), // key: serie slug, value: {id, expiry}
  src: new Map() // key: episode link, value: {sources, expiry}
};

export default async function handler(req, res) {
  try {
    const { page = "2" } = req.query;

    // Cache key for request
    const cacheKey = `episodes:${page}`;
    const cached = getCache(cache.episodes, cacheKey);
    if (cached) {
      return res.status(200).json({ cached: true, ...cached });
    }

    const pages = parsePageRange(page);
    let scrapedEpisodes = [];

    // Step 1: scrape episodes
    for (let p of pages) {
      const url = `https://multimovies.mobi/episodes/page/${p}/`;
      const html = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)" }
      }).then(r => r.text());

      const articleRegex = /<article class="item se episodes"[\s\S]*?<\/article>/g;
      const matches = html.match(articleRegex) || [];

      for (let block of matches) {
        const title = (block.match(/<h3><a[^>]*>(.*?)<\/a><\/h3>/) || [])[1] || "";
        const link = (block.match(/<h3><a href="([^"]+)"/) || [])[1] || "";
        const serie = (block.match(/<span class="serie">(.*?)<\/span>/) || [])[1] || "";
        const episodeInfo = (block.match(/<span>(S\d+ E\d+.*?)<\/span>/) || [])[1] || "";

        if (serie && link) {
          scrapedEpisodes.push({
            serie: decodeHtml(serie),
            episodeInfo,
            title: decodeHtml(title),
            link
          });
        }
      }
    }

    scrapedEpisodes = deduplicate(scrapedEpisodes);

    // Step 2: map serie -> tmdbId (with cache)
    let serieMap = {};
    const uniqueSeries = [...new Set(scrapedEpisodes.map(ep => ep.serie))];
    for (let serieName of uniqueSeries) {
      const tmdbId = await getTmdbIdCached(serieName);
      if (tmdbId) serieMap[serieName] = tmdbId;
    }

    // Step 3: fetch sources for each episode (with cache)
    let finalData = [];
    for (let ep of scrapedEpisodes) {
      const sources = await getSourcesCached(ep.link);

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

    // Save in cache
    setCache(cache.episodes, cacheKey, result);

    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: "Failed", details: err.message });
  }
}

// === Helpers ===

// Decode HTML entities
function decodeHtml(html) {
  return (html || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Deduplicate by serie+episodeInfo
function deduplicate(arr) {
  const seen = new Set();
  return arr.filter(ep => {
    const key = ep.serie + "|" + ep.episodeInfo;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Parse ?page=1-3
function parsePageRange(input) {
  if (input.includes("-")) {
    const [start, end] = input.split("-").map(n => parseInt(n, 10));
    let arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }
  return [parseInt(input, 10)];
}

// === Cache functions ===
function getCache(map, key) {
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    map.delete(key);
    return null;
  }
  return item.value;
}

function setCache(map, key, value) {
  map.set(key, { value, expiry: Date.now() + CACHE_TTL });
}

// === TMDB ID (with cache) ===
async function getTmdbIdCached(name) {
  const slug = slugify(name);
  const cached = getCache(cache.tmdb, slug);
  if (cached) return cached;

  const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(
    name
  )}`;
  const res = await fetch(url).then(r => r.json());
  if (!res.results || res.results.length === 0) return null;

  const match = res.results.find(r => slugify(r.name) === slug) || res.results[0];
  const id = match.id;

  setCache(cache.tmdb, slug, id);
  return id;
}

// === Sources fetch (with cache + retry) ===
async function getSourcesCached(link) {
  const cached = getCache(cache.src, link);
  if (cached) return cached;

  const apiUrl = `https://multi-movies-api.vercel.app/api/tv?url=${encodeURIComponent(link)}`;

  let data = await safeFetch(apiUrl);
  if (!data || !data.ok || !Array.isArray(data.sources)) {
    // retry once
    data = await safeFetch(apiUrl);
  }

  const sources = (data && data.sources) ? data.sources : [];
  setCache(cache.src, link, sources);
  return sources;
}

async function safeFetch(url) {
  try {
    return await fetch(url).then(r => r.json());
  } catch {
    return null;
  }
}

// === Slugify ===
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
