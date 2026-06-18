export type ModelKind = "local" | "cloud";

export type Rating = 1 | 2 | 3 | 4 | 5;

/** Catalog entry returned by `get_models` and used across the Models library. */
export type DictumModel = {
  id: string;
  label: string;
  kind: ModelKind;
  blurb: string;
  speed: Rating;
  accuracy: Rating;
  featured: boolean;
  /** ggml filename — local models only */
  file?: string | null;
  size?: string | null;
  /** API key bucket — cloud models only (e.g. "openai", "deepgram") */
  provider?: string | null;
};

export const DEFAULT_MODEL_ID = "base";

/** Legacy alias — the three primary on-device Whisper picks. */
export const PRIMARY_LOCAL_IDS = ["tiny", "base", "small"] as const;

export type PrimaryLocalId = (typeof PRIMARY_LOCAL_IDS)[number];
