export const cfg = {
  port: Number(process.env.PORT ?? 8080),
  maxBodySize: process.env.MAX_BODY_SIZE ?? "512kb",
  rate: {
    windowMs: Number(process.env.RATE_WINDOW_MS ?? 60_000),
    max: Number(process.env.RATE_MAX ?? 60),
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? "chrome-extension://*,http://localhost:*")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
};
