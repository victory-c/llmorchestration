export type TTSProviderName =
  | "mock"
  | "elevenlabs"
  | "google-tts"
  | "openai-tts";

export type TTSRequest = {
  text: string;
  voiceId: string;
  // Free-text style hint (ElevenLabs style slider, OpenAI instructions, etc.)
  style?: string;
  // Optional caller-supplied metadata so logs can correlate back to the run.
  metadata?: {
    runId?: string;
    messageId?: string;
    participantId?: string;
    chunkIndex?: number;
  };
};

export type TTSResponse = {
  provider: TTSProviderName;
  bytes: Uint8Array;
  contentType: string; // "audio/mpeg" for mp3
  durationMs: number;
  estimatedCostUsd: number;
  // Provider-reported voice id (may differ from request if remapped).
  voiceId: string;
};

export interface TTSProvider {
  synthesize(request: TTSRequest): Promise<TTSResponse>;
}
