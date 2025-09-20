// api/index.js
// Fully dependency-free Vercel API with in-memory TMDB caching

// Simple in-memory cache
const tmdbCache = {}; // { tmdb_id: {data, timestamp} }
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Helper: create slug from title
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });
  }

  // 1️⃣ Fetch movie list from InfinityFree
  const queryId = req.query.id || "";
  const queryTitle = req.query.title || "";
  const IF_URL = `https://blackseal.xyz/api/api.php${queryId ? `?id=${queryId}` : queryTitle ? `?title=${queryTitle}` : ""}`;

  let movies = [];
  try {
    const r = await fetch(IF_URL);
    const json = await r.json();
    if (json.ok) movies = json.data;
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to fetch InfinityFree data", details: e.message });
  }

  // 2️⃣ Build sections with TMDB caching
  const sections = { "Recently added": [] };

  for (let movie of movies) {
    let tmdbData = {};

    // Check cache
    const cached = tmdbCache[movie.tmdb_id];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      tmdbData = cached.data;
    } else {
      // Fetch from TMDB
      try {
        const tmdbResp = await fetch(`https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
        tmdbData = await tmdbResp.json();
        tmdbCache[movie.tmdb_id] = { data: tmdbData, timestamp: Date.now() };
      } catch (e) {
        tmdbData = {};
      }
    }

    const slug = slugify(movie.title);
    sections["Recently added"].push({
      title: movie.title,
      link: `https://multimovies.city/movies/${slug}/`,
      date_or_year: tmdbData.release_date || movie.year || "",
      rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "",
      original_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/original${tmdbData.poster_path}` : "",
      tmdb_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "",
      src: movie.src || [],
      genre: movie.genre || ""
    });
  }

  // 3️⃣ Return JSON
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ok: true,
    page: 1,
    total: sections["Recently added"].length,
    sections
  });
}
