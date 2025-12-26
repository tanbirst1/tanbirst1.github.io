export default async function handler(req, res) {
  try {
    const TMDB_KEY = "9b4fe13859abd1c5439230dcb09bfbbd";
    const id = req.query.id;

    if (!id) return res.status(400).json({ error: "TMDB ID required" });

    const series = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}`).then(r => r.json());
    if (!series.id) return res.status(404).json({ error: "Invalid TMDB ID" });

    let seasons = [];

    for (const s of series.seasons) {
      if (s.season_number === 0) continue;

      const season = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s.season_number}?api_key=${TMDB_KEY}`).then(r => r.json());

      seasons.push({
        season_number: season.season_number,
        image: season.poster_path ? `https://image.tmdb.org/t/p/original${season.poster_path}` : null,
        episodes: season.episodes.map(e => ({
          episode_number: e.episode_number,
          title: e.name,
          image: e.still_path ? `https://image.tmdb.org/t/p/original${e.still_path}` : null,
          meta: {
            overview: e.overview || null,
            rating: e.vote_average ? Math.round(e.vote_average * 10) : null,
            runtime: e.runtime || null
          }
        }))
      });
    }

    return res.json({
      tmdb_id: series.id,
      title: series.name,
      overview: series.overview || null,
      rating: series.vote_average ? Math.round(series.vote_average * 10) : null,
      release_date: series.first_air_date || null,
      genres: series.genres.map(g => g.id),
      images: [
        ...(series.poster_path ? [`https://image.tmdb.org/t/p/original${series.poster_path}`] : []),
        ...(series.backdrop_path ? [`https://image.tmdb.org/t/p/original${series.backdrop_path}`] : [])
      ],
      seasons
    });

  } catch (e) {
    return res.status(500).json({ error: "Server crashed", message: e.message });
  }
}
