/** Ollama's local /api/chat protocol. Kept separate so transport failures can be tested. */
export type SchoolAiKind = "feedback" | "draft" | "summary";
export function ollamaConfiguration(env: Record<string, string | undefined> = process.env) {
  const model = env.OLLAMA_MODEL?.trim();
  if (!model) return null;
  const base = new URL(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid Ollama URL");
  if (model.endsWith(":cloud") || base.hostname === "ollama.com" || base.hostname.endsWith(".ollama.com")) throw new Error("Use a locally installed Ollama model");
  // 이 컴퓨터 밖(배포된 사이트 -> 학교 AI 컴퓨터의 문지기)으로 부를 때는 HTTPS 와 비밀 토큰이 꼭 있어야 한다.
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  const apiKey = env.OLLAMA_API_KEY?.trim() || undefined;
  if (!local && (base.protocol !== "https:" || !apiKey)) throw new Error("Remote Ollama needs HTTPS and OLLAMA_API_KEY");
  const timeout = Number(env.OLLAMA_TIMEOUT_MS ?? 120000);
  return { model, apiKey, url: `${base.toString().replace(/\/$/, "")}/api/chat`, timeout: Number.isFinite(timeout) ? Math.max(1000, Math.min(timeout, 300000)) : 120000 };
}
export async function requestOllama(instructions: string, source: string, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  const config = ollamaConfiguration(env);
  if (!config) throw new Error("Ollama model is not configured");
  const response = await fetcher(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model, stream: false, messages: [{ role: "system", content: instructions }, { role: "user", content: source.slice(0, 16000) }], options: { num_predict: 2000, num_ctx: 16384, temperature: 0.4 } }),
    signal: AbortSignal.timeout(config.timeout),
  });
  if (!response.ok) throw new Error("Ollama unavailable");
  const result = await response.json() as { done?: boolean; done_reason?: string; message?: { content?: string }; error?: string };
  const text = result.message?.content?.trim();
  if (result.error || !result.done || result.done_reason === "length" || !text) throw new Error("Ollama incomplete");
  return text;
}
