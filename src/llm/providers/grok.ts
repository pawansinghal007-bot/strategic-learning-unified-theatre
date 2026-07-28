import { createStubProviderClass } from "./stub-provider-factory";

export const GrokProviderAdapter = createStubProviderClass({
  name: "grok",
  apiKeyEnv: "XAI_API_KEY",
  model: "grok-3",
  outputPrefix: "[grok stub]",
  routingMessage: "Grok adapter selected from configured provider set.",
});
