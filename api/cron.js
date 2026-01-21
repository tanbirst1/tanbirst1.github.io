import https from "https";
import { URL } from "url";

export default async function handler(req, res) {
  const TARGET = "https://blackseal.xyz/test/auto/m_upload.php";

  const url = new URL(TARGET);

  const agent = new https.Agent({
    rejectUnauthorized: false, // REQUIRED for InfinityFree
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
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    timeout: 30000,
  };

  let body = "";
  let remoteStatus = 0;
  let error = null;

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(options, (resp) => {
        remoteStatus = resp.statusCode;
        let data = "";

        resp.on("data", (chunk) => (data += chunk.toString()));
        resp.on("end", () => resolve(data));
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });

      req.end();
    });

    body = result;
  } catch (e) {
    error = e.message;
  }

  // 🔒 NEVER CRASH — ALWAYS 200
  res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");

  res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Auto Sync Monitor</title>
<meta http-equiv="refresh" content="30">
<style>
body {
  background:#0b0b0b;
  color:#eaeaea;
  font-family: Consolas, monospace;
  padding:20px;
}
.ok { color:#00ff88; }
.err { color:#ff5555; }
.dim { color:#888; }
.box {
  background:#111;
  border:1px solid #222;
  padding:15px;
  margin-top:15px;
  white-space:pre-wrap;
  overflow:auto;
}
.header {
  font-size:18px;
  margin-bottom:10px;
}
small { color:#666; }
</style>
</head>

<body>

<div class="header">
  <span class="${error ? "err" : "ok"}">
    HTTP 200 ✔ Service Alive
  </span>
</div>

<div class="dim">
Target: ${TARGET}<br>
Remote Status: ${remoteStatus || "N/A"}<br>
Last Run: ${new Date().toISOString()}<br>
Auto refresh: 30s
</div>

<div class="box">
${
  error
    ? `❌ ERROR\n${error}`
    : body
        ? body
        : "⚠ No output received"
}
</div>

<small>
This page never crashes. Cron-safe. Human-readable.
</small>

</body>
</html>`);
}
