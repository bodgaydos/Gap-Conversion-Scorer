// Pendella Gap Scorer — static host + Claude scoring proxy.
// The Anthropic key lives ONLY here (env var), never in the browser.
// The scoring prompt is built server-side, so /api/score can only ever
// do gap-scoring — it can't be abused as a general-purpose LLM endpoint.

const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- simple per-IP rate limit (public link hygiene) ----
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  const e = hits.get(ip) || { n: 0, t: now };
  if (now - e.t > WINDOW_MS) { e.n = 0; e.t = now; }
  e.n += 1; hits.set(ip, e);
  if (e.n > MAX_PER_WINDOW) return res.status(429).json({ error: 'Rate limit reached — wait a minute and try again.' });
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true, model: process.env.SCORER_MODEL || 'claude-sonnet-5' }));

const RUBRIC = `You are scoring a life-insurance "coverage gap" insertion shown during benefits enrollment. Score how likely it is to make an employee click the primary CTA (e.g. "See my rate").

Rate each lever from 0.00 to 1.00:
- C Clarity: is the gap specific (a dollar figure), near the top, and visually tied to buying Individual Life (a connected bar / "fills the gap" link)?
- G Guidance: numbered steps, an explicit plan, a recommended default amount.
- A Authority: a "Recommended" mark, a rationale (e.g. 10x income), guaranteed-issue, licensing/carrier language.
- Y Payoff: emotional benefit ("your family would receive", "for life"), a big benefit number, a completion/celebration moment.
- F Friction (higher = worse): number of form fields, competing CTAs, required consent; reassurance like "apply in minutes, no commitment" lowers it.
- reach (0.20 to 1.00): the share of people who scroll far enough to SEE the gap card. A gap at the very top = ~1.0; a card buried at the bottom of an optional list under competing items = low.

Calibration on this same scale: the current baseline design scores about C .18 / G .12 / A .10 / Y .12 / F .04. A strong two-step guided design about C .55 / G .82 / A .78 / Y .35 / F .09. A connected-bar clarity design about C .88 / G .35 / A .28 / Y .55 / F .05.`;

app.post('/api/score', rateLimit, async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in the Render dashboard → Environment.' });

  const text = String(req.body && req.body.text || '').slice(0, 8000);
  const signals = JSON.stringify(req.body && req.body.signals || {}).slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ error: 'No design text provided.' });

  const prompt =
    RUBRIC +
    `\n\nDetected structural signals (booleans, for reference): ${signals}` +
    `\n\nVisible text of the design:\n"""${text}"""` +
    `\n\nRespond with ONLY a JSON object, no prose, no markdown fences:\n` +
    `{"C":0.0,"G":0.0,"A":0.0,"Y":0.0,"F":0.0,"reach":0.0,"rationale":{"C":"...","G":"...","A":"...","Y":"...","F":"..."}}\n` +
    `Keep each rationale under 16 words.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.SCORER_MODEL || 'claude-sonnet-5',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data && data.error && data.error.message ? data.error.message : ('Anthropic API HTTP ' + r.status);
      return res.status(502).json({ error: msg });
    }
    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const clean = raw.replace(/```json|```/g, '').trim();
    const slice = clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1);
    const js = JSON.parse(slice);
    return res.json(js);
  } catch (e) {
    return res.status(502).json({ error: 'Scoring failed: ' + (e && e.message ? e.message : String(e)) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Pendella Gap Scorer listening on ' + port));
