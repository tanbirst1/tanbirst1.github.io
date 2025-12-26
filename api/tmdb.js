import fetch from "node-fetch";

const API = "https://api.themoviedb.org/3";
const KEY = "9b4fe13859abd1c5439230dcb09bfbbd";

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "TMDB ID required" });

  const series = await (await fetch(`${API}/tv/${id}?api_key=${KEY}`)).json();
  if (!series.id) return res.status(404).json({ error: "Invalid TMDB ID" });

  let seasons = [];
  for (const s of series.seasons) {
    const season = await (await fetch(`${API}/tv/${id}/season/${s.season_number}?api_key=${KEY}`)).json();
    seasons.push(season);
  }

  res.json({
    tmdb_id: series.id,
    title: series.name,
    overview: series.overview,
    rating: Math.round(series.vote_average * 10),
    release_date: series.first_air_date,
    genres: series.genres,
    images: {
      poster: `https://image.tmdb.org/t/p/original${series.poster_path}`,
      backdrop: `https://image.tmdb.org/t/p/original${series.backdrop_path}`
    },
    seasons
  });
}
