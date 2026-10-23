export const LIMITS = {
  bodyBytes: 128 * 1024,
  bodyTimeoutMs: 10_000,
  bodyReaders: 32,
  options: 20,
  participants: 32,
  rounds: 100,
  openRounds: 100,
  rooms: 10_000,
} as const;
