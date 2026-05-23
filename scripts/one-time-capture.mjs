import { captureThread } from '../src/browser-bridge.js';

async function run() {
  const platforms = ['chatgpt','claude','perplexity','gemini'];
  for (const platform of platforms) {
    try {
      console.log(`Capturing: ${platform}`);
      const result = await captureThread(platform, { headless: true, timeout: 90000 });
      console.log(`OK: ${platform} ->`, result.filename ?? result.filePath ?? result);
    } catch (err) {
      console.error(`ERR: ${platform} ->`, err?.message ?? err);
    }
  }
}

run().catch((e)=>{ console.error(e); process.exit(1); });
