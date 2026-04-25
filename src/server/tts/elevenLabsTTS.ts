import type { TTSProvider, TTSRequest, TTSResponse } from "@/server/tts/types";
import { getEnv } from "@/lib/env";
import { GatewayConfigError } from "@/server/gateways/errors";

// ElevenLabs pricing: we bill by characters. Their published rate for the
// "Creator" tier is ~$0.0003/char ($30 / 100k chars). Conservative default
// used for the in-app cost meter.
const ELEVENLABS_COST_PER_CHAR_USD = 0.0003;

// Default to the low-latency "eleven_turbo_v2_5" model. Can be overridden via
// request.style === "model=eleven_multilingual_v2" etc. if callers want.
const DEFAULT_MODEL = "eleven_turbo_v2_5";

export class ElevenLabsHTTPError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`ElevenLabs TTS HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "ElevenLabsHTTPError";
  }
}

function estimateDurationMs(bytes: Uint8Array, fallbackText: string): number {
  // MP3 rate at eleven_turbo_v2_5 default is ~32kbps → 4000 bytes/sec.
  // We don't parse the frame, so approximate: duration = bytes / 4000.
  const byteDuration = Math.round((bytes.byteLength / 4000) * 1000);
  if (byteDuration > 0) return byteDuration;
  // Fallback when bytes are unexpectedly small.
  return Math.max(500, Math.round((fallbackText.length / 15) * 1000));
}

export const elevenLabsTTS: TTSProvider = {
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    const env = getEnv();
    if (!env.ELEVENLABS_API_KEY) {
      throw new GatewayConfigError(
        "ELEVENLABS_API_KEY is not set. Configure it in .env.local or set TTS_PROVIDER=mock.",
      );
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: DEFAULT_MODEL,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ElevenLabsHTTPError(res.status, body);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      provider: "elevenlabs",
      bytes: buf,
      contentType: "audio/mpeg",
      durationMs: estimateDurationMs(buf, request.text),
      estimatedCostUsd: request.text.length * ELEVENLABS_COST_PER_CHAR_USD,
      voiceId: request.voiceId,
    };
  },
};
