/** Generic model ids shared by the native (ggml) and web (transformers.js) engines. */
export type WhisperModelId = "tiny" | "base" | "small";

export type WhisperModel = {
  id: WhisperModelId;
  label: string;
  size: string;
  blurb: string;
};

export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: "tiny",
    label: "Tiny",
    size: "~75 MB",
    blurb: "Fastest. Great for quick notes on any machine.",
  },
  {
    id: "base",
    label: "Base",
    size: "~142 MB",
    blurb: "Balanced speed and accuracy. The default.",
  },
  {
    id: "small",
    label: "Small",
    size: "~466 MB",
    blurb: "Most accurate. Metal / WebGPU accelerated.",
  },
];

export const DEFAULT_MODEL: WhisperModelId = "base";

/** Map a generic id to the Hugging Face transformers.js repo (web fallback). */
export function hfRepoFor(id: WhisperModelId): string {
  switch (id) {
    case "tiny":
      return "onnx-community/whisper-tiny.en";
    case "small":
      return "onnx-community/whisper-small.en";
    case "base":
    default:
      return "onnx-community/whisper-base.en";
  }
}
