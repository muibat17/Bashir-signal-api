import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { SignalEngine } from "./src-signalEngine.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());

let engine;

// ✅ Boot the engine
async function boot() {

  // ✅ Updated: Top 50 Binance USDT pairs
  const symbols = [
    "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT",
    "ADAUSDT","AVAXUSDT","DOGEUSDT","TRXUSDT","DOTUSDT",
    "LINKUSDT","MATICUSDT","LTCUSDT","BCHUSDT","UNIUSDT",
    "ATOMUSDT","XLMUSDT","XMRUSDT","SANDUSDT","APEUSDT",
    "APTUSDT","INJUSDT","FILUSDT","RUNEUSDT","THETAUSDT",
    "ETCUSDT","NEARUSDT","ARBUSDT","OPUSDT","SUIUSDT",
    "WLDUSDT","PYTHUSDT","TIAUSDT","SEIUSDT","JASMYUSDT",
    "GALAUSDT","ALGOUSDT","FTMUSDT","ZECUSDT","MASKUSDT",
    "KAVAUSDT","AXSUSDT","CHZUSDT","SHIBUSDT","FETUSDT",
    "QNTUSDT","PEPEUSDT","ROSEUSDT","MANAUSDT","EGLDUSDT"
  ];

  const timeframes = ["1m", "5m", "15m"];

  engine = new SignalEngine(symbols, timeframes);
  await engine.start();
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    aiMode: engine?.AI_MODE || "local",
    symbols: engine?.symbols || [],
    timeframes: engine?.timeframes || []
  });
});

app.get("/latest", (req, res) => {
  res.json(engine?.latestSignal || {});
});

app.get("/signals", (req, res) => {
  const { symbol, timeframe, limit } = req.query;

  let list = engine?.recentSignals || [];

  if (symbol)
    list = list.filter(
      (s) => s.symbol === String(symbol).toUpperCase()
    );

  if (timeframe)
    list = list.filter((s) => s.timeframe === timeframe);

  const lim = Math.min(Number(limit || 50), 200);

  res.json(list.slice(-lim));
});

app.post("/set-key", (req, res) => {
  const { key } = req.body || {};
  engine?.setOpenaiKey(key);
  res.json({ ok: true });
});

app.post("/set-mode", (req, res) => {
  const { mode } = req.body || {};
  engine?.setAiMode(mode);
  res.json({ ok: true, mode });
});

// ✅ Start server
boot();

app.listen(4000, () => console.log("✅ API running on port 4000"));
