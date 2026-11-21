// Vercel copy of the RepFuel AI server: the same code as the Cloudflare Worker (../index.js),
// a second address the app falls back to when one host is blocked.
// Env vars (set in Vercel, never written here): GEMINI_API_KEY, PASSCODE, TAVILY_API_KEY, ALLOWED_ORIGINS, MODELS,
// PROVIDER ("claude" = use Claude), ANTHROPIC_API_KEY.
import worker from '../index.js'

export default {
  fetch: (request) => worker.fetch(request, process.env),
}
