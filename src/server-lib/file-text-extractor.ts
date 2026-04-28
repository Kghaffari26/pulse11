/**
 * Server-side text extraction for project files used as AI chat context.
 * Supports plain text, markdown, PDF (unpdf), and DOCX (mammoth).
 *
 * Output is capped at MAX_EXTRACTED_CHARS per file; callers should treat
 * `truncated: true` as a signal that the file may have additional content.
 *
 * On any failure (fetch, parse, unsupported mime type) throws ExtractionError
 * so the caller can log and skip the file without aborting the whole request.
 */

export interface ExtractedDoc {
  text: string;
  truncated: boolean;
}

export interface ExtractionDeps {
  fetchFn?: typeof fetch;
  parsePdf?: (buf: Buffer) => Promise<string>;
  parseDocx?: (buf: Buffer) => Promise<string>;
}

export class ExtractionError extends Error {
  constructor(
    public readonly filename: string,
    public readonly reason: string,
  ) {
    super(`Failed to extract text from ${filename}: ${reason}`);
    this.name = "ExtractionError";
  }
}

export const MAX_EXTRACTED_CHARS = 30_000;

const PLAIN_TEXT_MIMES = new Set(["text/plain", "text/markdown"]);
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SUPPORTED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  PDF_MIME,
  DOCX_MIME,
] as const;

async function defaultParsePdf(buf: Buffer): Promise<string> {
  // unpdf ships a serverless-tuned pdfjs build with no worker file or native
  // assets, so NFT can trace the full module graph and the parser runs end-to-
  // end in a Vercel function. Dynamic import keeps the dep lazy.
  const { extractText } = await import("unpdf");
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const result = await extractText(data, { mergePages: true });
  return result.text;
}

async function defaultParseDocx(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value;
}

function truncate(text: string): ExtractedDoc {
  if (text.length > MAX_EXTRACTED_CHARS) {
    return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
  }
  return { text, truncated: false };
}

export async function extractText(
  blobUrl: string,
  mimeType: string,
  filename = "(unknown)",
  deps: ExtractionDeps = {},
): Promise<ExtractedDoc> {
  const fetchFn = deps.fetchFn ?? fetch;
  const parsePdf = deps.parsePdf ?? defaultParsePdf;
  const parseDocx = deps.parseDocx ?? defaultParseDocx;

  let buf: Buffer;
  try {
    const res = await fetchFn(blobUrl);
    if (!res.ok) {
      throw new ExtractionError(filename, `fetch failed (${res.status})`);
    }
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(filename, err instanceof Error ? err.message : "fetch error");
  }

  const mt = (mimeType ?? "").toLowerCase().trim();

  try {
    if (PLAIN_TEXT_MIMES.has(mt)) {
      return truncate(buf.toString("utf-8"));
    }
    if (mt === PDF_MIME) {
      return truncate(await parsePdf(buf));
    }
    if (mt === DOCX_MIME) {
      return truncate(await parseDocx(buf));
    }
    throw new ExtractionError(filename, `unsupported mime type: ${mimeType}`);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    throw new ExtractionError(filename, err instanceof Error ? err.message : "parse error");
  }
}
