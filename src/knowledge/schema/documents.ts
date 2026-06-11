export type SourceType =
  | "sprint_report"
  | "architecture_doc"
  | "test_file"
  | "ipc_handler"
  | "service";

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
