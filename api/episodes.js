// api/episodes.js
// Vercel API: Scrape episodes from multimovies.mobi and fetch details from TMDB

const API_KEY = process.env.TMDB_API_KEY; // set this in Vercel env vars

export default async function handler(req, res) {
  try {
    const { page = "2" } = req.query;

    // Parse page range (1-3) or single number
    const pages = parsePageRange(page);

    let scrapedEpisodes = [];

    // Scrape multiple pages
    for (let p of pages) {
      const url = `https://multimovies.mobi/episodes/page/${p}/`;

      const html = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)" }
      }).then(r => r.text());

      // Match articles
      const articleRegex = /<article class="item se episodes"[\s\S]*?<\/article>/g;
      const matches = html.match(articleRegex) || [];

      for (let block of matches) {
        const title = (block.match(/<h3><a[^>]*>(.*?)<\/a><\/h3>/) || [])[1] || "";
        const serie = (block.match(/<span class="serie">(.*?)<\/span>/) || [])[1] || "";
        const episodeInfo = (block.match(/<span>(S\d+ E\d+.*?)<\/span>/) || [])[1] || "";

        if (serie) {
          scrapedEpisodes.push({
            serie: decodeHtml(serie),
            episodeInfo: episodeInfo,
            title: decodeHtml(title)
          });
        }
      }
    }

    // Deduplicate by serie + episodeInfo
    scrapedEpisodes = deduplicate(scrapedEpisodes);

    // Fetch TMDB data for each serie (once per unique serie)
    let finalData = [];

    const uniqueSeries = [...new Set(scrapedEpisodes.map(ep => ep.serie))];

    for (let serieName of uniqueSeries) {
      const tmdbId = await findTmdbId(serieName);
      if (!tmdbId) continue;

      // Fetch all seasons
      const showData = await fetch(
        `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${API_KEY}&append_to_response=seasons`
      ).then(r => r.json());

      if (showData && showData.seasons) {
        for (let season of showData.seasons) {
          const seasonData = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${API_KEY}`
          ).then(r => r.json());

          if (seasonData.episodes) {
            finalData.push({
              serie: serieName,
              tmdbId,
              season: season.season_number,
              episodes: seasonData.episodes.map(ep => ({
                season: season.season_number,
                episode: ep.episode_number,
                title: ep.name,
                air_date: ep.air_date || "",
                overview: ep.overview || ""
              }))
            });
          }
        }
      }
    }

    res.status(200).json({
      pages,
      scrapedCount: scrapedEpisodes.length,
      seriesCount: uniqueSeries.length,
      data: finalData
    });

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

// Parse page range like "1-3"
function parsePageRange(input) {
  if (input.includes("-")) {
    const [start, end] = input.split("-").map(n => parseInt(n, 10));
    let arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }
  return [parseInt(input, 10)];
}

// Find TMDB TV show by name (slug filter)
async function findTmdbId(name) {
  const slug = slugify(name);
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(
    name
  )}`;
  const res = await fetch(url).then(r => r.json());
  if (!res.results || res.results.length === 0) return null;

  const match = res.results.find(r => slugify(r.name) === slug) || res.results[0];
  return match.id;
}

// Slugify text
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
