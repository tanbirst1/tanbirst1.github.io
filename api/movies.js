import fetch from "node-fetch";

/* --------- GENRE → TMDB ID MAP (you can extend this later) --------- */
const GENRE_MAP = {
  "adventure": 12,
  "animation": 16,
  "comedy": 35,
  "family": 10751,
  "fantasy": 14,
  "mystery": 9648,
  "romance": 10749,
  "drama": 18,
  "action": 28,
  "music": 10402,
  "science fiction": 878,
  "anime movies": 16,
  "cartoon movies": 16
};

/* Normalize image to w500 */
function w500(url) {
  if (!url) return null;
  return url.replace("/w185/", "/w500/").replace("/w300/", "/w500/");
}

/* Convert genre names to TMDB numbers */
function mapGenres(genres = []) {
  return genres
    .map(g => {
      const key = g.name.toLowerCase();
      return GENRE_MAP[key] || null;
    })
    .filter(Boolean);
}

/* Extract slug from ToonStream URL */
function getSlugFromUrl(url) {
  return url
    .replace("https://toonstream.one/movies/", "")
    .replace("https://toonstream.one/series/", "")
    .replace(/\/$/, "");
}

export default async function handler(req, res) {
  try {
    // STEP 1 — Get latest movies list
    const listRes = await fetch(
      "https://toonstream-api.ry4n.qzz.io/api/category/latest/movies"
    );
    const listJson = await listRes.json();

    const results = listJson.results || [];

    // STEP 2 — Collect slugs
    const slugs = results.map(m => getSlugFromUrl(m.url));

    // STEP 3 — Fetch full details for each movie
    const detailedMovies = [];

    for (const slug of slugs) {
      const detailUrl =
        `https://toonstream-api.ry4n.qzz.io/api/movie/${slug}`;

      const detailRes = await fetch(detailUrl);
      const d = await detailRes.json();

      if (!d.success) continue;

      const m = d.data.movieDetails;

      // Build clean movie object
      detailedMovies.push({
        id: d.data.postId,
        slug: slug,
        title: m.title,
        poster: w500(m.posterImage),
        year: m.year,
        duration: m.duration,
        rating: parseFloat(m.rating),

        // TMDB-style genre numbers
        genres: mapGenres(m.genres),

        // Simple arrays for frontend
        directors: m.directors.map(x => x.name),
        cast: m.cast.map(x => x.name),
        tags: (m.tags || []).map(x => x.name),

        description: m.description,

        // Video iframe sources (clean list)
        iframes: (d.data.videoOptions?.iframes || []).map(f => ({
          id: f.optionId,
          active: f.active,
          src: f.src
        })),

        // Servers list (clean)
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

    // STEP 4 — Final clean output
    res.status(200).json({
      success: true,
      count: detailedMovies.length,
      fetchedAt: new Date().toISOString(),
      movies: detailedMovies
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
