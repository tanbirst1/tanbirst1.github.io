export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const reqUrl = request.url;

    // HARD FIX: extract everything AFTER ?url=
    const marker = "?url=";
    const index = reqUrl.indexOf(marker);

    if (index === -1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing ?url parameter",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // This preserves FULL URL including nested query params
    const targetUrl = reqUrl.substring(index + marker.length);

    // Fetch page (no redirect loop handling needed now)
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
