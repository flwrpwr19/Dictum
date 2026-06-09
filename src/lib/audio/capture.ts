const TARGET_SAMPLE_RATE = 16_000;

/**
 * Decode a recorded audio blob into a mono Float32Array at 16 kHz, the format
 * Whisper expects. Decoding through an AudioContext pinned to 16 kHz means the
 * browser handles resampling natively.
 */
export async function blobToPcm(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  // Some browsers ignore the requested sample rate on a live AudioContext, so
  // decode first, then resample deterministically with an OfflineAudioContext.
  const decodeCtx = new AudioCtx();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
    return decoded.numberOfChannels > 1
      ? downmix(decoded)
      : decoded.getChannelData(0).slice();
  }

  const frames = Math.ceil(
    (decoded.duration || decoded.length / decoded.sampleRate) *
      TARGET_SAMPLE_RATE
  );
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

function downmix(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      out[i] += data[i] / channels;
    }
  }
  return out;
}

/** Pick a widely supported recording mime type for MediaRecorder. */
export function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}
