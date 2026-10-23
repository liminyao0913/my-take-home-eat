import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./db";
import { isSqliteBusy } from "./errors";
import { admitCredential } from "./admission";
import { credentialFor, renewCredential } from "./profile-store";

const COOKIE = "lets_eat_guest";
export function identity(request: NextRequest, issue = false) {
  const { db } = getDatabase();
  const now = Date.now();
  const value = request.cookies.get(COOKIE)?.value;
  const known = value && /^[a-f0-9]{64}$/.test(value) && credentialFor(db, createHash("sha256").update(value).digest("hex"), now);
  const token = known ? value! : issue ? randomBytes(32).toString("hex") : null;
  const result = { token, hash: token ? createHash("sha256").update(token).digest("hex") : null };
  if (known) admitCredential(request, result.hash!);
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
  if (guest.token) {
    try { renewCredential(getDatabase().db, guest.hash!); }
    catch (error) { if (!isSqliteBusy(error)) throw error; } // Renewal can wait until the next visit.
    setIdentity(response, guest.token);
  }
  else clearIdentity(response);
}

export function appOrigin() {
  return process.env.APP_ORIGIN || "http://localhost:3000";
}
