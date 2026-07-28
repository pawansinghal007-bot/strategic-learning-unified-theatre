import { findIdeaById, updateIdea } from "./idea-store.js";
import { sendPrompt } from "./browser-bridge.js";

const RESEARCH_PROMPT_PREFIX = "Research this idea:\n\n";
const REFINEMENT_PROMPT_PREFIX =
  "Refine this idea using the research below.\n\nIdea:\n";

export async function refineIdea(ideaId, options = {}) {
  const idea = await findIdeaById(ideaId, options);
  const research = await sendPrompt({
    platform: "perplexity",
    prompt: buildResearchPrompt(idea),
  });
  const refinement = await sendPrompt({
    platform: "claude",
    prompt: buildRefinementPrompt(idea, research),
  });
  return updateIdea(
    ideaId,
    {
      researchNotes: research.response,
      refinementNotes: refinement.response,
    },
    options,
  );
}

function buildResearchPrompt(idea) {
  return `${RESEARCH_PROMPT_PREFIX}${idea.body}`;
}

function buildRefinementPrompt(idea, research) {
  return `${REFINEMENT_PROMPT_PREFIX}${idea.body}\n\nResearch:\n${research.response}`;
}
