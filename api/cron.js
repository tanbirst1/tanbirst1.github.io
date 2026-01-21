export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const targetURL = "https://blackseal.xyz/test/auto/m_upload.php";

  try {
    const res = await fetch(targetURL, {
      method: "GET",
      headers: {
        // ---- Human-like headers ----
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
    });

    const text = await res.text();

    return new Response(
      JSON.stringify({
        success: true,
        status: res.status,
        triggered: true,
        target: targetURL,
        timestamp: new Date().toISOString(),
        responsePreview: text.slice(0, 500), // prevents overload
      }),
      {
        status: 200,
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
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
