import { ExperienceDb } from "./experience-db.js";
import { EmbeddingProvider, cosineSimilarity } from "./embeddings.js";

function mistakeText(mistake) {
  return [mistake.description, mistake.root_cause ?? mistake.rootCause, mistake.fix_applied ?? mistake.fix]
    .filter(Boolean)
    .join("\n");
}

function ruleFromMistake(mistake) {
  const fix = mistake.fix_applied || mistake.fix || "review the recurrence before implementation";
  return `Avoid repeating ${mistake.category || "general"} mistake: ${mistake.description}. Apply this fix: ${fix}.`;
}

export class MistakeTracker {
  constructor({ baseDir, db, embeddings } = {}) {
    this.db = db ?? new ExperienceDb({ baseDir });
    this.embeddings = embeddings ?? new EmbeddingProvider();
  }

  async initialize() {
    await this.db.open();
    await this.embeddings.initialize();
    return this;
  }

  async addMistake(mistake) {
    await this.initialize();
    const embedding = await this.embeddings.embed(mistakeText(mistake));
    const existing = await this.db.listMistakes();
    const match = existing
      .map((row) => ({ row, score: cosineSimilarity(embedding, row.embedding) }))
      .filter((item) => item.score > 0.85)
      .sort((a, b) => b.score - a.score)[0];

    if (match) {
      const updated = await this.db.incrementMistake(match.row.id);
      if (Number(updated.recurrence_count) >= 2) {
        await this.db.addRubricRule({
          rule: ruleFromMistake(updated),
          category: updated.category,
          created_from_mistake_id: updated.id
        });
      }
      await this.db.close();
      return { mistake: updated, matched: true, promoted: Number(updated.recurrence_count) >= 2 };
    }

    const created = await this.db.addMistake({ ...mistake, embedding });
    await this.db.close();
    return { mistake: created, matched: false, promoted: false };
  }

  async listRubric() {
    await this.db.open();
    const rules = await this.db.listRubricRules();
    await this.db.close();
    return rules;
  }

  async setRubricActive(id, active) {
    await this.db.open();
    const rule = await this.db.setRubricActive(id, active);
    await this.db.close();
    return rule;
  }
}
