// Fixture: types.ts — interfaces and type aliases (no calls, just declarations)

export type UserId = number;

export interface ServiceConfig {
  timeout: number;
  retries: number;
}

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Error = "error",
}
