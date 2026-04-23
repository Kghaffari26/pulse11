import {
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
  validateProjectInput,
  validateProjectPatch,
} from "./projects";

describe("validateProjectInput", () => {
  it("accepts minimal valid input", () => {
    const r = validateProjectInput({ name: "My project" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("My project");
      expect(r.value.color).toBeNull();
      expect(r.value.description).toBeNull();
    }
  });

  it("trims whitespace from name", () => {
    const r = validateProjectInput({ name: "  trimmed  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("trimmed");
  });

  it("coerces empty color and description to null", () => {
    const r = validateProjectInput({ name: "x", color: "", description: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.color).toBeNull();
      expect(r.value.description).toBeNull();
    }
  });

  it("rejects empty name", () => {
    expect(validateProjectInput({ name: "" }).ok).toBe(false);
    expect(validateProjectInput({ name: "   " }).ok).toBe(false);
  });

  it("rejects missing name", () => {
    expect(validateProjectInput({}).ok).toBe(false);
  });

  it("rejects names over the max", () => {
    const over = "a".repeat(PROJECT_NAME_MAX + 1);
    expect(validateProjectInput({ name: over }).ok).toBe(false);
  });

  it("rejects descriptions over the max", () => {
    const over = "a".repeat(PROJECT_DESCRIPTION_MAX + 1);
    expect(validateProjectInput({ name: "x", description: over }).ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateProjectInput(null).ok).toBe(false);
    expect(validateProjectInput("foo").ok).toBe(false);
  });
});

describe("validateProjectPatch", () => {
  it("accepts empty patch as a no-op", () => {
    const r = validateProjectPatch({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value)).toHaveLength(0);
  });

  it("accepts partial updates", () => {
    const r = validateProjectPatch({ archived: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.archived).toBe(true);
  });

  it("rejects empty name on patch", () => {
    expect(validateProjectPatch({ name: "" }).ok).toBe(false);
    expect(validateProjectPatch({ name: "   " }).ok).toBe(false);
  });

  it("rejects non-boolean archived", () => {
    expect(validateProjectPatch({ archived: "true" }).ok).toBe(false);
  });

  it("allows explicit null to clear color/description", () => {
    const r = validateProjectPatch({ color: null, description: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.color).toBeNull();
      expect(r.value.description).toBeNull();
    }
  });
});
