const TMDB_KEY = "d6a23baa52d45df26ba9b8f731b43d8e";

// ---- helpers ----

// convert poster to w500
function w500(url) {
  if (!url) return null;
  return url.replace("/w185/", "/w500/");
}

// get slug from ToonStream URL
function getSlug(url) {
  return url
    .replace("https://toonstream.one/movies/", "")
    .replace(/\/$/, "");
}

// get TMDB ID
async function getTmdbId(title, year) {
  try {
    const q = encodeURIComponent(title);
    const url =
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${q}&year=${year}`;

    const r = await fetch(url);
    const j = await r.json();

    return j.results?.[0]?.id || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    // STEP 1 — latest list
    const listRes = await fetch(
      "https://toonstream-api.ry4n.qzz.io/api/category/latest/movies"
    );
    const listJson = await listRes.json();

    const items = listJson.results || [];

    const movies = [];

    for (const item of items) {
      // skip series URLs
      if (!item.url.includes("/movies/")) continue;

      const slug = getSlug(item.url);

      // STEP 2 — movie details API (your correct one)
      const detailUrl =
        `https://toon-stream-api.vercel.app/movies/${slug}`;

      const dRes = await fetch(detailUrl);
      const d = await dRes.json();

      if (!d.success) continue;

      const m = d.data.movieDetails;

      const tmdbId = await getTmdbId(m.title, m.year);

      movies.push({
        toon_post_id: d.data.postId,
        slug: slug,
        title: m.title,
        tmdb_id: tmdbId,

        poster: w500(m.posterImage),
        year: m.year,
        duration: m.duration,
        rating: parseFloat(m.rating || 0),

        genres: (m.genres || []).map(g => g.name),
        directors: (m.directors || []).map(d => d.name),
        cast: (m.cast || []).map(c => c.name),
        tags: (m.tags || []).map(t => t.name),

        description: m.description,

        iframes: (d.data.videoOptions?.iframes || []).map(f => ({
          id: f.optionId,
          active: f.active,
          src: f.src
        })),

        servers:
          d.data.videoOptions?.servers?.[0]?.servers?.map(s => ({
            number: s.serverNumber,
            name: s.serverName.trim(),
            active: s.active
          })) || [],

        sourceUrl: d.data.movieUrl,
        scrapedAt: d.data.scrapedAt
      });
    }

    res.status(200).json({
      success: true,
      count: movies.length,
      fetchedAt: new Date().toISOString(),
      movies
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
