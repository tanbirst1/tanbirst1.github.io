import fetch from "node-fetch";
import cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    // RAW request URL (string only, no parsing)
    const raw = req.url;

    // Find "?url=" manually
    const key = "?url=";
    const pos = raw.indexOf(key);

    if (pos === -1) {
      return res.status(400).json({
        success: false,
        error: "Missing ?url parameter",
      });
    }

    // EVERYTHING after url= is treated as TEXT
    const targetUrl = raw.slice(pos + key.length);

    // Safety check (string only)
    if (!targetUrl.startsWith("http")) {
      return res.status(400).json({
        success: false,
        error: "Invalid target URL format",
      });
    }

    // Fetch target page
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Accept: "text/html",
      },
    });

    const html = await response.text();

    // Parse HTML
    const $ = cheerio.load(html);

    // Extract iframe
    const iframe =
      $("iframe").first().attr("src") || null;

    return res.status(200).json({
      success: true,
      source: targetUrl,
      iframe,
    });
  } catch (err) {
    // ABSOLUTE crash protection
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: err.message,
    });
  }
}
