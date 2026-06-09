import type { WhisperModelId } from "./models";

export type Device = "webgpu" | "wasm";

/** Messages sent from the UI thread to the Whisper worker. */
export type WorkerRequest =
  | { type: "load"; model: WhisperModelId }
  | {
      type: "transcribe";
      id: string;
      audio: Float32Array;
      model: WhisperModelId;
    };

/** Messages emitted by the Whisper worker back to the UI thread. */
export type WorkerResponse =
  | { type: "device"; device: Device }
  | {
      type: "download";
      file: string;
      progress: number;
      loaded: number;
      total: number;
    }
  | { type: "ready"; model: WhisperModelId }
  | { type: "transcribing"; id: string }
  | { type: "result"; id: string; text: string; durationMs: number }
  | { type: "error"; id?: string; message: string };
