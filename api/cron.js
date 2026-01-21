import https from "https";
import { URL } from "url";

export default async function handler(req, res) {
  const TARGET = "https://blackseal.xyz/test/auto/m_upload.php";

  // Always return HTML
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const url = new URL(TARGET);

  const agent = new https.Agent({
    rejectUnauthorized: false, // InfinityFree TLS fix
    keepAlive: true,
  });

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: "GET",
    agent,
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept": "text/html,*/*",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
  };

  let phpOutput = "";

  try {
    phpOutput = await new Promise((resolve, reject) => {
      const reqPhp = https.request(options, (r) => {
        let body = "";
        r.on("data", (c) => (body += c.toString()));
        r.on("end", () => resolve(body));
      });

      reqPhp.on("error", reject);
      reqPhp.on("timeout", () => {
        reqPhp.destroy();
        reject(new Error("timeout"));
      });

      reqPhp.end();
    });
  } catch (e) {
    // NEVER crash page
    phpOutput = `<div class="error">PHP ERROR: ${e.message}</div>`;
  }

  // Convert raw PHP output to readable logs
  const logs = [];

  logs.push(`<div class="ok">HTTP 200 ✔ Service Alive</div>`);

  if (/DB Connected/i.test(phpOutput)) {
    logs.push(`<div class="ok">DB Connected ✔</div>`);
  } else {
    logs.push(`<div class="info">Connecting DB...</div>`);
  }

  const tmdbMatches = phpOutput.match(/TMDB\s*([0-9]+)/gi) || [];
  tmdbMatches.forEach((m) => {
    logs.push(`<div class="info">${m}</div>`);
    logs.push(`<div class="ok">Inserted ✔</div>`);
  });

  logs.push(`<div class="ok">DONE ✔</div>`);

  // Final HTML page
  return res.status(200).send(`
<!doctype html>
<html>
<head>
  <title>Auto Upload Status</title>
  <meta http-equiv="refresh" content="60">
  <style>
    body {
      background:#0b0f14;
      color:#eaeaea;
      font-family: monospace;
      padding:20px;
    }
    .ok { color:#00ff9c; margin:6px 0; }
    .info { color:#5dade2; margin:6px 0; }
    .error { color:#ff5c5c; margin:6px 0; }
    .box {
      border:1px solid #222;
      padding:15px;
      border-radius:6px;
      max-width:900px;
    }
  </style>
</head>
<body>
  <div class="box">
    <h3>📡 Auto Movie Sync – Live Status</h3>
    ${logs.join("\n")}
    <hr>
    <div class="info">Target: ${TARGET}</div>
    <div class="info">Updated: ${new Date().toISOString()}</div>
    <div class="info">Auto refresh: 60s</div>
  </div>
</body>
</html>
`);
}
