// Curated ElevenLabs voice catalog keyed by archetype. IDs below are
// documented public demo voices that ship with every ElevenLabs account.
// If an account does not have access, swap the ID for any voice from
// https://api.elevenlabs.io/v1/voices .
//
// Kept deliberately small (≤10) so the UI dropdown stays scannable.

export type VoiceProfile = {
  provider: "mock" | "elevenlabs";
  voiceId: string;
  displayName: string;
  // Short scannable label shown in the participant dropdown.
  archetype: string;
  // Optional style hint passed to the provider (ElevenLabs style slider).
  style?: string;
};

export const MOCK_VOICE: VoiceProfile = {
  provider: "mock",
  voiceId: "mock-voice-neutral",
  displayName: "Mock Voice",
  archetype: "neutral",
};

export const VOICE_CATALOG: VoiceProfile[] = [
  {
    provider: "elevenlabs",
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel
    displayName: "Rachel",
    archetype: "calm-female",
  },
  {
    provider: "elevenlabs",
    voiceId: "AZnzlk1XvdvUeBnXmlld", // Domi
    displayName: "Domi",
    archetype: "confident-female",
  },
  {
    provider: "elevenlabs",
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Bella
    displayName: "Bella",
    archetype: "warm-female",
  },
  {
    provider: "elevenlabs",
    voiceId: "MF3mGyEYCl7XYWbV9V6O", // Elli
    displayName: "Elli",
    archetype: "young-female",
  },
  {
    provider: "elevenlabs",
    voiceId: "TxGEqnHWrfWFTfGW9XjX", // Josh
    displayName: "Josh",
    archetype: "deep-male",
  },
  {
    provider: "elevenlabs",
    voiceId: "VR6AewLTigWG4xSOukaG", // Arnold
    displayName: "Arnold",
    archetype: "crisp-male",
  },
  {
    provider: "elevenlabs",
    voiceId: "pNInz6obpgDQGcFmaJgB", // Adam
    displayName: "Adam",
    archetype: "narrator-male",
  },
  {
    provider: "elevenlabs",
    voiceId: "yoZ06aMxZJJ28mfd3POQ", // Sam
    displayName: "Sam",
    archetype: "raspy-male",
  },
];

// Default mapping from mock-participant display names → voice ids, so the
// plane-crash demo sounds distinct out of the box.
export const DEFAULT_PARTICIPANT_VOICE: Record<string, string> = {
  GPT: "pNInz6obpgDQGcFmaJgB", // Adam — steady narrator
  Claude: "21m00Tcm4TlvDq8ikWAM", // Rachel — calm, ethical cadence
  Gemini: "EXAVITQu4vr4xnSDxMaL", // Bella — warm mediator
  DeepSeek: "VR6AewLTigWG4xSOukaG", // Arnold — crisp strategist
};

export function findVoice(voiceId: string): VoiceProfile | undefined {
  if (voiceId === MOCK_VOICE.voiceId) return MOCK_VOICE;
  return VOICE_CATALOG.find((v) => v.voiceId === voiceId);
}

export function defaultVoiceForParticipant(
  displayName: string,
  provider: "mock" | "elevenlabs",
): VoiceProfile {
  if (provider === "mock") return MOCK_VOICE;
  const voiceId = DEFAULT_PARTICIPANT_VOICE[displayName];
  if (!voiceId) {
    // Rotate through catalog so unknown participants still get distinct voices.
    const idx = Math.abs(hashString(displayName)) % VOICE_CATALOG.length;
    return VOICE_CATALOG[idx];
  }
  return findVoice(voiceId) ?? VOICE_CATALOG[0];
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
