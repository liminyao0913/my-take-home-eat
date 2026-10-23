import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./db";
import { credentialFor, pruneExpiredProfiles } from "./profile-store";

const COOKIE = "lets_eat_guest";
const resolved = new WeakMap<NextRequest, { token: string | null; hash: string | null }>();
export function identity(request: NextRequest, issue = false) {
  const cached = resolved.get(request);
  if (cached && (cached.token || !issue)) return cached;
  const { db } = getDatabase();
  const now = Date.now();
  db.transaction((tx) => pruneExpiredProfiles(tx, now), { behavior: "immediate" });
  const value = request.cookies.get(COOKIE)?.value;
  const known = value && /^[a-f0-9]{64}$/.test(value) && credentialFor(db, createHash("sha256").update(value).digest("hex"), now, true);
  const token = known ? value! : issue ? randomBytes(32).toString("hex") : null;
  const result = { token, hash: token ? createHash("sha256").update(token).digest("hex") : null };
  resolved.set(request, result);
  return result;
}

export function setIdentity(response: NextResponse, token: string) {
  const credential = credentialFor(getDatabase().db, createHash("sha256").update(token).digest("hex"), Date.now());
  if (!credential) return;
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(credential.expiresAt), secure: appOrigin().startsWith("https:") });
}

export function clearIdentity(response: NextResponse) { response.cookies.set(COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:") }); }

export function refreshIdentity(request: NextRequest, response: NextResponse) {
  if (response.headers.has("set-cookie") || !request.cookies.has(COOKIE)) return;
  const guest = identity(request);
  if (guest.token) setIdentity(response, guest.token);
  else clearIdentity(response);
}

export function appOrigin() {
  return process.env.APP_ORIGIN || "http://localhost:3000";
}
