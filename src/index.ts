import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import { cfg } from "./config.js";
import { supabaseAuth } from "./middleware/supabaseAuth.js";
import { limiter } from "./middleware/limiter.js";
import { errorHandler } from "./middleware/error.js";
import { analyzeRouter } from "./routes/analyze.js";
import { healthRouter } from "./routes/health.js";

const app = express();
const log = pino();

app.use(helmet({ xPoweredBy: false }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const allowed = cfg.cors.origins.some((pattern) => matchOrigin(pattern, origin));
      cb(allowed ? null : new Error(`origin_not_allowed: ${origin}`), allowed);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: cfg.maxBodySize }));
app.use((req, res, next) => {
  res.locals.__start = Date.now();
  res.locals.__trace_id = cryptoRandom();
  next();
});
app.use(limiter);

app.use(healthRouter);
app.use("/analyze", supabaseAuth, analyzeRouter);

app.use(errorHandler);

app.listen(cfg.port, () => log.info({ port: cfg.port }, "analyze-api listening"));

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function matchOrigin(pattern: string, origin: string) {
  if (pattern === "*" || pattern === origin) return true;
  if (pattern.includes("*")) {
    const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(origin);
  }
  return false;
}
