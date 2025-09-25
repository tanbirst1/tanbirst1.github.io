// api/episodes.js
// Vercel Serverless Function: scrape episodes without dependencies

export default async function handler(req, res) {
  try {
    // Get ?page= from query (default = 2)
    const { page } = req.query;
    const pageNum = page ? parseInt(page, 10) : 2;

    // Target URL
    const url = `https://multimovies.mobi/episodes/page/${pageNum}/`;

    // Fetch HTML
    const html = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScraperBot/1.0)"
      }
    }).then(r => r.text());

    // Regex to capture <article class="item se episodes"> ... </article>
    const articleRegex = /<article class="item se episodes"[\s\S]*?<\/article>/g;
    const matches = html.match(articleRegex) || [];

    const episodes = matches.map(block => {
      const image = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
      const title = (block.match(/<h3><a[^>]*>(.*?)<\/a><\/h3>/) || [])[1] || "";
      const link = (block.match(/<h3><a href="([^"]+)"/) || [])[1] || "";
      const episodeInfo = (block.match(/<span>(S\d+ E\d+.*?)<\/span>/) || [])[1] || "";
      const serie = (block.match(/<span class="serie">(.*?)<\/span>/) || [])[1] || "";

      return {
        title: decodeHtml(title),
        link,
        image,
        episodeInfo,
        serie: decodeHtml(serie)
      };
    });

    res.status(200).json({
      page: pageNum,
      count: episodes.length,
      episodes
    });

  } catch (err) {
    res.status(500).json({ error: "Scraping failed", details: err.message });
  }
}

// Decode HTML entities (like &#215;)
function decodeHtml(html) {
  return html
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
