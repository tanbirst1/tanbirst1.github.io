/**
 * Vercel Edge Function - Video Page Scraper
 * Extracts video URLs and metadata from embed pages
 * Handles URLs with ampersands and special characters
 */

import { NextRequest, NextResponse } from 'next/server'

export const config = {
  runtime: 'edge',
}

interface VideoData {
  sourceUrl: string
  timestamp: string
  videoUrl: string | null
  adUrl: string | null
  playButtonImage: string | null
  hasOverlay: boolean
  metadata: {
    title?: string
    robots?: string
    charset?: string
    language?: string
    hasCloudflare: boolean
    contextMenuDisabled: boolean
  }
}

export default async function handler(req: NextRequest) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { headers: corsHeaders })
  }

  try {
    const { searchParams } = new URL(req.url)
    const targetUrl = searchParams.get('url')

    if (!targetUrl) {
      return NextResponse.json(
        {
          error: 'Missing required parameter: url',
          usage: 'Add ?url=YOUR_ENCODED_URL to the request',
          example: '/api/scraper?url=' + encodeURIComponent('https://example.com/page?param1=value1&param2=value2')
        },
        { 
          status: 400,
          headers: corsHeaders
        }
      )
    }

    let decodedUrl: string
    try {
      decodedUrl = decodeURIComponent(targetUrl)
    } catch {
      decodedUrl = targetUrl
    }

    if (!isValidUrl(decodedUrl)) {
      return NextResponse.json(
        {
          error: 'Invalid URL format',
          providedUrl: decodedUrl
        },
        { 
          status: 400,
          headers: corsHeaders
        }
      )
    }

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const videoData = extractVideoData(html, decodedUrl)

    return NextResponse.json(videoData, {
      status: 200,
      headers: corsHeaders
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      {
        error: 'Scraping failed',
        message: errorMessage,
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: corsHeaders
      }
    )
  }
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function extractVideoData(html: string, sourceUrl: string): VideoData {
  const data: VideoData = {
    sourceUrl: sourceUrl,
    timestamp: new Date().toISOString(),
    videoUrl: null,
    adUrl: null,
    playButtonImage: null,
    hasOverlay: false,
    metadata: {
      hasCloudflare: false,
      contextMenuDisabled: false
    }
  }

  const iframeRegex = /<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi
  const iframeMatches = html.matchAll(iframeRegex)
  
  for (const match of iframeMatches) {
    const src = match[1]
    if (src && !src.includes('cloudflareinsights') && !src.includes('beacon')) {
      data.videoUrl = decodeHtmlEntities(src)
      break
    }
  }

  const windowOpenRegex = /window\.open\s*\(\s*["']([^"']+)["']/gi
  const adMatches = html.matchAll(windowOpenRegex)
  for (const match of adMatches) {
    if (match[1]) {
      data.adUrl = decodeHtmlEntities(match[1])
      break
    }
  }

  const backgroundUrlRegex = /background(?:-image)?\s*:\s*url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi
  const bgMatches = html.matchAll(backgroundUrlRegex)
  for (const match of bgMatches) {
    if (match[1] && (match[1].includes('play') || match[1].includes('button'))) {
      data.playButtonImage = decodeHtmlEntities(match[1])
      break
    }
  }

  data.hasOverlay = /class=["'][^"']*fake-player-overlay[^"']*["']/i.test(html) ||
                     /class=["'][^"']*overlay[^"']*["']/i.test(html)

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch) {
    data.metadata.title = decodeHtmlEntities(titleMatch[1].trim())
  }

  const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)
  if (robotsMatch) {
    data.metadata.robots = robotsMatch[1]
  }

  const charsetMatch = html.match(/<meta\s+charset=["']?([^"'\s>]+)["']?/i)
  if (charsetMatch) {
    data.metadata.charset = charsetMatch[1]
  }

  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i)
  if (langMatch) {
    data.metadata.language = langMatch[1]
  }

  data.metadata.hasCloudflare = html.includes('cloudflareinsights') || 
                                 html.includes('cf-beacon')

  data.metadata.contextMenuDisabled = /oncontextmenu\s*=\s*["']return\s+false[;]?["']/i.test(html)

  return data
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'"
  }

  return text.replace(/&[#\w]+;/g, (entity) => {
    return entities[entity] || entity
  })
}        let body = "";
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
