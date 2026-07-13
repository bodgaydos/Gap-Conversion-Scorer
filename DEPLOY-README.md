# Pendella Gap Scorer

Upload one or more HTML mockups → each is rendered, auto-scored on the five UX
levers (+ reach), given a Claude second opinion, and dropped live into the
calibrated 64-segment conversion model, ranked against the baseline design set.

**Modeled estimate, not measured data.** It ranks designs and shows *why* one
wins; confirm with a live A/B test.

## Why a backend is needed

The Claude "second opinion" calls Anthropic's API. Browsers can't call Anthropic
directly (the key can't live in client code, and Anthropic blocks browser calls),
so this tiny server holds the key and proxies the request same-origin. Everything
else — rendering, rules pre-fill, sliders, the live model — runs in the browser
and needs no backend.

## Deploy on Render (works for anyone with the link)

1. Put these files in a GitHub repo (keep `public/index.html` in place).
2. Render → **New → Web Service** → connect the repo.
3. **Build command:** `npm install` · **Start command:** `node server.js`
   (Render auto-detects Node; `PORT` is provided for you.)
4. **Environment → Add:**
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
   - `SCORER_MODEL` *(optional)* = `claude-sonnet-5` (default) or
     `claude-haiku-4-5-20251001` for lower cost.
5. Deploy. Share the URL — the tool and Claude scoring both work for any visitor.

Check `/api/health` to confirm the server is up and see the active model.

## Run locally

```
npm install
cp .env.example .env         # add your key
node -r dotenv/config server.js   # or: export ANTHROPIC_API_KEY=... && node server.js
```
Open http://localhost:3000

## Public-link hygiene

The endpoint is rate-limited (20 requests/min/IP) and can *only* run the
gap-scoring prompt — it won't work as a general chatbot. For a truly public URL,
consider also: Render access controls, a shared-secret header, or a lower
`SCORER_MODEL`. Each score is one small model call billed to your key.

## Swapping the model

If a `SCORER_MODEL` string ever errors (model names change), set it to a current
one in the Render env (e.g. `claude-sonnet-5`, `claude-haiku-4-5-20251001`,
`claude-opus-4-8`) and redeploy — no code change needed.
