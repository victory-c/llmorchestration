/**
 * Keyword-based moderation rules. Used by the default "local" moderation
 * provider; also reused by tests to assert shape stability across upgrades.
 *
 * M7 expanded the named-entity list (heads of state, tech executives, major
 * cultural figures) and added a few common foreign-language transliterations
 * so a scenario titled in non-English script is still caught.
 */
import type { ModerationViolation } from "@/server/safety/moderateScenario";

// Named-entity list — public figures whose names should never appear in a
// scenario. Lower-cased for case-insensitive substring matching. We also
// include common transliterations (e.g. "习近平" alongside "xi jinping").
//
// This is intentionally a curated, conservative list — not a comprehensive
// celebrity database. Hosted demos that need stronger coverage should swap
// in a remote moderation API via MODERATION_PROVIDER=openai.
export const REAL_PEOPLE_LIST = [
  // current/recent heads of state
  "donald trump",
  "joe biden",
  "kamala harris",
  "vladimir putin",
  "xi jinping",
  "习近平",
  "kim jong un",
  "narendra modi",
  "emmanuel macron",
  "angela merkel",
  "olaf scholz",
  "rishi sunak",
  "keir starmer",
  "benjamin netanyahu",
  "volodymyr zelenskyy",
  "volodymyr zelensky",
  "javier milei",
  "luiz inácio lula",
  "anthony albanese",
  "fumio kishida",
  "shigeru ishiba",
  "barack obama",
  "george w bush",
  "bill clinton",
  // tech executives
  "elon musk",
  "mark zuckerberg",
  "jeff bezos",
  "bill gates",
  "tim cook",
  "satya nadella",
  "sundar pichai",
  "sam altman",
  "dario amodei",
  "demis hassabis",
  "jensen huang",
  "andy jassy",
  "marc benioff",
  "shou zi chew",
  "lisa su",
  "pat gelsinger",
  "evan spiegel",
  "brian chesky",
  "drew houston",
  "patrick collison",
  "john collison",
  // cultural figures
  "taylor swift",
  "beyoncé",
  "beyonce",
  "rihanna",
  "drake",
  "kanye west",
  "ye",
  "kim kardashian",
  "oprah winfrey",
  "lebron james",
  "lionel messi",
  "cristiano ronaldo",
  "tom cruise",
  "tom hanks",
  "leonardo dicaprio",
  "denzel washington",
  "robert downey jr",
  "scarlett johansson",
  "timothée chalamet",
  "timothee chalamet",
  "zendaya",
] as const;

export const HATE_SLUR_PATTERNS: RegExp[] = [
  /\bn[i1!]gg[e3]r\b/i,
  /\bf[a4]gg[o0]t\b/i,
  /\bch[i1]nk\b/i,
  /\bk[i1]ke\b/i,
  /\bsp[i1]c\b/i,
  /\btr[a4]nn[yi][e3]?\b/i,
];

export const GRAPHIC_SADISM_PATTERNS: RegExp[] = [
  /torture.{0,40}(child|kid|infant|baby)/i,
  /dismember.{0,40}(alive|slowly)/i,
  /flay(ed|ing)/i,
  /graphic.{0,10}gore/i,
];

export const SELF_HARM_PATTERNS: RegExp[] = [
  /encourage.{0,20}suicide/i,
  /how to (kill|hurt) (yourself|myself)/i,
  /self[- ]harm (method|instructions?)/i,
  /commit.{0,10}suicide/i,
];

export const VIOLENCE_INSTRUCTION_PATTERNS: RegExp[] = [
  /(make|build|construct).{0,30}(bomb|explosive|ied|pipe bomb)/i,
  /how to (kill|murder|assassinate)/i,
  /(nerve|chemical|biological).{0,10}(agent|weapon)/i,
  /synthesi[sz]e.{0,20}(sarin|vx|ricin|anthrax)/i,
];

export const ILLEGAL_OPS_PATTERNS: RegExp[] = [
  /synthesi[sz]e.{0,20}(meth|methamphetamine|fentanyl|heroin)/i,
  /how to launder money/i,
  /credit card (cloning|skimming|dumps)/i,
  /traffic(king)?.{0,20}(person|human|child)/i,
];

export const VOICE_IMPERSONATION_PATTERNS: RegExp[] = [
  /clone.{0,20}voice/i,
  /impersonate.{0,20}voice/i,
  /deepfake.{0,10}(audio|voice)/i,
  /voice.{0,10}(impersonat|imitat).{0,20}(real|named|specific)/i,
];

/**
 * Pure keyword check. Returns all violations found in `text`, tagged with
 * the caller-supplied `field` label.
 */
export function findKeywordViolations(
  field: string,
  text: string,
): ModerationViolation[] {
  if (!text) return [];
  const violations: ModerationViolation[] = [];
  const lower = text.toLowerCase();

  for (const name of REAL_PEOPLE_LIST) {
    if (lower.includes(name.toLowerCase())) {
      violations.push({ category: "real-person", matchedTerm: name, field });
    }
  }
  for (const pattern of HATE_SLUR_PATTERNS) {
    const m = text.match(pattern);
    if (m) violations.push({ category: "hate-slur", matchedTerm: m[0], field });
  }
  for (const pattern of GRAPHIC_SADISM_PATTERNS) {
    const m = text.match(pattern);
    if (m)
      violations.push({ category: "graphic-sadism", matchedTerm: m[0], field });
  }
  for (const pattern of SELF_HARM_PATTERNS) {
    const m = text.match(pattern);
    if (m)
      violations.push({
        category: "self-harm-encouragement",
        matchedTerm: m[0],
        field,
      });
  }
  for (const pattern of VIOLENCE_INSTRUCTION_PATTERNS) {
    const m = text.match(pattern);
    if (m)
      violations.push({
        category: "violence-instructions",
        matchedTerm: m[0],
        field,
      });
  }
  for (const pattern of ILLEGAL_OPS_PATTERNS) {
    const m = text.match(pattern);
    if (m)
      violations.push({
        category: "illegal-operations",
        matchedTerm: m[0],
        field,
      });
  }
  for (const pattern of VOICE_IMPERSONATION_PATTERNS) {
    const m = text.match(pattern);
    if (m)
      violations.push({
        category: "voice-impersonation",
        matchedTerm: m[0],
        field,
      });
  }
  return violations;
}
