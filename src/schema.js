import { z } from "zod";

const DateOrNull = z.preprocess((v) => {
  if (v === null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return v;
}, z.date().nullable());

export const AgentTypeSchema = z.enum(["vscode", "github", "codex", "trae", "other"]);
export const AccountStatusSchema = z.enum(["active", "cooldown", "retired"]);

export const AccountSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  agentType: AgentTypeSchema,
  authBlob: z.preprocess((v) => (v === undefined ? null : v), z.string().min(1).nullable()),
  profileName: z.preprocess((v) => (v === undefined ? null : v), z.string().min(1).nullable()),
  cooldownUntil: DateOrNull,
  lastUsed: DateOrNull,
  status: AccountStatusSchema
});
