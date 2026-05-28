import { initializeStartupBootstrap } from "../src/startup-bootstrap.js";
import * as secretStore from "../src/accounts/secret-store.js";

vi.mock("../src/accounts/secret-store.js", () => ({
  getSupervisorCredentials: vi.fn(),
  setSupervisorCredentials: vi.fn(),
}));

describe("Startup Bootstrap", () => {
  it("returns immediately under 500ms and handles missing credentials gracefully", () => {
    secretStore.getSupervisorCredentials.mockResolvedValue(null);
    const mockLogger = { log: vi.fn(), error: vi.fn() };
    const start = Date.now();
    const result = initializeStartupBootstrap(mockLogger);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
    expect(result.status).toBe("initializing_in_background");
  });
  it("handles credential retrieval errors without throwing", () => {
    secretStore.getSupervisorCredentials.mockRejectedValue(
      new Error("Keychain locked"),
    );
    const mockLogger = { log: vi.fn(), error: vi.fn() };
    const result = initializeStartupBootstrap(mockLogger);
    expect(result.status).toBe("initializing_in_background");
  });
});
