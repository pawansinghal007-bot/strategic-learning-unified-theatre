const RULES = [
  {
    type: "pii",
    patterns: [
      /\bpan\b/i,
      /\baadhaar\b/i,
      /\bpassport\b/i,
      /\bssn\b/i,
      /\bsocial security\b/i,
      /\bdate of birth\b/i,
      /\bphone number\b/i,
      /\bhome address\b/i,
      /\bpersonal address\b/i,
    ],
    reason: "Detected potential personally identifiable information.",
    forceLocal: true,
  },
  {
    type: "credentials",
    patterns: [
      /\bapi key\b/i,
      /\bsecret key\b/i,
      /\bpassword\b/i,
      /\btoken\b/i,
      /\bprivate key\b/i,
      /\bcredential\b/i,
    ],
    reason: "Detected secrets or credentials.",
    forceLocal: true,
  },
  {
    type: "finance",
    patterns: [
      /\bbank statement\b/i,
      /\baccount number\b/i,
      /\bifsc\b/i,
      /\bcredit card\b/i,
      /\bfinancial report\b/i,
      /\binvoice\b/i,
      /\bbalance sheet\b/i,
    ],
    reason: "Detected finance-sensitive content.",
    approvedProvidersOnly: ["openai", "gemini", "local"],
  },
  {
    type: "legal",
    patterns: [
      /\bcontract\b/i,
      /\bnda\b/i,
      /\blegal notice\b/i,
      /\bcompliance\b/i,
      /\bregulatory\b/i,
    ],
    reason: "Detected legal or compliance-sensitive content.",
    approvedProvidersOnly: ["openai", "local"],
  },
  {
    type: "security",
    patterns: [
      /\bvulnerability\b/i,
      /\bexploit\b/i,
      /\bpenetration test\b/i,
      /\bsecurity audit\b/i,
      /\bincident\b/i,
    ],
    reason: "Detected security-sensitive content.",
    approvedProvidersOnly: ["openai", "local"],
  },
];

function requestText(request) {
  const prompt = (request.prompt ?? "").trim();
  const memory = Array.isArray(request.memory) ? request.memory.join(" ") : "";
  return `${prompt}\n${memory}`.trim();
}

export function detectSensitiveTask(request) {
  const text = requestText(request);
  const reasons = [];
  const detectedTypes = [];
  let forceLocal = false;
  let approvedProvidersOnly = null;

  for (const rule of RULES) {
    const matched = rule.patterns.some((pattern) => pattern.test(text));
    if (!matched) continue;

    reasons.push(rule.reason);
    detectedTypes.push(rule.type);

    if (rule.forceLocal) {
      forceLocal = true;
    }

    if (rule.approvedProvidersOnly) {
      approvedProvidersOnly = approvedProvidersOnly
        ? approvedProvidersOnly.filter((p) =>
            rule.approvedProvidersOnly.includes(p),
          )
        : [...rule.approvedProvidersOnly];
    }
  }

  return {
    matched: reasons.length > 0,
    reasons,
    detectedTypes,
    forceLocal,
    approvedProvidersOnly,
  };
}
