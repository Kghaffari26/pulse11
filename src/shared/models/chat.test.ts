import { CHAT_MESSAGE_MAX, validateChatMessage } from "./chat";

describe("validateChatMessage", () => {
  it("rejects non-strings", () => {
    expect(validateChatMessage(123)).toEqual({ ok: false, error: "message must be a string" });
    expect(validateChatMessage(null)).toEqual({ ok: false, error: "message must be a string" });
    expect(validateChatMessage(undefined)).toEqual({ ok: false, error: "message must be a string" });
  });

  it("rejects empty / whitespace messages", () => {
    expect(validateChatMessage("")).toEqual({ ok: false, error: "message is required" });
    expect(validateChatMessage("   ")).toEqual({ ok: false, error: "message is required" });
  });

  it("rejects messages over the limit", () => {
    const tooLong = "a".repeat(CHAT_MESSAGE_MAX + 1);
    const result = validateChatMessage(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/<= 4000 characters/);
  });

  it("trims and returns the validated value", () => {
    const result = validateChatMessage("  hello  ");
    expect(result).toEqual({ ok: true, value: "hello" });
  });
});
