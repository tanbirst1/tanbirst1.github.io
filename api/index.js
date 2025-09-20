// api/index.js
// Fully working Vercel API without depending on InfinityFree fetch

const tmdbCache = {}; // In-memory TMDB cache
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h

// Hardcoded movie list (can update manually)
const movies = [
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
  },
  // Add more movies here manually
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

// Safe fetch JSON for TMDB
async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });
  }

  // Optional query filter
  const queryId = req.query.id;
  const queryTitle = req.query.title;

  let filteredMovies = movies;

  if (queryId) {
    filteredMovies = movies.filter(m => String(m.tmdb_id) === String(queryId));
  } else if (queryTitle) {
    filteredMovies = movies.filter(m => m.title.toLowerCase().includes(queryTitle.toLowerCase()));
  }

  // Fetch TMDB in parallel with caching
  const sections = { "Recently added": [] };
  const moviePromises = filteredMovies.map(async movie => {
    let tmdbData = {};

    if (movie.tmdb_id && movie.tmdb_id !== 0) {
      const cached = tmdbCache[movie.tmdb_id];
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        tmdbData = cached.data;
      } else {
        const resp = await fetchJSON(`https://api.themoviedb.org/3/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`);
        tmdbData = resp || {};
        tmdbCache[movie.tmdb_id] = { data: tmdbData, timestamp: Date.now() };
      }
    }

    const slug = slugify(movie.title || "none");
    return {
      title: movie.title || "none",
      link: `https://multimovies.city/movies/${slug}/`,
      date_or_year: tmdbData.release_date || "none",
      rating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : "none",
      original_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/original${tmdbData.poster_path}` : "none",
      tmdb_image: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : "none",
      src: movie.src && movie.src.length ? movie.src : ["none"],
      genre: movie.genre || "none"
    };
  });

  sections["Recently added"] = await Promise.all(moviePromises);

  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ok: true,
    page: 1,
    total: sections["Recently added"].length,
    sections
  });
}
