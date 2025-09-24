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

// Helper: slugify
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
  const type = req.query.type === "tv" ? "tv" : "movie"; // default movie
  const fields = req.query.fields || "all";
  const seasonNo = req.query.season ? req.query.season.toLowerCase() : "1"; // allow "all"
  const episodeNo = req.query.episode ? req.query.episode.toLowerCase() : "all"; // allow "all"

  if (!tmdb_id)
    return res.status(400).json({ ok: false, error: "Missing id parameter" });

  // 1️⃣ Cache key
  const cacheKey = `${type}_${tmdb_id}_${seasonNo}_${episodeNo}`;
  if (
    tmdbCache[cacheKey] &&
    Date.now() - tmdbCache[cacheKey].timestamp < CACHE_TTL
  ) {
    const cached = tmdbCache[cacheKey].data;
    return res
      .status(200)
      .json({ ok: true, data: await filterFields(cached, fields, TMDB_API_KEY, type, seasonNo, episodeNo) });
  }

  let tmdbData = null;

  // 2️⃣ Fetch logic
  if (type === "tv") {
    if (seasonNo === "all") {
      // Fetch TV show with all seasons
      tmdbData = await fetchJSON(
        `https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
      );

      if (tmdbData && tmdbData.seasons) {
        // Fetch all episodes for all seasons
        const seasons = [];
        for (const s of tmdbData.seasons) {
          const seasonData = await fetchJSON(
            `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${s.season_number}?api_key=${TMDB_API_KEY}&language=en-US`
          );
          if (seasonData) {
            seasons.push(seasonData);
          }
        }
        tmdbData = { ...tmdbData, all_seasons: seasons };
      }
    } else if (episodeNo === "all") {
      // Fetch a full season with all episodes
      tmdbData = await fetchJSON(
        `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${seasonNo}?api_key=${TMDB_API_KEY}&language=en-US`
      );
    } else {
      // Fetch single episode
      tmdbData = await fetchJSON(
        `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${seasonNo}/episode/${episodeNo}?api_key=${TMDB_API_KEY}&language=en-US`
      );
    }
  } else {
    // Movie
    tmdbData = await fetchJSON(
      `https://api.themoviedb.org/3/${type}/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
    );
  }

  if (!tmdbData || tmdbData.success === false) {
    return res.status(404).json({
      ok: false,
      error: "Not found",
      details: tmdbData?.status_message || "Invalid TMDB id/type",
    });
  }

  // 3️⃣ Cache store
  tmdbCache[cacheKey] = { data: tmdbData, timestamp: Date.now() };

  // 4️⃣ Response
  res.status(200).json({
    ok: true,
    data: await filterFields(tmdbData, fields, TMDB_API_KEY, type, seasonNo, episodeNo),
  });
}

// Helper: select fields or return all
async function filterFields(data, fields, TMDB_API_KEY, type, seasonNo, episodeNo) {
  if (!fields || fields === "all") {
    // Auto-add poster for episodes
    if (type === "tv") {
      if (episodeNo !== "all" && episodeNo !== "none" && data.still_path) {
        data.poster = `https://image.tmdb.org/t/p/w500${data.still_path}`;
      }
    }
    return data;
  }

  const fieldList = fields.split(",").map((f) => f.trim().toLowerCase());
  const result = {};

  // Check if cast is requested
  let fetchCredits = false;
  if (fieldList.includes("cast")) fetchCredits = true;

  // Fetch credits if needed
  let credits = null;
  if (fetchCredits) {
    let url;
    if (type === "tv" && episodeNo !== "all" && seasonNo !== "all") {
      url = `https://api.themoviedb.org/3/tv/${data.show_id || data.id}/season/${seasonNo}/episode/${episodeNo}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
    } else {
      url = `https://api.themoviedb.org/3/${type}/${data.id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=en-US`;
    }
    credits = await fetchJSON(url);
  }

  for (const f of fieldList) {
    switch (f) {
      case "poster":
        if (type === "tv") {
          if (episodeNo !== "all" && seasonNo !== "all") {
            result.poster = data.still_path
              ? `https://image.tmdb.org/t/p/w500${data.still_path}`
              : "none";
          } else {
            result.poster = data.poster_path
              ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
              : "none";
          }
        } else {
          result.poster = data.poster_path
            ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
            : "none";
        }
        break;
      case "tmdb_image":
        result.tmdb_image =
          data.poster_path || data.still_path
            ? `https://image.tmdb.org/t/p/original${data.poster_path || data.still_path}`
            : "none";
        break;
      case "year":
        result.year = data.release_date || data.first_air_date || data.air_date || "none";
        break;
      case "rating":
        result.rating = data.vote_average
          ? data.vote_average.toFixed(1)
          : "none";
        break;
      case "title":
        result.title =
          data.title ||
          data.name ||
          (data.episode_number ? `Episode ${data.episode_number}: ${data.name}` : "none");
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
        result.runtime =
          data.runtime || data.episode_run_time?.[0] || data.runtime || "none";
        break;
      case "release_date":
        result.release_date =
          data.release_date || data.first_air_date || data.air_date || "none";
        break;
      case "id":
        result.id = data.id || "none";
        break;
      case "season":
        result.season = seasonNo;
        break;
      case "episode":
        result.episode = episodeNo;
        break;
      case "cast":
        if (credits && credits.credits?.cast) {
          result.cast = credits.credits.cast.slice(0, 10).map((c) => ({
            name: c.name,
            character: c.character,
            profile: c.profile_path
              ? `https://image.tmdb.org/t/p/w300${c.profile_path}`
              : "none",
          }));
        } else if (credits && credits.cast) {
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

  // Auto poster if episode
  if (type === "tv" && episodeNo !== "all" && data.still_path && !result.poster) {
    result.poster = `https://image.tmdb.org/t/p/w500${data.still_path}`;
  }

  return result;
}
