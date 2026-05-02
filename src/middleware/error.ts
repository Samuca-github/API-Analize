import { NextFunction, Request, Response } from "express";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status ?? 500;
  res.status(status).json({
    error: err.message ?? "internal_error",
    details: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
}
