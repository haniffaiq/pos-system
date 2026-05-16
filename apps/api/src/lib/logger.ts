import pino from "pino";

export const redactPaths = [
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "secret_encrypted",
  "*.secret_encrypted",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "cookie",
  "*.cookie",
  "set-cookie",
  "*.set-cookie",
];

type LogDestination = { write: (msg: string) => void };
type LogError = { name: string; code?: string };

const loggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  base: { service: "api", env: process.env.NODE_ENV ?? "development" },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export function createLogger(destination?: LogDestination): pino.Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export function toLogError(error: unknown): LogError {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === "string" ? { name: error.name, code } : { name: error.name };
  }

  return { name: typeof error };
}

export const logger = createLogger();

export type AppLogger = typeof logger;
