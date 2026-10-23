import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string[]>, public retryAfter?: number) {
    super(message);
  }
}

export function isSqliteBusy(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && typeof error.code === "string" && /^SQLITE_(BUSY|LOCKED)/.test(error.code)) return true;
  return "cause" in error && error.cause !== error && isSqliteBusy(error.cause);
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
  throw new ApiError(400, "INVALID_INPUT", "Check the highlighted fields.", fieldErrors);
}
