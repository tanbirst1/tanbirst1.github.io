// Vercel API Handler
// Fetches latest movies, gets details, adds TMDB IDs, returns clean JSON

const TMDB_API_KEY = "d6a23baa52d45df26ba9b8f731b43d8e";

// Remote baseurl.txt
const BASEURL_TXT =
  "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt";

// Fetch base URL dynamically
async function getBaseUrl() {
  const res = await fetch(BASEURL_TXT);
  const text = await res.text();
  return text.trim();
}

export default async function handler(req, res) {
  try {
    const startTime = Date.now();

    // Page number (default = 1)
    const page = parseInt(req.query.page || "1", 10);

    // Get base url
    const baseUrl = await getBaseUrl();

    // Step 1: Fetch latest movies (NEW API)
    const listUrl =
      `https://toon-stream-api.vercel.app/api/s_movies` +
      `?url=${encodeURIComponent(baseUrl + "/movies/")}` +
      `&page=${page}`;

    const latestResponse = await fetch(listUrl);
    const latestData = await latestResponse.json();

    if (!latestData.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to fetch latest movies",
      });
    }

    // Step 2: Filter only movies (exclude series)
    const movieItems = latestData.results.filter(item =>
      item.url.includes("/movies/")
    );

    // Step 3: Extract slugs
    const slugs = movieItems
      .map(item => {
        const match = item.url.match(/\/movies\/([^\/]+)\/?$/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    // Step 4: Fetch details
    const movies = [];

    for (const slug of slugs.slice(0, 10)) {
      try {
        const detailsResponse = await fetch(
          `https://toon-stream-api.vercel.app/movies/${slug}`
        );
        const detailsData = await detailsResponse.json();

        if (detailsData.success && detailsData.data) {
          const movie = normalizeMovie(detailsData.data, slug);

          // Step 5: Add TMDB ID
          movie.tmdb_id = await getTMDBId(movie.title, movie.year);

          movies.push(movie);
        }
      } catch (err) {
        console.error(`Failed slug ${slug}:`, err.message);
      }
    }

    // Step 6: Response
    res.status(200).json({
      success: true,
      page,
      count: movies.length,
      fetchedAt: new Date().toISOString(),
      processingTime: `${Date.now() - startTime}ms`,
      movies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Normalize and clean movie data
function normalizeMovie(data, slug) {
  const details = data.movieDetails;
  const videoOptions = data.videoOptions;

  return {
    toon_post_id: data.postId,
    slug,
    title: details.title,
    tmdb_id: null,

    poster: details.posterImage.replace("/w185/", "/w500/"),
    
    // Backdrop images - keep original size
    backdrop: {
      header: details.backdrop?.header || null,
      footer: details.backdrop?.footer || null
    },

    year: details.year,
    duration: details.duration,
    rating: parseFloat(details.rating) || 0,

    genres: details.genres
      .map(g => g.name)
      .filter(
        name => !name.includes("Movies") && !name.includes("Cartoon")
      ),

    directors: details.directors.map(d => d.name),
    cast: details.cast.slice(0, 5).map(c => c.name),
    tags: details.tags.map(t => t.name),

    description: details.description,

    servers: cleanServers(videoOptions.servers),

    iframes: videoOptions.iframes.map(i => ({
      optionId: i.optionId,
      src: i.src,
      active: i.active,
    })),
  };
}

// Clean server names
function cleanServers(serverData) {
  if (!serverData || !serverData[0]) return [];

  return serverData[0].servers.map(server => ({
    number: parseInt(server.serverNumber),
    name: server.serverName.split("-")[0].trim(),
    targetId: server.targetId,
    active: server.active,
  }));
}

// Get TMDB ID
async function getTMDBId(title, year) {
  try {
    const url =
      `https://api.themoviedb.org/3/search/movie` +
      `?api_key=${TMDB_API_KEY}` +
      `&query=${encodeURIComponent(title)}` +
      `&year=${year}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.results && data.results.length) {
      return data.results[0].id;
    }
  } catch (e) {
    console.error("TMDB error:", e.message);
  }

  return null;
}
