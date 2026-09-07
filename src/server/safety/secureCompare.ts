import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two secret tokens. Hashing both sides to a
 * fixed-size digest keeps the comparison constant-time regardless of length
 * and avoids the `===` short-circuit that can leak how many leading
 * characters matched. Returns false if either side is missing.
 */
export function tokensMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (a == null || b == null) return false;
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}
