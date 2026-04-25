import type { TTSProvider, TTSProviderName } from "@/server/tts/types";
import { mockTTS } from "@/server/tts/mockTTS";
import { elevenLabsTTS } from "@/server/tts/elevenLabsTTS";
import { GatewayConfigError } from "@/server/gateways/errors";

export function getTTSProvider(name: TTSProviderName): TTSProvider {
  switch (name) {
    case "mock":
      return mockTTS;
    case "elevenlabs":
      return elevenLabsTTS;
    case "google-tts":
    case "openai-tts":
      throw new GatewayConfigError(
        `TTS provider "${name}" is not yet implemented. Set TTS_PROVIDER=mock or elevenlabs.`,
      );
    default: {
      const _exhaustive: never = name;
      throw new GatewayConfigError(`Unknown TTS provider: ${_exhaustive}`);
    }
  }
}
