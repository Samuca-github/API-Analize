import rateLimit from "express-rate-limit";
import { cfg } from "../config.js";

export const limiter = rateLimit({
  windowMs: cfg.rate.windowMs,
  max: cfg.rate.max,
  standardHeaders: true,
  legacyHeaders: false
});
