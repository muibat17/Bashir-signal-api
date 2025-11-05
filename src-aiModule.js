import fetch from "node-fetch";

export async function analyzeLocal(sig, extras) {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const { rsi, atrRel, trendScore } = extras;

  let score = 0;

  score += clamp(trendScore, 0, 1) * 0.4;

  const rsiCenter = 55;
  score += (1 - Math.min(1, Math.abs((rsi - rsiCenter)) / 25)) * 0.3;

  score += clamp((atrRel - 0.002) / 0.004, 0, 1) * 0.3;

  const confidence = Math.round(clamp(score, 0, 1) * 100);

  const dirWord = sig.side === "LONG" ? "bullish" : "bearish";
  const volWord = atrRel > 0.003 ? "moderate" : "low";

  const summary = `AI (${dirWord}): RSI ${rsi.toFixed(
    1
  )}, ${volWord} volatility. Confidence ${confidence}%.`;

  return { summary, confidence, mode: "local" };
}

export async function analyzeGPT(sig, extras, apiKey) {
  if (!apiKey)
    return { summary: "GPT disabled: no API key", confidence: 0, mode: "gpt" };

  const prompt = `
Provide a one-sentence ${sig.side} verdict with confidence (0–100%).
Symbol=${sig.symbol}
Timeframe=${sig.timeframe}
Entry=${sig.entry}
SL=${sig.sl}
TP1=${sig.tp1}
TP2=${sig.tp2}
Quality=${sig.quality}
RSI=${extras.rsi}
ATR Relative=${extras.atrRel}
Trend Score=${extras.trendScore}
`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-turbo",
        messages: [
          { role: "system", content: "Be concise and practical." },
          { role: "user", content: prompt },
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return { summary: `GPT error: ${t.slice(0, 80)}`, confidence: 0 };
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    const match = text.match(/(\\d{1,3})%/);
    const confidence = match ? Number(match[1]) : 0;

    return { summary: text, confidence };
  } catch (e) {
    return { summary: "GPT failed", confidence: 0 };
  }
}
