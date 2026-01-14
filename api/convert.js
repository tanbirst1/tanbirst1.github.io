export default async function handler(req, res) {

  const TMDB_KEY = "d6a23baa52d45df26ba9b8f731b43d8e";
  const inputUrl = req.query.url;
  if(!inputUrl) return res.json({error:"url parameter required"});

  const toon = await fetch(inputUrl).then(r=>r.json());
  const movie = toon.data.movieDetails;

  const title = movie.title;
  const year = movie.year;
  const tmdbSearch = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`).then(r=>r.json());

  const tmdb = tmdbSearch.results[0];
  if(!tmdb) return res.json({error:"TMDB NOT FOUND"});

  const detail = await fetch(`https://api.themoviedb.org/3/movie/${tmdb.id}?api_key=${TMDB_KEY}`).then(r=>r.json());

  res.json({
    tmdb_id: detail.id,
    title: detail.title,
    overview: detail.overview,
    rating: Math.round(detail.vote_average),
    release_date: detail.release_date,
    poster: `https://image.tmdb.org/t/p/original${detail.poster_path}`,
    backdrop: `https://image.tmdb.org/t/p/original${detail.backdrop_path}`,
    genre_id: detail.genres.map(g=>g.id).join(","),
    src: toon.data.videoOptions.iframes.map(i=>i.src)
  });
}
