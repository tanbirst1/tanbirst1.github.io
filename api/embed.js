export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing ?url parameter (URL must be encoded)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Decode encoded URL safely
    targetUrl = decodeURIComponent(targetUrl);

    // Fetch WITHOUT auto-follow redirects
    const res = await fetch(targetUrl, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html",
      },
    });

    // Handle single redirect manually
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        targetUrl = location;
      }
    }

    // Fetch final page
    const finalRes = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html",
      },
    });

    const html = await finalRes.text();

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
