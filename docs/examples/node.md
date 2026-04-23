# Hawkeye Sterling — Node.js

```js
// Works on Node 20+ (built-in fetch). For Node 18 add `import { fetch } from "undici"`.
const BASE = "https://hawkeye-sterling.netlify.app";
const KEY = process.env.HAWKEYE_API_KEY;

async function screen(name, jurisdiction = "") {
  const res = await fetch(`${BASE}/api/quick-screen`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      subject: { name, jurisdiction },
      candidates: [],
    }),
  });
  if (!res.ok) throw new Error(`Hawkeye ${res.status}`);
  return res.json();
}

async function newsSearch(q) {
  const res = await fetch(
    `${BASE}/api/news-search?q=${encodeURIComponent(q)}`,
    { headers: { authorization: `Bearer ${KEY}` } },
  );
  return res.json();
}

async function scheduleRescreening(subjectId, cadence = "daily") {
  const res = await fetch(`${BASE}/api/schedule`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ subjectId, cadence, scoreThreshold: 0.85 }),
  });
  return res.json();
}

const r = await screen("Ivan Petrov", "RU");
console.log(`${r.severity.toUpperCase()} · top ${r.topScore} · ${r.hits.length} hits`);
```
