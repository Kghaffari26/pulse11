import {
  extractText,
  ExtractionError,
  MAX_EXTRACTED_CHARS,
} from "./file-text-extractor";

function bufResponse(buf: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  } as unknown as Response;
}

function makeFetch(buf: Buffer | null, status = 200): typeof fetch {
  return (async () => {
    if (buf === null) throw new Error("network down");
    return bufResponse(buf, status >= 200 && status < 300, status);
  }) as typeof fetch;
}

describe("file-text-extractor", () => {
  describe("plain text", () => {
    it("extracts text/plain content", async () => {
      const buf = Buffer.from("Hello, world.\nLine two.", "utf-8");
      const result = await extractText("https://blob/x.txt", "text/plain", "x.txt", {
        fetchFn: makeFetch(buf),
      });
      expect(result.text).toBe("Hello, world.\nLine two.");
      expect(result.truncated).toBe(false);
    });

    it("extracts text/markdown content", async () => {
      const buf = Buffer.from("# Heading\n\n* a\n* b", "utf-8");
      const result = await extractText("https://blob/x.md", "text/markdown", "x.md", {
        fetchFn: makeFetch(buf),
      });
      expect(result.text).toBe("# Heading\n\n* a\n* b");
      expect(result.truncated).toBe(false);
    });

    it("normalizes mime type case + whitespace", async () => {
      const buf = Buffer.from("ok", "utf-8");
      const result = await extractText("https://blob/x.txt", "  TEXT/PLAIN  ", "x.txt", {
        fetchFn: makeFetch(buf),
      });
      expect(result.text).toBe("ok");
    });
  });

  describe("PDF", () => {
    it("routes application/pdf through parsePdf", async () => {
      const buf = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      const parsePdf = jest.fn().mockResolvedValue("extracted pdf text");
      const result = await extractText("https://blob/x.pdf", "application/pdf", "x.pdf", {
        fetchFn: makeFetch(buf),
        parsePdf,
      });
      expect(parsePdf).toHaveBeenCalledWith(buf);
      expect(result.text).toBe("extracted pdf text");
      expect(result.truncated).toBe(false);
    });

    it("wraps parsePdf failures in ExtractionError with filename", async () => {
      const buf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const parsePdf = jest.fn().mockRejectedValue(new Error("not a valid PDF"));
      await expect(
        extractText("https://blob/x.pdf", "application/pdf", "syllabus.pdf", {
          fetchFn: makeFetch(buf),
          parsePdf,
        }),
      ).rejects.toThrow(ExtractionError);
      await expect(
        extractText("https://blob/x.pdf", "application/pdf", "syllabus.pdf", {
          fetchFn: makeFetch(buf),
          parsePdf,
        }),
      ).rejects.toThrow(/syllabus.pdf.*not a valid PDF/);
    });
  });

  describe("DOCX", () => {
    it("routes the DOCX mime through parseDocx", async () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK..
      const parseDocx = jest.fn().mockResolvedValue("docx body text");
      const result = await extractText(
        "https://blob/x.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "report.docx",
        { fetchFn: makeFetch(buf), parseDocx },
      );
      expect(parseDocx).toHaveBeenCalledWith(buf);
      expect(result.text).toBe("docx body text");
    });

    it("wraps parseDocx failures", async () => {
      const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const parseDocx = jest.fn().mockRejectedValue(new Error("corrupt zip"));
      await expect(
        extractText(
          "https://blob/x.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "report.docx",
          { fetchFn: makeFetch(buf), parseDocx },
        ),
      ).rejects.toThrow(/report.docx.*corrupt zip/);
    });
  });

  describe("truncation", () => {
    it("returns truncated:true and caps length at MAX_EXTRACTED_CHARS", async () => {
      const overLimit = "a".repeat(MAX_EXTRACTED_CHARS + 500);
      const buf = Buffer.from(overLimit, "utf-8");
      const result = await extractText("https://blob/x.txt", "text/plain", "huge.txt", {
        fetchFn: makeFetch(buf),
      });
      expect(result.text.length).toBe(MAX_EXTRACTED_CHARS);
      expect(result.truncated).toBe(true);
    });

    it("does not truncate exactly at the limit", async () => {
      const exact = "b".repeat(MAX_EXTRACTED_CHARS);
      const buf = Buffer.from(exact, "utf-8");
      const result = await extractText("https://blob/x.txt", "text/plain", "edge.txt", {
        fetchFn: makeFetch(buf),
      });
      expect(result.text.length).toBe(MAX_EXTRACTED_CHARS);
      expect(result.truncated).toBe(false);
    });
  });

  describe("error paths", () => {
    it("throws ExtractionError for unsupported mime types", async () => {
      const buf = Buffer.from("anything");
      await expect(
        extractText("https://blob/x.bin", "application/octet-stream", "weird.bin", {
          fetchFn: makeFetch(buf),
        }),
      ).rejects.toThrow(/weird.bin.*unsupported mime type: application\/octet-stream/);
    });

    it("throws ExtractionError on non-2xx fetch", async () => {
      await expect(
        extractText("https://blob/missing.pdf", "application/pdf", "missing.pdf", {
          fetchFn: makeFetch(Buffer.from(""), 404),
        }),
      ).rejects.toThrow(/missing.pdf.*fetch failed \(404\)/);
    });

    it("throws ExtractionError on network exception", async () => {
      await expect(
        extractText("https://blob/down.pdf", "application/pdf", "down.pdf", {
          fetchFn: makeFetch(null),
        }),
      ).rejects.toThrow(/down.pdf.*network down/);
    });

    it("falls back to '(unknown)' when filename is omitted", async () => {
      const buf = Buffer.from("");
      await expect(
        extractText("https://blob/x.bin", "application/octet-stream", undefined, {
          fetchFn: makeFetch(buf),
        }),
      ).rejects.toThrow(/\(unknown\)/);
    });
  });
});
