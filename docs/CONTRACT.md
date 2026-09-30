# AI contract (for the AI/steps teammate)

The extension calls two endpoints on the URL in **Settings → Advanced → AI service URL**.
If the URL is empty, times out (9 s), errors, or returns nothing usable, the extension silently
uses the built-in offline rules (`extension/shared/fallback.js`). So the demo can never break.

CORS: the Worker must answer `OPTIONS` and send `Access-Control-Allow-Origin: *`.

## POST /steps

Request
```json
{
  "text": "# Heading\nParagraph…\nParagraph…",
  "title": "Page title",
  "url": "https://…",
  "prefs": { "chunkWords": 150, "readingLevel": "simple" }
}
```
`text` is plain text; lines starting with `# ` are headings. `chunkWords` is the target words per step
(it shrinks when the student says "too much" / "lost focus").

Response
```json
{
  "steps": [
    { "id": "s1", "title": "What are optical waves?", "body": "Short text the student reads (60–150 words).",
      "keyIdea": "One sentence, copied verbatim from body so it can be highlighted.", "minutes": 2 }
  ],
  "summary": "3–4 sentence summary, used for text to speech."
}
```
Rules: 4–12 steps, `minutes` 1–5, `keyIdea` should appear word for word in `body`, plain text only, no markdown.

## POST /adapt

Request
```json
{
  "step": { "id": "s1", "title": "…", "body": "…", "keyIdea": "…", "minutes": 2 },
  "feedback": "got_it | explain_differently | too_much | took_long | lost_focus | not_sure",
  "prefs": { "chunkWords": 150, "readingLevel": "simple" }
}
```

Response
```json
{
  "replacementSteps": [ { "id": "…", "title": "…", "body": "…", "keyIdea": "…", "minutes": 1 } ],
  "newPrefs": { "chunkWords": 90 },
  "petMessage": "Too much at once, got it. Smaller pieces now."
}
```
Behaviour the extension expects:

| feedback | replacementSteps | newPrefs |
|---|---|---|
| got_it | `[]` (extension moves on) | `{}` |
| took_long | `[]` | smaller `chunkWords` |
| too_much / lost_focus | same material split into smaller steps | smaller `chunkWords` |
| explain_differently / not_sure | 1 step: same idea, simpler words, short bullets or an analogy | `readingLevel: "simple"` |

Non-empty `replacementSteps` replace the current step and the student stays on the first one.
`petMessage` is short (≤ 20 words), warm, never blaming.
