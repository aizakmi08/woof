export const MIN_GOOD_SCORE = 70;
export const MIN_SUCCESSFUL_RESULTS = 2;
export const MIN_SUCCESSES_BETWEEN_PROMPTS = 4;
export const REVIEW_PROMPT_COOLDOWN_SCHEDULE_MS = [
  21 * 24 * 60 * 60 * 1000,
  60 * 24 * 60 * 60 * 1000,
  120 * 24 * 60 * 60 * 1000,
];

export function isEligibleReviewSuccess({ score, scanMode } = {}) {
  return scanMode !== "human_food" && Number(score) >= MIN_GOOD_SCORE;
}

export function reviewPromptCooldownMs(promptCount) {
  const scheduleIndex = Math.min(
    Math.max(0, (Number(promptCount) || 1) - 1),
    REVIEW_PROMPT_COOLDOWN_SCHEDULE_MS.length - 1
  );
  return REVIEW_PROMPT_COOLDOWN_SCHEDULE_MS[scheduleIndex];
}

export function reviewPromptDecision({
  successCount = 0,
  promptCount = 0,
  lastPromptSuccessCount = 0,
  lastPromptAt = 0,
  reviewCompleted = false,
  isPro = false,
  remainingScans = null,
  now = Date.now(),
} = {}) {
  if (reviewCompleted) {
    return { show: false, reason: "review_already_completed" };
  }

  if (successCount < MIN_SUCCESSFUL_RESULTS) {
    return { show: false, reason: "not_enough_successes" };
  }

  if (
    !isPro
    && remainingScans != null
    && Number.isFinite(Number(remainingScans))
    && Number(remainingScans) <= 0
  ) {
    return { show: false, reason: "free_limit_exhausted" };
  }

  if (
    promptCount > 0
    && successCount - lastPromptSuccessCount < MIN_SUCCESSES_BETWEEN_PROMPTS
  ) {
    return { show: false, reason: "not_enough_new_successes" };
  }

  const cooldownMs = reviewPromptCooldownMs(promptCount);
  if (lastPromptAt && now - lastPromptAt < cooldownMs) {
    return { show: false, reason: "cooldown", cooldownMs };
  }

  return { show: true, cooldownMs };
}
