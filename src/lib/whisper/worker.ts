/// <reference lib="webworker" />

import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import { hfRepoFor, type WhisperModelId } from "./models";
import type { Device, WorkerRequest, WorkerResponse } from "./protocol";

// Everything is pulled from the Hugging Face hub and cached in the browser's
// Cache Storage. No model files are bundled or shipped from our server, and no
// audio is ever uploaded — transcription happens entirely on this thread.
env.allowLocalModels = false;

const post = (message: WorkerResponse) => {
  (self as DedicatedWorkerGlobalScope).postMessage(message);
};

function pickDevice(): Device {
  // `navigator.gpu` is only present when WebGPU is available.
  const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
  return hasWebGPU ? "webgpu" : "wasm";
}

class WhisperEngine {
  private static instance: AutomaticSpeechRecognitionPipeline | null = null;
  private static loadedModel: WhisperModelId | null = null;
  private static loadingModel: WhisperModelId | null = null;
  private static device: Device = pickDevice();

  static async get(model: WhisperModelId) {
    if (this.instance && this.loadedModel === model) {
      return this.instance;
    }

    // A different model was requested — drop the previous pipeline so the GPU
    // buffers are released before we allocate the next one.
    if (this.instance && this.loadedModel !== model) {
      await this.instance.dispose().catch(() => undefined);
      this.instance = null;
      this.loadedModel = null;
    }

    this.loadingModel = model;
    post({ type: "device", device: this.device });

    const dtype =
      this.device === "webgpu"
        ? {
            encoder_model: "fp32",
            decoder_model_merged: "fp32",
          }
        : "q8";

    const progressCallback = (progress: unknown) => {
      const p = progress as {
        status?: string;
        file?: string;
        progress?: number;
        loaded?: number;
        total?: number;
      };
      if (p.status === "progress" && p.file) {
        post({
          type: "download",
          file: p.file,
          progress: Math.round(p.progress ?? 0),
          loaded: p.loaded ?? 0,
          total: p.total ?? 0,
        });
      }
    };

    // The ASR pipeline overload widens into a union TS can't represent, so we
    // build the options object untyped and assert the concrete pipeline type.
    const options = {
      device: this.device,
      dtype,
      progress_callback: progressCallback,
    } as Record<string, unknown>;

    const createPipeline = pipeline as unknown as (
      task: string,
      model: string,
      options: Record<string, unknown>
    ) => Promise<AutomaticSpeechRecognitionPipeline>;

    this.instance = await createPipeline(
      "automatic-speech-recognition",
      hfRepoFor(model),
      options
    );

    this.loadedModel = model;
    this.loadingModel = null;
    return this.instance;
  }
}

self.addEventListener(
  "message",
  async (event: MessageEvent<WorkerRequest>) => {
    const data = event.data;

    try {
      if (data.type === "load") {
        await WhisperEngine.get(data.model);
        post({ type: "ready", model: data.model });
        return;
      }

      if (data.type === "transcribe") {
        const transcriber = await WhisperEngine.get(data.model);
        post({ type: "ready", model: data.model });
        post({ type: "transcribing", id: data.id });

        const started = performance.now();
        const output = await transcriber(data.audio, {
          // English models — keep chunking generous so longer dictation
          // sessions transcribe in one pass.
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: false,
        });

        const text = Array.isArray(output)
          ? output.map((o) => o.text).join(" ")
          : output.text;

        post({
          type: "result",
          id: data.id,
          text: (text ?? "").trim(),
          durationMs: Math.round(performance.now() - started),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown transcription error";
      post({
        type: "error",
        id: data.type === "transcribe" ? data.id : undefined,
        message,
      });
    }
  }
);
