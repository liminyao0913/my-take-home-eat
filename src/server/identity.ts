import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE = "lets_eat_guest";
export function identity(request: NextRequest, issue = false) {
  const value = request.cookies.get(COOKIE)?.value;
  const token = value && /^[a-f0-9]{64}$/.test(value) ? value : issue ? randomBytes(32).toString("hex") : null;
  return { token, hash: token ? createHash("sha256").update(token).digest("hex") : null };
}

export function setIdentity(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60, secure: appOrigin().startsWith("https:") });
}

export function appOrigin() {
  return process.env.APP_ORIGIN || "http://localhost:3000";
}
