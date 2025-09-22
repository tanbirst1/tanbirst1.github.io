// api/index.js
// Vercel API: fetch TMDB data with fields selection and caching

const tmdbCache = {}; // In-memory TMDB cache
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Safe fetch JSON
async function fetchJSON(url, timeout = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
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

// Helper: slugify movie title
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

// API handler
export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY)
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });

  const tmdb_id = req.query.id;
  const fields = req.query.fields || "all"; // e.g., "poster,year,rating,cast"

  if (!tmdb_id)
    return res.status(400).json({ ok: false, error: "Missing id parameter" });

  // 1️⃣ Check cache
  if (
    tmdbCache[tmdb_id] &&
    Date.now() - tmdbCache[tmdb_id].timestamp < CACHE_TTL
  ) {
    const cached = tmdbCache[tmdb_id].data;
    return res
      .status(200)
      .json({ ok: true, data: await filterFields(cached, fields, TMDB_API_KEY) });
  }

  // 2️⃣ Fetch TMDB details
  const tmdbData = await fetchJSON(
    `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
  );
  if (!tmdbData)
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch TMDB data" });

  // 3️⃣ Store cache
  tmdbCache[tmdb_id] = { data: tmdbData, timestamp: Date.now() };

  // 4️⃣ Return filtered or all data
  res
    .status(200)
    .json({ ok: true, data: await filterFields(tmdbData, fields, TMDB_API_KEY) });
}

// Helper: select fields or return all
async function filterFields(data, fields, TMDB_API_KEY) {
  if (!fields || fields === "all") return data;

  const fieldList = fields.split(",").map((f) => f.trim().toLowerCase());
  const result = {};

  // Check if cast is requested
  let fetchCredits = false;
  if (fieldList.includes("cast")) fetchCredits = true;

  // Fetch credits once if needed
  let credits = null;
  if (fetchCredits) {
    credits = await fetchJSON(
      `https://api.themoviedb.org/3/movie/${data.id}/credits?api_key=${TMDB_API_KEY}&language=en-US`
    );
  }

  for (const f of fieldList) {
    switch (f) {
      case "poster":
        result.poster = data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : "none";
        break;
      case "tmdb_image":
        result.tmdb_image = data.poster_path
          ? `https://image.tmdb.org/t/p/original${data.poster_path}`
          : "none";
        break;
      case "year":
        result.year = data.release_date || "none";
        break;
      case "rating":
        result.rating = data.vote_average
          ? data.vote_average.toFixed(1)
          : "none";
        break;
      case "title":
        result.title = data.title || "none";
        break;
      case "overview":
        result.overview = data.overview || "none";
        break;
      case "genres":
        result.genres =
          data.genres && Array.isArray(data.genres)
            ? data.genres.map((g) => g.name).join(", ")
            : "none";
        break;
      case "runtime":
        result.runtime = data.runtime || "none";
        break;
      case "release_date":
        result.release_date = data.release_date || "none";
        break;
      case "id":
        result.id = data.id || "none";
        break;
      case "cast":
        if (credits && credits.cast) {
          result.cast = credits.cast.slice(0, 10).map((c) => ({
            name: c.name,
            character: c.character,
            profile: c.profile_path
              ? `https://image.tmdb.org/t/p/w300${c.profile_path}`
              : "none",
          }));
        } else {
          result.cast = "none";
        }
        break;
      case "all":
        Object.assign(result, data);
        break;
      default:
        result[f] = data[f] !== undefined ? data[f] : "none";
    }
  }

  return result;
}
