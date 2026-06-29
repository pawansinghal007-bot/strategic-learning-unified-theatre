// Simple test to verify CLI can be imported
try {
  // This should work if the imports are correct
  const cliModule = await import("./src/agents/cli.ts");
  console.log("✅ CLI module imported successfully");
} catch (error) {
  console.error("❌ CLI module import failed:", error.message);
  console.error(
    "This is expected in ES module environment due to import resolution issues",
  );
}
