export default async function handler(req, res) {
  try {
    const TMDB_KEY = "9b4fe13859abd1c5439230dcb09bfbbd";
    const id = req.query.id;

    if (!id) {
      return res.status(400).json({ error: "TMDB ID required" });
    }

    const series = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}`).then(r => r.json());

    if (!series.id) {
      return res.status(404).json({ error: "Invalid TMDB ID" });
    }

    let seasons = [];

    for (let s of series.seasons) {
      const season = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s.season_number}?api_key=${TMDB_KEY}`).then(r => r.json());
      seasons.push(season);
    }

    return res.json({
      tmdb_id: series.id,
      title: series.name,
      overview: series.overview,
      rating: Math.round(series.vote_average * 10),
      release_date: series.first_air_date,
      genres: series.genres,
      images: {
        poster: series.poster_path ? `https://image.tmdb.org/t/p/original${series.poster_path}` : null,
        backdrop: series.backdrop_path ? `https://image.tmdb.org/t/p/original${series.backdrop_path}` : null
      },
      seasons
    });

  } catch (e) {
    return res.status(500).json({ error: "Server crashed", message: e.message });
  }
}
