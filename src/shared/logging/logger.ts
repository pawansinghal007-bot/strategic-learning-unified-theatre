export interface LogContext {
  [key: string]: unknown;
}

function write(
  level: "info" | "warn" | "error",
  message: string,
  context: unknown = {},
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context as Record<string, unknown>),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, context?: unknown) => write("info", message, context),
  warn: (message: string, context?: unknown) => write("warn", message, context),
  error: (message: string, context?: unknown) =>
    write("error", message, context),
};
