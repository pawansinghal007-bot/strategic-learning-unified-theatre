import { ExperienceDb } from '../src/llm/experience-db.js';

async function run() {
  const db = new ExperienceDb();
  await db.open();
  const promptHistory = Array.isArray(db.state.prompt_history) ? db.state.prompt_history.length : 0;
  const documents = Array.isArray(db.state.documents) ? db.state.documents.length : 0;
  const rubricRules = Array.isArray(db.state.rubric_rules) ? db.state.rubric_rules.length : 0;
  const mistakes = Array.isArray(db.state.mistakes) ? db.state.mistakes.length : 0;
  const threads = Array.isArray(db.state.conversation_threads) ? db.state.conversation_threads.length : 0;

  console.log(`prompt_history: ${promptHistory}`);
  console.log(`documents: ${documents}`);
  console.log(`rubric_rules: ${rubricRules}`);
  console.log(`mistakes: ${mistakes}`);
  console.log(`conversation_threads: ${threads}`);
  await db.close();
}

run().catch((err) => {
  console.error('ERROR', err?.message ?? err);
  process.exit(1);
});
