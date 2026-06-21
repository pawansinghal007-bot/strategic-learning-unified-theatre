import { describe, it, expect } from "vitest";
import { detectLimit } from "../src/limit-detector.js";

describe("Sprint 90 — limit-detector.js", () => {
  describe("detectLimit", () => {
    it("returns { limitHit: false } for null/undefined/empty payload", () => {
      expect(detectLimit(null)).toEqual({ limitHit: false });
      expect(detectLimit(undefined)).toEqual({ limitHit: false });
      expect(detectLimit("")).toEqual({ limitHit: false });
    });

    it("returns { limitHit: false } for payload without limit signals", () => {
      expect(detectLimit("Normal response text")).toEqual({ limitHit: false });
      expect(detectLimit("Success: operation completed")).toEqual({
        limitHit: false,
      });
    });

    it("detects usage limit reached signal", () => {
      const result = detectLimit("Error: usage limit reached");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeDefined();
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it("detects quota exceeded signal", () => {
      const result = detectLimit("Error: quota exceeded");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeDefined();
    });

    it("detects too many requests signal", () => {
      const result = detectLimit("Error: too many requests");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeDefined();
    });

    it("detects usage cap signal", () => {
      const result = detectLimit("Error: usage cap");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeDefined();
    });

    it("case-insensitive detection", () => {
      expect(detectLimit("USAGE LIMIT REACHED").limitHit).toBe(true);
      expect(detectLimit("Quota Exceeded").limitHit).toBe(true);
    });

    it("parses 'try again in N minutes' reset time", () => {
      const result = detectLimit("Error: usage limit reached, try again in 5 minutes");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeGreaterThan(Date.now());
      // 5 minutes = 300,000 ms
      const diff = result.resetTime - Date.now();
      expect(diff).toBeGreaterThanOrEqual(300000 - 1000); // allow 1s tolerance
      expect(diff).toBeLessThanOrEqual(300000 + 1000);
    });

    it("uses fallback 60-minute window when no specific reset time", () => {
      const result = detectLimit("Error: usage limit reached");
      expect(result.limitHit).toBe(true);
      expect(result.resetTime).toBeGreaterThan(Date.now());
      // 60 minutes = 3,600,000 ms
      const diff = result.resetTime - Date.now();
      expect(diff).toBeGreaterThanOrEqual(3600000 - 1000); // allow 1s tolerance
      expect(diff).toBeLessThanOrEqual(3600000 + 1000);
    });
  });
});
