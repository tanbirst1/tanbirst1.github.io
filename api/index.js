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

// API handler
export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY)
    return res.status(500).json({ ok: false, error: "TMDB_API_KEY missing" });

  const tmdb_id = req.query.id;
  const type = req.query.type === "tv" ? "tv" : "movie"; // default movie
  const fields = req.query.fields || "all";
  const seasonNo = req.query.season ? req.query.season.toLowerCase() : "1";
  const episodeNo = req.query.episode ? req.query.episode.toLowerCase() : "all";

  if (!tmdb_id)
    return res.status(400).json({ ok: false, error: "Missing id parameter" });

  // Cache key
  const cacheKey = `${type}_${tmdb_id}_${seasonNo}_${episodeNo}`;
  if (
    tmdbCache[cacheKey] &&
    Date.now() - tmdbCache[cacheKey].timestamp < CACHE_TTL
  ) {
    const cached = tmdbCache[cacheKey].data;
    return res.status(200).json({
      ok: true,
      data: await filterFields(
        cached,
        fields,
        TMDB_API_KEY,
        type,
        seasonNo,
        episodeNo
      ),
    });
  }

  let tmdbData = null;

  // Fetch logic
  if (type === "tv") {
    if (seasonNo === "all") {
      // Fetch show -> all seasons
      const showData = await fetchJSON(
        `https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      if (showData && showData.seasons) {
        const allSeasons = [];
        for (const s of showData.seasons) {
          const seasonData = await fetchJSON(
            `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${s.season_number}?api_key=${TMDB_API_KEY}&language=en-US`
          );
          if (seasonData) allSeasons.push(seasonData);
        }
        tmdbData = { ...showData, all_seasons: allSeasons };
      }
    } else if (episodeNo === "all") {
      // Fetch full season
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

  // Cache
  tmdbCache[cacheKey] = { data: tmdbData, timestamp: Date.now() };

  res.status(200).json({
    ok: true,
    data: await filterFields(
      tmdbData,
      fields,
      TMDB_API_KEY,
      type,
      seasonNo,
      episodeNo
    ),
  });
}

// Filter fields
async function filterFields(data, fields, TMDB_API_KEY, type, seasonNo, episodeNo) {
  // If all fields
  if (!fields || fields === "all") return data;

  const fieldList = fields.split(",").map((f) => f.trim().toLowerCase());
  const result = {};

  // Handle seasons + episodes specially
  if (type === "tv") {
    if (seasonNo === "all") {
      // Return all seasons with episodes
      result.seasons = data.all_seasons.map((s) => ({
        season: s.season_number,
        name: s.name,
        poster: s.poster_path
          ? `https://image.tmdb.org/t/p/w500${s.poster_path}`
          : "none",
        episodes: s.episodes
          ? s.episodes.map((ep) => ({
              episode: ep.episode_number,
              title: ep.name,
              overview: ep.overview,
              poster: ep.still_path
                ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
                : "none",
            }))
          : [],
      }));
      return result;
    }

    if (episodeNo === "all" && data.episodes) {
      // Return season with all episodes
      result.season = data.season_number;
      result.episodes = data.episodes.map((ep) => ({
        episode: ep.episode_number,
        title: ep.name,
        overview: ep.overview,
        poster: ep.still_path
          ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
          : "none",
      }));
      return result;
    }
  }

  // Normal single item flow
  for (const f of fieldList) {
    switch (f) {
      case "poster":
        result.poster =
          data.poster_path || data.still_path
            ? `https://image.tmdb.org/t/p/w500${
                data.poster_path || data.still_path
              }`
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
      case "year":
        result.year =
          data.release_date || data.first_air_date || data.air_date || "none";
        break;
      case "id":
        result.id = data.id || "none";
        break;
      default:
        result[f] = data[f] !== undefined ? data[f] : "none";
    }
  }

  return result;
}
