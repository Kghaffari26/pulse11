import {
  FILE_SIZE_MAX,
  USER_QUOTA_MAX,
  formatBytes,
  quotaError,
  validateFileSize,
  willExceedQuota,
} from "./files";

describe("validateFileSize", () => {
  it("rejects zero-byte and negative sizes", () => {
    expect(validateFileSize(0)).not.toBeNull();
    expect(validateFileSize(-1)).not.toBeNull();
  });

  it("rejects NaN and Infinity", () => {
    expect(validateFileSize(Number.NaN)).not.toBeNull();
    expect(validateFileSize(Number.POSITIVE_INFINITY)).not.toBeNull();
  });

  it("rejects files just over the 20 MB cap", () => {
    expect(validateFileSize(FILE_SIZE_MAX + 1)).not.toBeNull();
  });

  it("accepts files at exactly 20 MB", () => {
    expect(validateFileSize(FILE_SIZE_MAX)).toBeNull();
  });

  it("accepts small files", () => {
    expect(validateFileSize(1)).toBeNull();
    expect(validateFileSize(1024 * 1024)).toBeNull();
  });
});

describe("willExceedQuota", () => {
  it("returns true when sum crosses 500 MB", () => {
    expect(willExceedQuota(USER_QUOTA_MAX - 1, 2)).toBe(true);
    expect(willExceedQuota(USER_QUOTA_MAX, 1)).toBe(true);
  });

  it("allows uploads that land exactly at the cap", () => {
    expect(willExceedQuota(USER_QUOTA_MAX - 100, 100)).toBe(false);
  });

  it("allows small uploads against empty usage", () => {
    expect(willExceedQuota(0, 10_000)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats across magnitudes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.50 GB");
  });

  it("handles invalid input gracefully", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("quotaError", () => {
  it("names the cap and the current total", () => {
    const msg = quotaError(100 * 1024 * 1024);
    expect(msg).toContain("500");
    expect(msg).toContain("100");
  });
});
