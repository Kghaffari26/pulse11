import {
  currentYyyymm,
  GEMINI_KEY_LENGTH,
  validateAgentGoal,
  validateGeminiApiKey,
} from "./ai";

describe("validateGeminiApiKey", () => {
  const good = "AIzaSyBkpF86y1-RZLtd7OeNXp0MDhV5lShoEnM";

  test("accepts a correctly-formatted Gemini key", () => {
    const r = validateGeminiApiKey(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(good);
  });

  test("trims surrounding whitespace", () => {
    const r = validateGeminiApiKey(`  ${good}  `);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(good);
  });

  test("rejects missing AIza prefix", () => {
    const r = validateGeminiApiKey("sk-" + "x".repeat(GEMINI_KEY_LENGTH - 3));
    expect(r.ok).toBe(false);
  });

  test("rejects wrong length", () => {
    expect(validateGeminiApiKey("AIza" + "x".repeat(GEMINI_KEY_LENGTH - 4 + 1)).ok).toBe(false);
    expect(validateGeminiApiKey("AIza" + "x".repeat(GEMINI_KEY_LENGTH - 4 - 1)).ok).toBe(false);
  });

  test("rejects invalid characters", () => {
    const withSpace = "AIza " + "x".repeat(GEMINI_KEY_LENGTH - 5);
    expect(validateGeminiApiKey(withSpace).ok).toBe(false);
  });

  test("rejects non-string input", () => {
    expect(validateGeminiApiKey(null).ok).toBe(false);
    expect(validateGeminiApiKey(undefined).ok).toBe(false);
    expect(validateGeminiApiKey(123).ok).toBe(false);
  });
});

describe("currentYyyymm", () => {
  test("formats month-of-year with zero padding", () => {
    expect(currentYyyymm(new Date(2026, 0, 15))).toBe("2026-01");
    expect(currentYyyymm(new Date(2026, 11, 1))).toBe("2026-12");
    expect(currentYyyymm(new Date(2026, 3, 23))).toBe("2026-04");
  });
});

describe("validateAgentGoal", () => {
  test("accepts a non-empty string", () => {
    const r = validateAgentGoal("Plan my week");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Plan my week");
  });
  test("trims whitespace", () => {
    const r = validateAgentGoal("  Plan my week  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Plan my week");
  });
  test("rejects empty", () => {
    expect(validateAgentGoal("").ok).toBe(false);
    expect(validateAgentGoal("   ").ok).toBe(false);
  });
  test("rejects non-string", () => {
    expect(validateAgentGoal(null).ok).toBe(false);
  });
  test("rejects goal over the max length", () => {
    expect(validateAgentGoal("x".repeat(2001)).ok).toBe(false);
  });
});
