import os from "node:os";
import path from "node:path";
import { ExperienceDb } from "../src/llm/experience-db.js";

const POLL_INTERVAL_MS = 5000;
const PLATFORMS = ["chatgpt", "claude", "perplexity", "gemini"];

async function loadDbState() {
  const db = new ExperienceDb();
  await db.open();
  const state = db.state || {};
  await db.close();
  return state;
}

function summarizePlatformDocs(docs) {
  return PLATFORMS.map((platform) => ({
    platform,
    threadTurns: docs.filter((doc) => doc.source_type === "thread-turn" && doc.platform === platform).length
  }));
}

function formatRecentThreads(threads) {
  return threads
    .slice(0, 5)
    .map((thread) => `${thread.id} | ${thread.platform || "unknown"} | turns=${thread.turn_count} | ${thread.file_path}`)
    .join("\n");
}

async function printStatus() {
  const state = await loadDbState();
  const documents = Array.isArray(state.documents) ? state.documents : [];
  const threads = Array.isArray(state.conversation_threads) ? state.conversation_threads : [];
  const promptHistory = Array.isArray(state.prompt_history) ? state.prompt_history : [];
  const ingestionLog = Array.isArray(state.ingestion_log) ? state.ingestion_log : [];

  const platformSummary = summarizePlatformDocs(documents);
  const seenPlatforms = platformSummary.filter((item) => item.threadTurns > 0);

  console.clear();
  console.log("=== Browser Activity Watch ===");
  console.log(new Date().toISOString());
  console.log("Database:", path.join(os.homedir(), ".vscode-rotator", "experience.db"));
  console.log("Total documents:", documents.length);
  console.log("Total thread-turn chunks:", documents.filter((doc) => doc.source_type === "thread-turn").length);
  console.log("Total conversation threads:", threads.length);
  console.log("Prompt history entries:", promptHistory.length);
  console.log("Ingestion log entries:", ingestionLog.length);
  console.log("");

  if (seenPlatforms.length === 0) {
    console.log("No browser thread activity found yet for: chatgpt, claude, perplexity, gemini.");
  } else {
    console.log("Thread-turn counts by platform:");
    for (const row of platformSummary) {
      console.log(`  ${row.platform}: ${row.threadTurns}`);
    }
  }

  console.log("");
  console.log("Recent conversation_threads:");
  console.log(threads.length > 0 ? formatRecentThreads(threads) : "  (none yet)");
  console.log("");
  console.log("Recent ingestion log entries:");
  ingestionLog
    .slice(-5)
    .reverse()
    .forEach((entry) => {
      console.log(`  ${entry.last_run} | ${entry.chunk_count} chunks | ${entry.path}`);
    });
  console.log("");
  console.log(`Next refresh in ${POLL_INTERVAL_MS / 1000}s...`);
}

async function run() {
  await printStatus();
  setInterval(() => {
    printStatus().catch((error) => {
      console.error("Watch error:", error?.message ?? error);
    });
  }, POLL_INTERVAL_MS);
}

run().catch((error) => {
  console.error("Failed to start watch:", error?.message ?? error);
  process.exit(1);
});
