// ===== CONFIG =====
const TMDB_KEY = "d6a23baa52d45df26ba9b8f731b43d8e";

// ===== HELPERS =====

// convert small poster to w500
function w500(url) {
  if (!url) return null;
  return url.replace("/w185/", "/w500/").replace("/w300/", "/w500/");
}

// extract slug from ToonStream URL
function getSlugFromUrl(url) {
  return url
    .replace("https://toonstream.one/movies/", "")
    .replace(/\/$/, "");
}

// get TMDB ID from title + year
async function getTmdbId(title, year) {
  try {
    const q = encodeURIComponent(title);
    const tmdbUrl =
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${q}&year=${year}`;

    const res = await fetch(tmdbUrl);
    const json = await res.json();

    if (json.results && json.results.length > 0) {
      return json.results[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

// check if this is really a MOVIE
function isMovieUrl(url) {
  return url.includes("/movies/");
}

export default async function handler(req, res) {
  try {
    // STEP 1 — get latest movies list
    const listRes = await fetch(
      "https://toonstream-api.ry4n.qzz.io/api/category/latest/movies"
    );
    const listJson = await listRes.json();

    const items = (listJson.results || []).filter(m => isMovieUrl(m.url));

    // collect only movie slugs
    const slugs = items.map(m => getSlugFromUrl(m.url));

    const movies = [];

    // STEP 2 — fetch full details for each movie
    for (const slug of slugs) {
      const detailUrl =
        `https://toonstream-api.ry4n.qzz.io/api/movie/${slug}`;

      const dRes = await fetch(detailUrl);
      const d = await dRes.json();

      if (!d.success) continue;

      const m = d.data.movieDetails;

      const tmdbId = await getTmdbId(m.title, m.year || "");

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

        directors: (m.directors || []).map(x => x.name),
        cast: (m.cast || []).map(x => x.name),
        tags: (m.tags || []).map(x => x.name),

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
