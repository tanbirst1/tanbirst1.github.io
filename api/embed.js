export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Get target URL (supports URLs with their own query params)
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing ?url parameter",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the embed page
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to fetch target page",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();

    // Extract iframe src (real video)
    const iframeMatch = html.match(
      /<iframe[^>]+src=["']([^"']+)["']/i
    );

    const iframeUrl = iframeMatch ? iframeMatch[1] : null;

    return new Response(
      JSON.stringify({
        success: true,
        source: targetUrl,
        video_iframe: iframeUrl,
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
