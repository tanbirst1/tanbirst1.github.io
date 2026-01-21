import https from "https";
import { URL } from "url";

export default async function handler(req, res) {
  const TARGET = "https://blackseal.xyz/test/auto/m_upload.php";

  const url = new URL(TARGET);

  // Custom HTTPS agent (IMPORTANT)
  const agent = new https.Agent({
    rejectUnauthorized: false, // <- THIS FIXES fetch failed
    keepAlive: true,
  });

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: "GET",
    agent,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    timeout: 30000,
  };

  try {
    const data = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk.toString();
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
          });
        });
      });

      request.on("error", reject);
      request.on("timeout", () => {
        request.destroy();
        reject(new Error("timeout"));
      });

      request.end();
    });

    // Always return 200 to cron services
    return res.status(200).json({
      success: true,
      triggered: true,
      target: TARGET,
      remoteStatus: data.status,
      timestamp: new Date().toISOString(),
      preview: data.body.slice(0, 500), // safe preview
    });

  } catch (err) {
    // Even on error, keep API alive
    return res.status(200).json({
      success: false,
      error: err.message || "request_failed",
      target: TARGET,
      timestamp: new Date().toISOString(),
    });
  }
}
