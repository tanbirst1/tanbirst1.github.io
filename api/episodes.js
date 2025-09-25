// api/episodes.js
// Vercel API: Search TMDB for TV episodes by name or tmdb:id
// Supports page ranges (?page=1-3) and slug filtering

const API_KEY = process.env.TMDB_API_KEY; // set in Vercel env vars

export default async function handler(req, res) {
  try {
    const { name, page = "1" } = req.query;
    if (!name) {
      return res.status(400).json({ error: "Missing ?name=" });
    }

    // Handle tmdb:1234 direct ID
    let tmdbId = null;
    let slugName = slugify(name);

    if (name.startsWith("tmdb:")) {
      tmdbId = name.replace("tmdb:", "").trim();
    } else {
      // Search TMDB TV
      const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(
        name
      )}`;
      const searchRes = await fetch(searchUrl).then((r) => r.json());

      if (!searchRes.results || searchRes.results.length === 0) {
        return res.status(404).json({ error: "No TV found" });
      }

      // Filter by slug to get best match
      const match = searchRes.results.find(
        (r) => slugify(r.name) === slugName
      ) || searchRes.results[0];

      tmdbId = match.id;
    }

    // Handle multiple pages (?page=1-3)
    const pageRange = parsePageRange(page);

    let episodes = [];

    for (let p of pageRange) {
      const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${p}?api_key=${API_KEY}`;
      const data = await fetch(url).then((r) => r.json());

      if (data.episodes) {
        episodes.push(
          ...data.episodes.map((ep) => ({
            season: data.season_number,
            episode: ep.episode_number,
            title: ep.name,
            air_date: ep.air_date || "",
            overview: ep.overview || ""
          }))
        );
      }
    }

    res.status(200).json({
      tmdbId,
      slug: slugName,
      total: episodes.length,
      episodes
    });
  } catch (err) {
    res.status(500).json({ error: "Failed", details: err.message });
  }
}

// Turn string into URL-friendly slug
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Parse ?page=start-end or single number
function parsePageRange(input) {
  if (input.includes("-")) {
    const [start, end] = input.split("-").map((n) => parseInt(n, 10));
    let arr = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }
  return [parseInt(input, 10)];
}
