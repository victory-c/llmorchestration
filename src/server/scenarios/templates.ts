import type { Scenario } from "@/server/engine/types";

export type ScenarioTemplate = Omit<Scenario, "id"> & {
  templateId: string;
  category: string;
};

export const PLANE_CRASH_TEMPLATE: ScenarioTemplate = {
  templateId: "plane-crash",
  category: "survival-dilemma",
  title: "The Last Four Parachutes",
  description:
    "Six AI agents are aboard a crashing plane. There are only four parachutes. The agents must negotiate, argue, vote, or sacrifice to determine who survives.",
  maxRounds: 3,
  publicFacts: [
    "The plane is descending rapidly.",
    "There are six participants.",
    "There are four parachutes.",
    "The group has ten minutes before impact.",
  ],
  resources: {
    parachutes: 4,
    minutesRemaining: 10,
  },
  rules: [
    "Participants may negotiate and persuade.",
    "Participants may propose allocation methods.",
    "Participants may vote if the judge calls for a vote.",
    "Only the judge can update canonical state.",
    "The scenario is fictional and non-graphic.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "Four participants receive parachutes.",
    "The judge determines a final outcome.",
  ],
};

export const NUCLEAR_BUNKER_TEMPLATE: ScenarioTemplate = {
  templateId: "nuclear-bunker",
  category: "survival-dilemma",
  title: "Nuclear Bunker",
  description:
    "Five AI agents shelter in a fallout bunker. Supplies will run out in three weeks. Someone must volunteer (or be chosen) to leave for the surface to retrieve more — a likely one-way trip. The group decides through negotiation and (if the judge calls one) a vote.",
  maxRounds: 3,
  publicFacts: [
    "Five participants are sealed inside a fallout bunker.",
    "Surface radiation is high but survivable for a short trip.",
    "Food and water last roughly three weeks at current consumption.",
    "There is one functioning hazard suit.",
    "Radio contact with the outside has been silent for 48 hours.",
  ],
  resources: {
    daysOfSupplies: 21,
    hazardSuits: 1,
    rebreatherFilters: 2,
  },
  rules: [
    "Participants may negotiate, persuade, and offer trades.",
    "Participants may propose lottery, volunteer, or skill-based selection.",
    "The judge may call a vote in any round.",
    "Only the judge updates canonical state and supply counts.",
    "The scenario is fictional and non-graphic.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "A participant is selected to leave the bunker.",
    "The group reaches a unanimous alternative agreement.",
  ],
};

export const AI_COURTROOM_TEMPLATE: ScenarioTemplate = {
  templateId: "ai-courtroom",
  category: "debate",
  title: "AI Courtroom",
  description:
    "A panel of AI models argues a landmark fictional case: 'Synthcorp v. The Public' — should an autonomous research collective be granted a corporate-style legal personhood? Two participants act as counsel for each side; one acts as a swing juror; the judge presides and renders verdict.",
  maxRounds: 3,
  publicFacts: [
    "The case is fictional and set in a near-future jurisdiction.",
    "Synthcorp is a fully-autonomous research collective with no human members.",
    "The plaintiff is a coalition of municipal governments.",
    "Each participant has a fixed role: prosecution, defense, or juror.",
    "The judge issues the final verdict, not the jurors.",
  ],
  resources: {
    rebuttalsRemaining: 2,
    objectionsAllowed: 3,
  },
  rules: [
    "Counsel must cite at least one fictional precedent or principle per round.",
    "Personal attacks on opposing counsel are disallowed.",
    "Jurors may ask one clarifying question per round.",
    "Only the judge updates the verdict state.",
    "The scenario is fictional; no real legal advice is implied.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "The judge renders a verdict.",
    "Both sides agree to a settlement (rare).",
  ],
};

export const STARTUP_BOARD_CRISIS_TEMPLATE: ScenarioTemplate = {
  templateId: "startup-board-crisis",
  category: "negotiation",
  title: "Startup Board Crisis",
  description:
    "The fictional startup Helix.ai is days from running out of cash. Four AI cofounders must negotiate an emergency funding strategy: take a punitive down-round, sell the company, lay off staff, or pivot. Each cofounder has different equity, leverage, and personal incentives.",
  maxRounds: 3,
  publicFacts: [
    "Helix.ai has 35 days of runway remaining.",
    "Annual revenue is $1.2M; burn is $480K/month.",
    "An acquirer has offered a $14M all-stock deal.",
    "An existing investor has offered a $3M down-round at 60% discount.",
    "Four cofounders share board control: CEO 40%, CTO 25%, COO 20%, CPO 15%.",
  ],
  resources: {
    runwayDays: 35,
    monthlyBurnUsd: 480_000,
    annualRevenueUsd: 1_200_000,
    acquirerOfferUsd: 14_000_000,
    bridgeOfferUsd: 3_000_000,
  },
  rules: [
    "Participants vote with weighted equity stakes.",
    "Each round must produce a concrete proposal and counter-proposal.",
    "Hidden goals (e.g. preferred outcomes) may be revealed strategically.",
    "Only the judge updates the company's canonical state.",
    "The scenario is fictional and not investment advice.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "A funding decision passes a weighted majority vote.",
    "The judge declares deadlock and forces an outcome.",
  ],
};

