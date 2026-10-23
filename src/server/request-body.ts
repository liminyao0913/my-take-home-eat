import { LIMITS } from "@/lib/limits";
import { ApiError } from "./errors";

const state = globalThis as typeof globalThis & { letsEatBodyReaders?: number };
function rejectBody(request: Request, error: ApiError): never {
  void request.body?.cancel().catch(() => {});
  throw error;
}
export async function readJson(request: Request): Promise<unknown> {
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") rejectBody(request, new ApiError(415, "UNSUPPORTED_ENCODING", "Send uncompressed JSON."));
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) rejectBody(request, new ApiError(400, "INVALID_LENGTH", "Send a valid content length."));
  if (length && Number(length) > LIMITS.bodyBytes) rejectBody(request, new ApiError(413, "BODY_TOO_LARGE", "Keep this request under 128 KiB."));
  if ((state.letsEatBodyReaders ?? 0) >= LIMITS.bodyReaders) rejectBody(request, new ApiError(429, "BODY_CAPACITY", "Too many requests are still uploading. Try again shortly.", undefined, 1));
  if (!request.body) throw new ApiError(400, "INVALID_JSON", "Send a valid JSON request.");
  if (request.body.locked) throw new ApiError(400, "INVALID_JSON", "The request body has already been read.");
  const reader = request.body.getReader();
  state.letsEatBodyReaders = (state.letsEatBodyReaders ?? 0) + 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(408, "BODY_TIMEOUT", "The upload took too long. Try again.")), LIMITS.bodyTimeoutMs);
    abort = () => reject(new ApiError(400, "REQUEST_ABORTED", "The upload was interrupted."));
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
  });
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bodyBytes) throw new ApiError(413, "BODY_TOO_LARGE", "Keep this request under 128 KiB.");
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Send a valid JSON request.");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
    state.letsEatBodyReaders = state.letsEatBodyReaders! - 1;
  }
}
