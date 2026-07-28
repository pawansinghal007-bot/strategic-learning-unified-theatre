import { createStubProviderClass } from "./stub-provider-factory";

export const OpenAIProviderAdapter = createStubProviderClass({
  name: "openai",
  apiKeyEnv: "OPENAI_API_KEY",
  model: "gpt-4o-mini",
  outputPrefix: "[openai stub]",
  routingMessage: "OpenAI adapter selected from configured provider set.",
});
