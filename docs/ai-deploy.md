# 배포된 사이트에서 학교 AI(로컬 Ollama) 쓰기

학생 글은 외부 AI 회사로 나가지 않는다. 배포된 사이트(Vercel)가 학교 AI 컴퓨터의 "문지기"에 HTTPS로 접속하고,
문지기는 비밀 토큰이 맞는 글쓰기 요청만 그 컴퓨터의 Ollama로 넘긴다.

```
학생 브라우저 → Vercel(Next.js) → HTTPS(Tailscale Funnel) → 문지기 127.0.0.1:8787 → Ollama 127.0.0.1:11434
```

AI 컴퓨터가 꺼져 있으면 AI 버튼만 "지금 쓸 수 없어요"로 안내하고, 나머지 기능은 그대로 동작한다.

## 1. AI 컴퓨터 (지금은 개발용 맥북)

1. Ollama 설치 후 모델 받기: `ollama pull qwen3:4b`
2. 토큰 만들기: 터미널에서 `openssl rand -hex 32` → 나온 64자를 복사한다. **채팅·GitHub·단톡에 붙여넣지 않는다.**
3. `.env.local` 에 추가:
   ```env
   OLLAMA_MODEL=qwen3:4b
   AI_GATEWAY_TOKEN=(2에서 만든 값)
   ```
4. `npm run ai:serve` → "문지기 켜짐" 이 나오면 된다. 이 창은 켜 둔다.

## 2. 인터넷 통로 (Tailscale Funnel, 무료)

1. https://tailscale.com 에서 가입하고 맥용 Tailscale 을 설치해 로그인한다.
2. 관리 화면에서 HTTPS 인증서와 Funnel 을 켠다. (처음 실행할 때 터미널이 켜는 링크를 알려 준다)
3. 새 터미널에서 `tailscale funnel 8787` → `https://컴퓨터이름.tailnet이름.ts.net` 주소가 나온다.
   (Tailscale 버전에 따라 `tailscale funnel --bg 8787` 처럼 조금 다를 수 있다. 화면 안내를 따른다)

확인: 토큰 없이 접속하면 막혀야 한다. `curl -X POST https://주소/api/chat` → `{"error":"unauthorized"}`

## 3. Vercel 환경 변수

| 이름 | 값 |
| --- | --- |
| `OLLAMA_BASE_URL` | 2에서 나온 `https://….ts.net` 주소 |
| `OLLAMA_MODEL` | `qwen3:4b` (문지기와 같은 모델만 허용된다) |
| `OLLAMA_API_KEY` | 1에서 만든 토큰 (Sensitive 로 표시) |
| `OLLAMA_TIMEOUT_MS` | `120000` |

저장한 뒤 Redeploy 한다. 앱은 이 컴퓨터 밖 주소를 부를 때 HTTPS 와 토큰이 없으면 아예 연결하지 않는다.

## 문지기가 막는 것

- 토큰이 틀린 요청 (401), `/api/chat` 이외의 주소 (모델 다운로드·삭제 등, 404), 다른 모델 (400)
- 256KB 넘는 요청, 1분에 20번 넘는 요청 (토큰이 새어도 컴퓨터를 마음대로 쓰지 못하게)
- 요청 내용은 로그에 남기지 않는다. 시각과 결과 코드만 찍는다.

토큰이 새었다고 의심되면 새 토큰을 만들어 `.env.local` 과 Vercel 에 같이 바꾸고 `npm run ai:serve` 를 다시 켠다.
