// api/index.js
// Robust Vercel API with safe fetch, extended timeout, TMDB caching, and fallback

const tmdbCache = {}; // In-memory TMDB cache
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// Fallback movies if InfinityFree fails or is slow
const fallbackMovies = [
  {
    id: 1271,
    tmdb_id: 22855,
    title: "Superman/Batman: Public Enemies",
    genre: "Action, Adventure, Animation, Family, Science Fiction",
    src: [
      "https://www.youtube.com/embed/k2gq7YeMS40?autoplay=0&autohide=1",
      "https://multimoviesshg.com/e/ld4ma7fmwtd1",
      "https://sbplay.org/embed-9zcehdcf50in.html",
      "https://dood.la/e/sahulbtjqq6r",
      "https://mixdrop.co/e/vnevgdp7cv8wzl",
      "https://hydrax.net/watch?v=lrVlK_Uk5V"
    ]
  }
];

// Helper: create URL slug
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

// Safe fetch JSON with timeout
async function fetchJSON(url, timeout = 30000) { // 30s timeout for slow InfinityFree
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeout);
    fetch(url)
      .then(r => r.text())
      .then(text => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
}

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });
  }

  const queryId = req.query.id || "";
  const queryTitle = req.query.title || "";
  const IF_URL = `https://blackseal.xyz/api/api.php${queryId ? `?id=${queryId}` : queryTitle ? `?title=${queryTitle}` : ""}`;

  // 1️⃣ Fetch movies from InfinityFree with safe fallback
  let movies = [];
  const ifData = await fetchJSON(IF_URL, 30000); // wait up to 30s
  if (ifData && ifData.ok && Array.isArray(ifData.data) && ifData.data.length > 0) {
    movies = ifData.data;
  } else {
    movies = fallbackMovies; // fallback if InfinityFree fails
  }

  // 2️⃣ Parallel TMDB fetch with caching
  const sections = { "Recently added": [] };
  const moviePromises = movies.map(async movie => {
    let tmdbData = {};

    if (movie.tmdb_id && movie.tmdb_id !== 0) {
      const cached = tmdbCache[movie.tmdb_id];
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        tmdbData = cached.data;
      } else {
        try {
          const resp = await fetchJSON(`https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
          tmdbData = resp || {};
          tmdbCache[movie.tmdb_id] = { data: tmdbData, timestamp: Date.now() };
        } catch {
          tmdbData = {};
        }
      }
    }

    const slug = slugify(movie.title || "none");
    return {
      title: movie.title || "none",
      link: `https://multimovies.city/movies/${slug}/`,
      date_or_year: tmdbData.release_date || movie.year || "none",
      rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "none",
      original_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/original${tmdbData.poster_path}` : "none",
      tmdb_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "none",
      src: movie.src && movie.src.length ? movie.src : ["none"],
      genre: movie.genre || "none"
    };
  });

  try {
    const moviesData = await Promise.all(moviePromises);
    sections["Recently added"] = moviesData;
  } catch {
    // fallback if TMDB fetch fails
    sections["Recently added"] = fallbackMovies.map(m => ({
      title: m.title,
      link: `https://multimovies.city/movies/${slugify(m.title)}/`,
      date_or_year: "none",
      rating: "none",
      original_image: "none",
      tmdb_image: "none",
      src: m.src,
      genre: m.genre
    }));
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
