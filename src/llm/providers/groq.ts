import { createStubProviderClass } from "./stub-provider-factory";

export const GroqProviderAdapter = createStubProviderClass({
  name: "groq",
  apiKeyEnv: "GROQ_API_KEY",
  model: "llama3-8b-8192",
  outputPrefix: "[groq stub]",
  routingMessage: "Groq adapter selected from configured provider set.",
});
