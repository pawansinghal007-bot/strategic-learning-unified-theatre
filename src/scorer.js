function toMillis(dateOrNull) {
  if (!dateOrNull) return null;
  const d = dateOrNull instanceof Date ? dateOrNull : new Date(dateOrNull);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function isOnCooldown(account, nowMs) {
  if (account.status === "cooldown") return true;
  const until = toMillis(account.cooldownUntil);
  return typeof until === "number" && until > nowMs;
}

function isRetired(account) {
  return account.status === "retired";
}

export function scoreAccount(account, healthResult, { remainingThreshold = 20 } = {}) {
  const nowMs = Date.now();

  if (isRetired(account)) return 0;
  if (isOnCooldown(account, nowMs)) return 0;

  let score = 0;

  if (healthResult?.valid) score += 50;

  const remaining = healthResult?.remainingRequests;
  if (typeof remaining === "number" && remaining > remainingThreshold) score += 30;

  const lastUsedMs = toMillis(account.lastUsed);
  if (typeof lastUsedMs === "number") {
    const ageMs = Math.max(0, nowMs - lastUsedMs);
    const dayMs = 24 * 60 * 60 * 1000;
    const bonus = Math.max(0, 20 * (1 - Math.min(1, ageMs / dayMs)));
    score += bonus;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return score;
}

export function pickBest(accounts, healthMap, options) {
  const nowMs = Date.now();
  const eligible = accounts.filter((a) => !isRetired(a) && !isOnCooldown(a, nowMs));

  if (eligible.length === 0) {
    throw new Error("No eligible accounts available (all accounts are on cooldown or retired).");
  }

  let best = null;
  let bestScore = -1;

  for (const acct of eligible) {
    const health = healthMap instanceof Map ? healthMap.get(acct.id) : healthMap?.[acct.id];
    const s = scoreAccount(acct, health ?? { valid: false }, options);
    if (s > bestScore) {
      best = acct;
      bestScore = s;
    }
  }

  return best;
}

