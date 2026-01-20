export const config = {
  runtime: "edge",
};

import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// ----- FIXED BASE URL (as you asked) -----
const BASE_URL = "https://toonstream.one";

// ----- HELPERS (kept same logic) -----
function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  return imgSrc.startsWith("//") ? "https:" + imgSrc : imgSrc;
}

function extractMetadata(classList) {
  const metadata = {
    categories: [],
    tags: [],
    cast: [],
    directors: [],
    countries: [],
    letters: null,
    year: null,
  };

  if (!classList) return metadata;

  const matchPush = (regex, arr, replaceFrom) => {
    const matches = classList.match(regex);
    if (matches) {
      matches.forEach((m) =>
        arr.push(m.replace(replaceFrom, "").replace(/-/g, " "))
      );
    }
  };

  matchPush(/category-[\w-]+/g, metadata.categories, "category-");
  matchPush(/tag-[\w-]+/g, metadata.tags, "tag-");
  matchPush(/cast-[\w-]+/g, metadata.cast, "cast-");
  matchPush(/directors-[\w-]+/g, metadata.directors, "directors-");
  matchPush(/country-[\w-]+/g, metadata.countries, "country-");

  const letterMatch = classList.match(/letters-([\w-]+)/);
  if (letterMatch) metadata.letters = letterMatch[1];

  const yearMatch = classList.match(/annee-(\d+)/);
  if (yearMatch) metadata.year = yearMatch[1];

  return metadata;
}

// ----- SCRAPE MOVIES (same selectors) -----
function scrapeMovies($) {
  const movies = [];

  $(".section.movies .post-lst li").each((_, element) => {
    const $elem = $(element);
    const $link = $elem.find(".lnk-blk");
    const $img = $elem.find("img");
    const $title = $elem.find(".entry-title");

    movies.push({
      id: ($elem.attr("id") || "").replace(/^post-/, ""),
      title: $title.text().trim(),
      url: $link.attr("href") || "",
      poster: extractImageUrl($img.attr("src")),
    });
  });

  return movies;
}

// ----- PAGINATION (same logic) -----
function scrapePagination($) {
  let currentPage = 1;
  let totalPages = 1;
  let hasNextPage = false;
  let hasPrevPage = false;

  $(".navigation.pagination .nav-links a").each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    if ($el.hasClass("current")) {
      currentPage = parseInt(text) || 1;
    }

    if (text === "NEXT") hasNextPage = true;
    if (text === "PREV" || text === "PREVIOUS") hasPrevPage = true;

    if (!isNaN(text) && text !== "...") {
      totalPages = Math.max(totalPages, parseInt(text));
    }
  });

  return {
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
}

async function scrapeMoviesPage(pageNumber = 1) {
  const moviesUrl = `${BASE_URL}/movies/page/${pageNumber}/`;

  const res = await fetch(moviesUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const results = scrapeMovies($);
  const pagination = scrapePagination($);

  return {
    success: true,
    category: "anime-movies",
    categoryName: "Anime Movies",
    results,
    pagination,
  };
}

// ----- EDGE API HANDLER -----
export default async function handler(request) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page")) || 1);

  try {
    const data = await scrapeMoviesPage(page);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Server error",
        message: err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
