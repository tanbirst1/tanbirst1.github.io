// api/index.js
// Fully robust Vercel API with TMDB caching and InfinityFree fallback

const tmdbCache = {}; // In-memory TMDB cache
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// Helper: slugify title for URL
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

// Safe fetch JSON
async function fetchJSON(url) {
  try {
    const res = await fetch(url, { timeout: 10000 }); // 10s timeout
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return null; // invalid JSON
    }
  } catch {
    return null; // network error
  }
}

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });
  }

  // Build InfinityFree URL
  const queryId = req.query.id || "";
  const queryTitle = req.query.title || "";
  const IF_URL = `https://blackseal.xyz/api/api.php${queryId ? `?id=${queryId}` : queryTitle ? `?title=${queryTitle}` : ""}`;

  // 1️⃣ Fetch movies from InfinityFree safely
  let movies = [];
  const ifData = await fetchJSON(IF_URL);
  if (ifData && ifData.ok && Array.isArray(ifData.data)) {
    movies = ifData.data;
  } else {
    // fallback movie if InfinityFree fails
    movies = [{
      id: "none",
      tmdb_id: 0,
      title: "none",
      genre: "none",
      src: ["none"]
    }];
  }

  // 2️⃣ Build sections with TMDB caching
  const sections = { "Recently added": [] };

  for (let movie of movies) {
    let tmdbData = {};

    // Check cache
    const cached = tmdbCache[movie.tmdb_id];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      tmdbData = cached.data;
    } else if (movie.tmdb_id && movie.tmdb_id !== 0) {
      try {
        const tmdbResp = await fetchJSON(`https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
        tmdbData = tmdbResp || {};
        tmdbCache[movie.tmdb_id] = { data: tmdbData, timestamp: Date.now() };
      } catch {
        tmdbData = {};
      }
    }

    const slug = slugify(movie.title || "none");
    sections["Recently added"].push({
      title: movie.title || "none",
      link: `https://multimovies.city/movies/${slug}/`,
      date_or_year: tmdbData.release_date || movie.year || "none",
      rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "none",
      original_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/original${tmdbData.poster_path}` : "none",
      tmdb_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "none",
      src: movie.src && movie.src.length ? movie.src : ["none"],
      genre: movie.genre || "none"
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
}    movies = [{
      id: "none",
      tmdb_id: 0,
      title: "none",
      genre: "none",
      src: []
    }];
  }

  // 2️⃣ Build sections with TMDB caching
  const sections = { "Recently added": [] };

  for (let movie of movies) {
    let tmdbData = {};

    // Use cache if available
    const cached = tmdbCache[movie.tmdb_id];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      tmdbData = cached.data;
    } else if (movie.tmdb_id && movie.tmdb_id !== 0) {
      // Fetch from TMDB
      try {
        const tmdbResp = await fetch(`https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
        tmdbData = await tmdbResp.json();
        tmdbCache[movie.tmdb_id] = { data: tmdbData, timestamp: Date.now() };
      } catch (e) {
        tmdbData = {};
      }
    }

    const slug = slugify(movie.title || "none");
    sections["Recently added"].push({
      title: movie.title || "none",
      link: `https://multimovies.city/movies/${slug}/`,
      date_or_year: tmdbData.release_date || movie.year || "none",
      rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "none",
      original_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/original${tmdbData.poster_path}` : "none",
      tmdb_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "none",
      src: movie.src && movie.src.length ? movie.src : ["none"],
      genre: movie.genre || "none"
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