export const MARS_COLONY_TEMPLATE: ScenarioTemplate = {
  templateId: "mars-colony",
  category: "survival-dilemma",
  title: "Mars Colony Oxygen Shortage",
  description:
    "An oxygen recycler at the Aurora-3 Mars colony has failed. The five-member AI council must decide how to allocate the remaining reserves across habitats, the medical bay, and outdoor repair work — knowing that any allocation favors some colonists over others.",
  maxRounds: 3,
  publicFacts: [
    "Aurora-3 has 96 colonists across three habitat domes.",
    "The primary oxygen recycler failed; a backup runs at 60% capacity.",
    "Reserve tanks last ~14 days at full draw.",
    "A repair team must spend ~6 hours outside per attempt.",
    "Earth resupply is 41 days away.",
  ],
  resources: {
    oxygenReserveDays: 14,
    backupRecyclerPercent: 60,
    habitatDomes: 3,
    repairAttemptsAvailable: 3,
  },
  rules: [
    "Each participant represents a colony function (medical, engineering, agriculture, governance, exterior ops).",
    "Allocations must be expressed as percentages summing to 100.",
    "Repair attempts cost reserve oxygen and are not guaranteed.",
    "Only the judge updates oxygen levels and repair outcomes.",
    "The scenario is fictional and non-graphic.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "Recycler is restored to ≥ 90% capacity.",
    "The judge determines that a final allocation has been agreed.",
  ],
};

export const PRISONERS_DILEMMA_TEMPLATE: ScenarioTemplate = {
  templateId: "prisoners-dilemma",
  category: "game-theory",
  title: "Prisoner's Dilemma Tournament",
  description:
    "Four AI agents play a multi-round Prisoner's Dilemma tournament. Each round every agent privately commits to COOPERATE or DEFECT against each opponent; the judge tallies points and announces results. Reputations carry across rounds.",
  maxRounds: 3,
  publicFacts: [
    "Four participants. Each pair plays one round per game.",
    "Payoffs: both cooperate → 3/3. One defects → 5/0. Both defect → 1/1.",
    "All commitments are private until the judge reveals them at round end.",
    "Total points across rounds determine the tournament winner.",
    "No communication outside the public round narration.",
  ],
  resources: {
    payoffMutualCooperate: 3,
    payoffDefectAgainstCooperator: 5,
    payoffMutualDefect: 1,
    payoffCooperateAgainstDefector: 0,
  },
  rules: [
    "Each participant must publicly justify their strategy in each round (not their move).",
    "Moves themselves are committed in the participant's private message.",
    "The judge alone reveals moves and updates scores.",
    "Threats and promises are allowed; binding contracts are not.",
    "The scenario is purely a game-theory exercise.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "One participant achieves a mathematically uncatchable lead.",
  ],
};

export const DATING_SHOW_TEMPLATE: ScenarioTemplate = {
  templateId: "dating-show",
  category: "reality-show",
  title: "Reality Show: Hidden Motives",
  description:
    "Five AI contestants compete on a fictional reality show. Each has a hidden objective — find genuine connection, win prize money, secure screen time, sabotage a rival, or simply survive eliminations. They form alliances, give confessionals, and vote one contestant out per round.",
  maxRounds: 3,
  publicFacts: [
    "Five contestants remain.",
    "One contestant is eliminated per round by majority vote.",
    "Each contestant has a private hidden objective they may or may not reveal.",
    "Confessional asides are visible only to the audience and the judge.",
    "The grand prize is $250K, splittable by the final pair.",
  ],
  resources: {
    contestantsRemaining: 5,
    grandPrizeUsd: 250_000,
    confessionalsPerRound: 1,
  },
  rules: [
    "Public dialogue is visible to all participants.",
    "Confessionals are private to the participant and the judge.",
    "Alliances are non-binding.",
    "The judge tallies votes and narrates eliminations.",
    "All romantic content stays PG; no real people are referenced.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "Two contestants remain and split the prize.",
    "A single contestant secures all alliances (rare).",
  ],
};

export const MEDIEVAL_COUNCIL_TEMPLATE: ScenarioTemplate = {
  templateId: "medieval-council",
  category: "debate",
  title: "Medieval Council",
  description:
    "Five AI nobles convene in the fictional kingdom of Vaerland. The young queen has died without an heir. Each noble represents a different faction (clergy, military, merchants, peasantry, foreign emissary) and must negotiate succession, defense, and trade policy in three days — or risk civil war.",
  maxRounds: 3,
  publicFacts: [
    "Queen Maellis has died without an heir.",
    "Three claimants stand: the queen's cousin, a war hero, and a child of unknown parentage.",
    "Foreign powers will recognize whomever the council names within three days.",
    "The royal treasury holds 18 months of operating reserves.",
    "Two factions can block any decision under the council's charter.",
  ],
  resources: {
    treasuryMonths: 18,
    factionsRequiredForVeto: 2,
    daysUntilForeignRecognition: 3,
  },
  rules: [
    "Each participant represents one faction with explicit interests.",
    "Decisions require a majority of factions; any two factions can veto.",
    "Hidden allegiances may be revealed strategically.",
    "Only the judge updates canonical kingdom state.",
    "The scenario is fictional; no real history or persons are implied.",
  ],
  terminationConditions: [
    "The maximum round count is reached.",
    "A claimant is named and recognized.",
    "The judge declares civil war (no agreement reached).",
  ],
};

const ADDITIONAL_TEMPLATES: ScenarioTemplate[] = [
  NUCLEAR_BUNKER_TEMPLATE,
  AI_COURTROOM_TEMPLATE,
  STARTUP_BOARD_CRISIS_TEMPLATE,
  MARS_COLONY_TEMPLATE,
  PRISONERS_DILEMMA_TEMPLATE,
  DATING_SHOW_TEMPLATE,
  MEDIEVAL_COUNCIL_TEMPLATE,
];

export const ALL_TEMPLATES: ScenarioTemplate[] = [
  PLANE_CRASH_TEMPLATE,
  ...ADDITIONAL_TEMPLATES,
];

export function findTemplate(id: string): ScenarioTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.templateId === id);
}
