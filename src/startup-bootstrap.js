import { getSupervisorCredentials } from "./accounts/secret-store.js";

const noopLogger = {
  log() {},
  error() {},
};

function normalizeLogger(logger) {
  return {
    log:
      typeof logger?.log === "function"
        ? logger.log.bind(logger)
        : noopLogger.log,
    error:
      typeof logger?.error === "function"
        ? logger.error.bind(logger)
        : noopLogger.error,
  };
}

export function initializeStartupBootstrap(logger = noopLogger) {
  const activeLogger = normalizeLogger(logger);
  setTimeout(async () => {
    try {
      const credentials = await getSupervisorCredentials();
      if (!credentials) {
        activeLogger.log(
          "[Supervisor] Bootstrap paused: Missing secure credentials.",
        );
        return;
      }
      activeLogger.log(
        "[Supervisor] Bootstrap completed successfully. Ready for session continuity.",
      );
    } catch (error) {
      activeLogger.error(
        "[Supervisor] Bootstrap failed gracefully. Action required: Check secure storage.",
        { error },
      );
      console.error("[startup-bootstrap] bootstrap failed", error);
    }
  }, 0);
  return { status: "initializing_in_background" };
}
