import fetch from "node-fetch";
import cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // FULL raw URL (important)
    const fullUrl = req.url;

    // Extract everything after ?url=
    const marker = "?url=";
    const index = fullUrl.indexOf(marker);

    if (index === -1) {
      return res.status(400).json({
        success: false,
        error: "Missing ?url parameter",
      });
    }

    // This preserves nested query params
    const targetUrl = fullUrl.substring(index + marker.length);

    // Validate URL manually
    try {
      new URL(targetUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid URL string",
      });
    }

    // Fetch HTML
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html",
      },
      redirect: "follow",
    });

    const html = await response.text();

    // Load cheerio
    const $ = cheerio.load(html);

    // Extract iframe src
    const iframeSrc = $("iframe").first().attr("src") || null;

    return res.status(200).json({
      success: true,
      source: targetUrl,
      iframe: iframeSrc,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
