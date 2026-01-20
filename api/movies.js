// Vercel API Handler
// Fetches latest movies, gets details, adds TMDB IDs, returns clean JSON

const TMDB_API_KEY = d6a23baa52d45df26ba9b8f731b43d8e; // Set in Vercel env variables

export default async function handler(req, res) {
  try {
    const startTime = Date.now();
    
    // Step 1: Fetch latest movies list
    const latestResponse = await fetch('https://toonstream-api.ry4n.qzz.io/api/category/latest/movies');
    const latestData = await latestResponse.json();
    
    if (!latestData.success) {
      return res.status(500).json({ success: false, error: 'Failed to fetch latest movies' });
    }
    
    // Step 2: Filter only movies (exclude series)
    const movieItems = latestData.results.filter(item => 
      item.url.includes('/movies/')
    );
    
    // Step 3: Extract slugs
    const slugs = movieItems.map(item => {
      const match = item.url.match(/\/movies\/([^\/]+)\/?$/);
      return match ? match[1] : null;
    }).filter(Boolean);
    
    // Step 4: Fetch details for each movie
    const movies = [];
    
    for (const slug of slugs.slice(0, 10)) { // Limit to 10 movies
      try {
        const detailsResponse = await fetch(`https://toon-stream-api.vercel.app/movies/${slug}`);
        const detailsData = await detailsResponse.json();
        
        if (detailsData.success && detailsData.data) {
          const movie = normalizeMovie(detailsData.data, slug);
          
          // Step 5: Add TMDB ID
          if (TMDB_API_KEY) {
            movie.tmdb_id = await getTMDBId(movie.title, movie.year);
          }
          
          movies.push(movie);
        }
      } catch (error) {
        console.error(`Failed to fetch details for ${slug}:`, error.message);
      }
    }
    
    // Step 6: Return clean JSON
    res.status(200).json({
      success: true,
      count: movies.length,
      fetchedAt: new Date().toISOString(),
      processingTime: `${Date.now() - startTime}ms`,
      movies
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Normalize and clean movie data
function normalizeMovie(data, slug) {
  const details = data.movieDetails;
  const videoOptions = data.videoOptions;
  
  return {
    toon_post_id: data.postId,
    slug: slug,
    title: details.title,
    tmdb_id: null, // Will be filled later
    
    // Convert poster to w500 size
    poster: details.posterImage.replace('/w185/', '/w500/'),
    
    year: details.year,
    duration: details.duration,
    
    // Convert rating to number
    rating: parseFloat(details.rating) || 0,
    
    // Extract genre names only (simple text array)
    genres: details.genres
      .map(g => g.name)
      .filter(name => !name.includes('Movies') && !name.includes('Cartoon')),
    
    // Extract director names
    directors: details.directors.map(d => d.name),
    
    // Extract cast names (limit to top 5)
    cast: details.cast.slice(0, 5).map(c => c.name),
    
    // Extract tag names
    tags: details.tags.map(t => t.name),
    
    description: details.description,
    
    // Clean server names
    servers: cleanServers(videoOptions.servers),
    
    // Keep iframes
    iframes: videoOptions.iframes.map(iframe => ({
      optionId: iframe.optionId,
      src: iframe.src,
      active: iframe.active
    }))
  };
}

// Clean up messy server names
function cleanServers(serverData) {
  if (!serverData || !serverData[0]) return [];
  
  return serverData[0].servers.map(server => ({
    number: parseInt(server.serverNumber),
    name: server.serverName.split('-')[0].trim(),
    targetId: server.targetId,
    active: server.active
  }));
}

// Get TMDB ID by searching title + year
async function getTMDBId(title, year) {
  if (!TMDB_API_KEY) return null;
  
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
  } catch (error) {
    console.error('TMDB search failed:', error.message);
  }
  
  return null;
}
