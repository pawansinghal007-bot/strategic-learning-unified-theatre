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

/**
 * Parses a pipeline markdown file into a structured Pipeline object.
 *
 * @param commandName - The name of the command (derived from filename)
 * @param markdown - The markdown content of the pipeline definition
 * @returns A parsed Pipeline object
 * @throws If the markdown format is invalid
 */
export function parsePipeline(commandName: string, markdown: string): Pipeline {
  // Split markdown into lines
  const lines = markdown.split("\n");

  // Find command name and input schema
  let commandNameLine = lines.find((line) => line.startsWith("# "));
  if (!commandNameLine) {
    throw new Error("Missing command name in pipeline definition");
  }
  commandNameLine = commandNameLine.trim();
  if (!commandNameLine.startsWith("# ")) {
    throw new Error("Invalid command name format");
  }

  const commandNameFromHeader = commandNameLine.substring(2).trim();
  if (commandNameFromHeader !== commandName) {
    throw new Error(
      `Command name mismatch: expected "${commandName}", got "${commandNameFromHeader}"`,
    );
  }

  // Find input schema
  let inputSchemaLine = lines.find((line) => line.startsWith("Input: "));
  if (!inputSchemaLine) {
    throw new Error("Missing input schema in pipeline definition");
  }
  inputSchemaLine = inputSchemaLine.trim();
  if (!inputSchemaLine.startsWith("Input: ")) {
    throw new Error("Invalid input schema format");
  }

  const inputSchemaStr = inputSchemaLine.substring(7).trim();
  let inputSchema: Record<string, string>;
  try {
    // Try to parse as JSON
    inputSchema = JSON.parse(inputSchemaStr);
  } catch (e) {
    // If not valid JSON, treat as empty object
    inputSchema = {};
  }

  // Parse steps
  const steps: PipelineStep[] = [];
  let currentStep: Partial<PipelineStep> | null = null;
  let stepNumber = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for step header
    if (line.startsWith("## Step ")) {
      // Save previous step if exists
      if (currentStep && currentStep.stepNumber) {
        steps.push(currentStep as PipelineStep);
      }

      // Start new step
      currentStep = {
        stepNumber: stepNumber++,
        stepName: line.substring(9).trim(), // Remove "## Step "
        agentName: "",
        promptTemplate: "",
        maxIterations: 5,
      };

      continue;
    }

    // Parse step properties
    if (currentStep && line.startsWith("agent: ")) {
      currentStep.agentName = line.substring(7).trim();
    } else if (currentStep && line.startsWith("maxIterations: ")) {
      const iterations = parseInt(line.substring(13).trim(), 10);
      if (!isNaN(iterations)) {
        currentStep.maxIterations = iterations;
      }
    } else if (currentStep && line.startsWith("doneMarker: ")) {
      currentStep.doneMarker = line.substring(10).trim();
    } else if (currentStep && line === "prompt: |") {
      // Collect the prompt content (next lines until next section or end)
      let promptLines: string[] = [];
      i++; // Skip the "prompt: |" line
      while (
        i < lines.length &&
        !lines[i].startsWith("## Step ") &&
        !lines[i].startsWith("Input: ")
      ) {
        // Check if we have a line that starts with spaces (indicating continuation)
        if (lines[i].trim() === "" || lines[i].startsWith("  ")) {
          promptLines.push(lines[i]);
          i++;
        } else {
          break;
        }
      }
      // Join the prompt lines, removing the first line (which was just "prompt: |")
      currentStep.promptTemplate = promptLines.join("\n").trim();
    }
  }

  // Save the last step
  if (currentStep && currentStep.stepNumber) {
    steps.push(currentStep as PipelineStep);
  }

  // Validate that we have at least one step
  if (steps.length === 0) {
    throw new Error("No steps found in pipeline definition");
  }

  return {
    commandName,
    inputSchema,
    steps,
  };
}

/**
 * Parses input schema from a line like: { fieldName: type, ... }
 */
function parseInputSchema(
  content: string,
  schema: Record<string, string>,
): void {
  // Remove braces and split by comma
  const cleaned = content.replace(/^\{|\}$/g, "").trim();
  if (!cleaned) return;

  // Simple parsing - split by comma and extract key-value pairs
  const pairs = cleaned.split(",");
  for (const pair of pairs) {
    const [key, value] = pair.split(":").map((s) => s.trim());
    if (key && value) {
      schema[key] = value;
    }
  }
}

/**
 * Validates the parsed pipeline structure.
 */
function validatePipeline(pipeline: Pipeline): void {
  if (!pipeline.commandName) {
    throw new Error("Pipeline must have a command name");
  }

  if (pipeline.steps.length === 0) {
    throw new Error(
      `Pipeline '${pipeline.commandName}' must have at least one step`,
    );
  }

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];

    if (!step.agentName) {
      throw new Error(
        `Step ${step.stepNumber} in pipeline '${pipeline.commandName}' must specify an agent`,
      );
    }

    if (!step.promptTemplate) {
      throw new Error(
        `Step ${step.stepNumber} in pipeline '${pipeline.commandName}' must have a prompt`,
      );
    }

    if (step.stepNumber !== i + 1) {
      throw new Error(
        `Step numbers in pipeline '${pipeline.commandName}' must be sequential, found step ${step.stepNumber} at index ${i}`,
      );
    }
  }
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
    if (key in vars) {
      return vars[key];
    }
    // Leave unknown keys as-is
    return match;
  });
}
