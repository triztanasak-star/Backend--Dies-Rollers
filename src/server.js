const app = require('./app');

const PORT = process.env.PORT || 3000;
const KEEP_ALIVE_INTERVAL_MS = 14 * 60 * 1000;

function startKeepAlive() {
  const serverUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!serverUrl || process.env.KEEP_ALIVE_ENABLED === 'false') return;

  let healthUrl;
  try {
    healthUrl = new URL('/api/health', serverUrl);
    if (!['http:', 'https:'].includes(healthUrl.protocol)) {
      throw new Error('URL must use HTTP or HTTPS');
    }
  } catch (error) {
    console.error('[Keep-Alive] Invalid server URL:', error.message);
    return;
  }

  const timer = setInterval(async () => {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      await response.body?.cancel();
      console.log(`[Keep-Alive] Ping sent. Status Code: ${response.status}`);
    } catch (error) {
      console.error('[Keep-Alive] Ping error:', error.message);
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  timer.unref();
  console.log(`[Keep-Alive] Enabled: ${healthUrl.href} every 14 minutes`);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startKeepAlive();
});
