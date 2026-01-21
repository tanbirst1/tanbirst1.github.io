export default async function handler(req, res) {
  const TARGET = "https://blackseal.xyz/test/auto/m_upload.php";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(TARGET, {
      method: "GET",
      headers: {
        // Human-like browser headers
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await response.text();

    return res.status(200).json({
      success: true,
      triggered: true,
      status: response.status,
      target: TARGET,
      timestamp: new Date().toISOString(),
      preview: text.substring(0, 300), // prevents overload
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.name === "AbortError"
        ? "timeout"
        : err.message || "fetch_failed",
      timestamp: new Date().toISOString(),
    });
  }
}
