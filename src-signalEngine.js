import WebSocket from "ws";
import fetch from "node-fetch";
import { EMA, RSI, ATR } from "technicalindicators";
import { analyzeLocal, analyzeGPT } from "./src-aiModule.js";

export class SignalEngine {
  constructor(symbols, timeframes) {
    this.symbols = symbols;
    this.timeframes = timeframes;

    this.candles = {};
    this.recentSignals = [];
    this.latestSignal = null;

    this.maxSignals = 500;

    this.QUALITY_MIN = 3;
    this.RSI_MIN = 45;
    this.RSI_MAX = 65;
    this.ATR_REL_MIN = 0.002;

    this.AI_MODE = "local";
    this.OPENAI_KEY = null;
  }

  setOpenaiKey(k) {
    this.OPENAI_KEY = k;
  }

  setAiMode(m) {
    this.AI_MODE = m;
  }

  async start() {
    console.log("Starting Binance streams…");

    for (const sym of this.symbols) {
      for (const tf of this.timeframes) {
        const stream = `${sym.toLowerCase()}@kline_${tf}`;
        const url = `wss://stream.binance.com:9443/ws/${stream}`;

        this.openStream(url, sym, tf);
        await new Promise((r) => setTimeout(r, 60)); // avoid rate limits
      }
    }
  }

  openStream(url, symbol, timeframe) {
    const key = `${symbol}-${timeframe}`;
    const ws = new WebSocket(url);

    ws.on("open", () => console.log("[OPEN]", key));
    ws.on("close", () => {
      console.log("[CLOSED]", key, "→ reconnecting…");
      setTimeout(() => this.openStream(url, symbol, timeframe), 2000);
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const k = msg.k;
      const c = {
        t: k.T,
        o: +k.o,
        h: +k.h,
        l: +k.l,
        c: +k.c,
        v: +k.v,
        closed: k.x,
      };

      this.upsert(key, c);

      if (c.closed) {
        const sig = this.evaluate(key, symbol, timeframe);
        if (sig) {
          this.latestSignal = sig;
          this.recentSignals.push(sig);
          if (this.recentSignals.length > this.maxSignals)
            this.recentSignals.shift();
        }
      }
    });
  }

  upsert(key, c) {
    const arr = (this.candles[key] ||= []);
    if (arr.length && arr[arr.length - 1].t === c.t) arr[arr.length - 1] = c;
    else arr.push(c);

    if (arr.length > 2000) arr.shift();
  }

  async attachAI(sig, extras) {
    if (this.AI_MODE === "local")
      sig.ai = await analyzeLocal(sig, extras);

    if (this.AI_MODE === "gpt")
      sig.ai = await analyzeGPT(sig, extras, this.OPENAI_KEY);
  }

  evaluate(key, symbol, timeframe) {
    const arr = this.candles[key];
    if (!arr || arr.length < 210) return null;

    const close = arr.map((x) => x.c);
    const high = arr.map((x) => x.h);
    const low = arr.map((x) => x.l);

    const ema9 = EMA.calculate({ period: 9, values: close });
    const ema21 = EMA.calculate({ period: 21, values: close });
    const ema50 = EMA.calculate({ period: 50, values: close });
    const ema200 = EMA.calculate({ period: 200, values: close });
    const rsi14 = RSI.calculate({ period: 14, values: close });
    const atr14 = ATR.calculate({ period: 14, high, low, close });

    const i = close.length - 1;

    const trendUp = ema50.at(-1) > ema200.at(-1);
    const trendDn = ema50.at(-1) < ema200.at(-1);

    const crossUp =
      ema9.at(-2) <= ema21.at(-2) && ema9.at(-1) > ema21.at(-1);
    const crossDn =
      ema9.at(-2) >= ema21.at(-2) && ema9.at(-1) < ema21.at(-1);

    const rsiNow = rsi14.at(-1);
    const rsiOk = rsiNow > this.RSI_MIN && rsiNow < this.RSI_MAX;

    const atr = atr14.at(-1);
    const atrRel = atr / close[i];

    if (atrRel < this.ATR_REL_MIN) return null;

    let side = null;
    if (trendUp && crossUp) side = "LONG";
    if (trendDn && crossDn) side = "SHORT";
    if (!side || !rsiOk) return null;

    const entry = close[i];
    const sl = side === "LONG" ? entry - 1.2 * atr : entry + 1.2 * atr;
    const tp1 = side === "LONG" ? entry + 1.5 * atr : entry - 1.5 * atr;
    const tp2 = side === "LONG" ? entry + 3 * atr : entry - 3 * atr;

    const sig = {
      ts: new Date(arr.at(-1).t).toISOString(),
      symbol,
      timeframe,
      side,
      entry,
      sl,
      tp1,
      tp2,
      quality: 4,
      reasons: ["Trend + EMA cross + RSI zone + ATR good"],
    };

    this.attachAI(sig, {
      rsi: rsiNow,
      atrRel,
      trendScore: trendUp || trendDn ? 1 : 0,
    });

    return sig;
  }
}
