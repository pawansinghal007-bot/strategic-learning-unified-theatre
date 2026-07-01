export interface PipelineStep {
  stepNumber: number;
  stepName: string;
  agentName: string;
  promptTemplate: string; // raw template with {{placeholders}}
  maxIterations: number; // default 5 if not specified
  doneMarker?: string;
}

export interface Pipeline {
  commandName: string;
  inputSchema: Record<string, string>; // field -> type description
  steps: PipelineStep[];
}

// ─── private helpers ─────────────────────────────────────────────────────────

/** Try to parse an input-schema string as JSON; fall back to empty object. */
function parseInputSchemaJson(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (e) {
    /* istanbul ignore next -- defensive guard: JSON.parse only ever throws
       SyntaxError, so this re-throw branch is unreachable in practice */
    if (!(e instanceof SyntaxError)) throw e;
    // Non-JSON schema strings are treated as an empty schema
    return {};
  }
}

/**
 * Collects indented prompt lines starting at `startIndex` in `lines`,
 * stopping at the next section header or a non-indented non-blank line.
 * Returns `{ promptTemplate, nextIndex }`.
 */
function collectPromptLines(
  lines: string[],
  startIndex: number,
): { promptTemplate: string; nextIndex: number } {
  const promptLines: string[] = [];
  let i = startIndex;
  while (
    i < lines.length &&
    !lines[i].startsWith("## Step ") &&
    !lines[i].startsWith("Input: ")
  ) {
    if (lines[i].trim() === "" || lines[i].startsWith("  ")) {
      promptLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }
  return { promptTemplate: promptLines.join("\n").trim(), nextIndex: i };
}

/**
 * Applies a single line's property to the current step being built.
 * Returns the updated index (may advance past a prompt block).
 */
function applyStepProperty(
  line: string,
  lineIndex: number,
  lines: string[],
  step: Partial<PipelineStep>,
): number {
  if (line.startsWith("agent: ")) {
    step.agentName = line.substring(7).trim();
  } else if (line.startsWith("maxIterations: ")) {
    const iterations = Number.parseInt(line.substring(15).trim(), 10);
    if (!Number.isNaN(iterations)) {
      step.maxIterations = iterations;
    }
  } else if (line.startsWith("doneMarker: ")) {
    step.doneMarker = line.substring(12).trim();
  } else if (line === "prompt: |") {
    const { promptTemplate, nextIndex } = collectPromptLines(
      lines,
      lineIndex + 1,
    );
    step.promptTemplate = promptTemplate;
    // Return nextIndex - 1 because the outer loop will do i++ after this call
    return nextIndex - 1;
  }
  return lineIndex;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Parses a pipeline markdown file into a structured Pipeline object.
 *
 * @param commandName - The name of the command (derived from filename)
 * @param markdown - The markdown content of the pipeline definition
 * @returns A parsed Pipeline object
 * @throws If the markdown format is invalid
 */
export function parsePipeline(commandName: string, markdown: string): Pipeline {
  const lines = markdown.split("\n");

  // Validate and extract command-name header
  const commandNameLine = lines.find((line) => line.startsWith("# "))?.trim();
  if (!commandNameLine) {
    throw new Error("Missing command name in pipeline definition");
  }
  const commandNameFromHeader = commandNameLine.substring(2).trim();
  if (commandNameFromHeader !== commandName) {
    throw new Error(
      `Command name mismatch: expected "${commandName}", got "${commandNameFromHeader}"`,
    );
  }

  // Extract and parse input schema
  const inputSchemaLine = lines
    .find((line) => line.startsWith("Input: "))
    ?.trim();
  if (!inputSchemaLine) {
    throw new Error("Missing input schema in pipeline definition");
  }
  const inputSchema = parseInputSchemaJson(inputSchemaLine.substring(7).trim());

  // Parse steps
  const steps: PipelineStep[] = [];
  let currentStep: Partial<PipelineStep> | null = null;
  let stepNumber = 1;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith("## Step ")) {
      if (currentStep?.stepNumber) {
        steps.push(currentStep as PipelineStep);
      }
      currentStep = {
        stepNumber: stepNumber++,
        stepName: line.substring(9).trim(),
        agentName: "",
        promptTemplate: "",
        maxIterations: 5,
      };
      i++;
      continue;
    }

    if (currentStep) {
      i = applyStepProperty(line, i, lines, currentStep);
    }
    i++;
  }

  if (currentStep?.stepNumber) {
    steps.push(currentStep as PipelineStep);
  }

  if (steps.length === 0) {
    throw new Error("No steps found in pipeline definition");
  }

  return { commandName, inputSchema, steps };
}

/**
 * Interpolates variables into a template string.
 * Replaces {{key}} with vars[key], leaves unknown keys as-is.
 *
 * @param template - The template string with {{placeholders}}
 * @param vars - The variables to interpolate
 * @returns The interpolated string
 */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in vars ? vars[key] : match;
  });
}
