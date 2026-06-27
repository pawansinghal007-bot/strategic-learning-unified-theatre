export type SourceType =
  | "sprint_report"
  | "architecture_doc"
  | "test_file"
  | "ipc_handler"
  | "service";

/** Runtime list of every valid SourceType, kept in sync with the union above. */
export const SOURCE_TYPES: SourceType[] = [
  "sprint_report",
  "architecture_doc",
  "test_file",
  "ipc_handler",
  "service",
];

/** Type guard for narrowing an unknown value to SourceType at runtime. */
export function isSourceType(value: unknown): value is SourceType {
  return (
    typeof value === "string" && (SOURCE_TYPES as string[]).includes(value)
  );
}

export interface KnowledgeDocument {
  id: string;
  sourceType: SourceType;
  title: string;
  path: string;
  sprint?: number;
  module?: string;
  featureArea?: string;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
  rawText: string;
}
