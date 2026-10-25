// 학교 AI 서버: npm run ai:serve
//
// 1) Ollama 를 이 컴퓨터 안(127.0.0.1:11434)에서만 열고,
// 2) 그 앞에 "문지기" 서버(127.0.0.1:8787)를 둔다. 비밀 토큰이 맞는 POST /api/chat 만 Ollama 로 넘긴다.
// 배포된 사이트(Vercel)는 Tailscale Funnel 같은 HTTPS 통로로 이 문지기에만 접속한다. (docs/ai-deploy.md)
//
// .env.local 에 필요한 값:
//   AI_GATEWAY_TOKEN=32자 이상 무작위 문자열 (Vercel 의 OLLAMA_API_KEY 와 같은 값)
//   OLLAMA_MODEL=qwen3:4b  (이 모델만 쓸 수 있게 막는다)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const OLLAMA = "http://127.0.0.1:11434";
const PORT = Number(process.env.AI_GATEWAY_PORT ?? 8787);
const TOKEN = process.env.AI_GATEWAY_TOKEN ?? "";
const MODEL = process.env.OLLAMA_MODEL?.trim() ?? "";
const MAX_BODY = 256 * 1024; // 앱은 최대 16,000자만 보낸다
const PER_MINUTE = 20; // 토큰이 새어 나가도 이 컴퓨터를 마음대로 쓰지 못하게

const child = spawn("ollama", ["serve"], { stdio: "inherit", env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434", OLLAMA_NO_CLOUD: "1" } });
child.on("error", () => {
  console.error("Ollama를 설치한 뒤 다시 실행해 주세요.");
  process.exit(1);
});
child.on("exit", (code) => {
  // 이미 다른 창에서 Ollama 가 켜져 있으면 여기로 온다. 문지기는 그 Ollama 를 그대로 쓴다.
  if (code) console.log("(Ollama가 이미 켜져 있으면 무시해도 됩니다)");
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child.kill(signal); process.exit(0); });

if (TOKEN.length < 32 || !MODEL) {
  console.log("문지기는 꺼져 있어요. (.env.local 에 AI_GATEWAY_TOKEN(32자 이상)과 OLLAMA_MODEL 이 있어야 켜집니다)");
  console.log("이 컴퓨터의 개발 서버(npm run dev)에서는 그대로 AI를 쓸 수 있어요.");
} else {
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  const recent = [];
  const reply = (res, status, message) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  };

  createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization ?? "");
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(res, 401, "unauthorized");
    if (req.method !== "POST" || req.url !== "/api/chat") return reply(res, 404, "not found");

    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length >= PER_MINUTE) return reply(res, 429, "too many requests");
    recent.push(now);

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) return reply(res, 413, "too large");
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply(res, 400, "bad json");
    }
    if (body.model !== MODEL) return reply(res, 400, "model not allowed");

    try {
      const upstream = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, stream: false }),
      });
      res.writeHead(upstream.status, { "Content-Type": "application/json" });
      res.end(await upstream.text());
      console.log(`${new Date().toLocaleTimeString("ko-KR")} AI 요청 처리 (${upstream.status})`); // 내용은 기록하지 않는다
    } catch {
      reply(res, 502, "ollama unavailable");
    }
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`문지기 켜짐: http://127.0.0.1:${PORT} (토큰이 맞는 /api/chat 요청만 받아요)`);
    console.log(`인터넷 통로 열기: tailscale funnel ${PORT}`);
  });
}
