export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const fullRequestUrl = request.url;
    const marker = "?url=";
    const pos = fullRequestUrl.indexOf(marker);

    if (pos === -1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing ?url parameter",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract raw target URL (keep all query params)
    let rawTarget = fullRequestUrl.slice(pos + marker.length);

    // Clean whitespace (Edge strictness)
    rawTarget = rawTarget.trim();

    // 🔥 HARD VALIDATION (this fixes Invalid URL string)
    let targetUrl;
    try {
      targetUrl = new URL(rawTarget).href;
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid URL string (malformed target URL)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch target page
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html",
      },
    });

    const html = await res.text();

    // Extract iframe src
    const iframeMatch = html.match(
      /<iframe[^>]+src=["']([^"']+)["']/i
    );

    return new Response(
      JSON.stringify({
        success: true,
        source: targetUrl,
        iframe: iframeMatch ? iframeMatch[1] : null,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
