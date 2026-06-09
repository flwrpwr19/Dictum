"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blobToPcm, preferredMimeType } from "@/lib/audio/capture";
import { isTauri } from "@/lib/platform";
import {
  applySnippets,
  loadSnippets,
  saveSnippets,
  type Snippet,
} from "@/lib/snippets";
import { DEFAULT_MODEL, type WhisperModelId } from "@/lib/whisper/models";
import type { Device, WorkerResponse } from "@/lib/whisper/protocol";

export type { Device } from "@/lib/whisper/protocol";

export type FlowState =
  | "idle"
  | "listening"
  | "transcribing"
  | "ready"
  | "error";

export type EngineStatus =
  | "cold"
  | "downloading"
  | "warming"
  | "ready"
  | "error";

export type Dictation = {
  id: string;
  text: string;
  words: number;
  durationMs: number;
  recordedMs: number;
  createdAt: number;
};

const BAR_COUNT = 28;
const HISTORY_KEY = "dictum.history.v1";
const SETTINGS_KEY = "dictum.settings.v1";

type Settings = { model: WhisperModelId };

function loadHistory(): Dictation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Dictation[]) : [];
  } catch {
    return [];
  }
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return { model: DEFAULT_MODEL };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Settings) : { model: DEFAULT_MODEL };
  } catch {
    return { model: DEFAULT_MODEL };
  }
}

const countWords = (text: string) =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

export function useDictation() {
  // Start false so SSR and the first client paint agree; flip after mount.
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isTauri());
  }, []);

  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("cold");
  const [device, setDevice] = useState<Device | null>(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [model, setModelState] = useState<WhisperModelId>(DEFAULT_MODEL);
  const [autoPaste, setAutoPasteState] = useState(true);
  const [hotkey, setHotkey] = useState("CmdOrCtrl+Shift+D");
  const [history, setHistory] = useState<Dictation[]>([]);
  const [snippets, setSnippetsState] = useState<Snippet[]>([]);
  const snippetsRef = useRef<Snippet[]>([]);
  const nativeRef = useRef(false);

  // Web-engine refs (unused in native mode).
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const recordedMsRef = useRef<number>(0);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    snippetsRef.current = snippets;
  }, [snippets]);

  useEffect(() => {
    nativeRef.current = native;
  }, [native]);

  const persistResult = useCallback(
    (text: string, durationMs: number, recordedMs: number) => {
      const expanded = nativeRef.current
        ? text
        : applySnippets(text, snippetsRef.current);
      setLastText(expanded);
      if (!expanded) return;
      const entry: Dictation = {
        id: crypto.randomUUID(),
        text: expanded,
        words: countWords(expanded),
        durationMs,
        recordedMs,
        createdAt: Date.now(),
      };
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, 200);
        try {
          window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  // Hydrate persisted history + model on mount.
  useEffect(() => {
    setHistory(loadHistory());
    if (!native) {
      setModelState(loadSettings().model);
      setSnippetsState(loadSnippets());
    }
  }, [native]);

  // ─── Native (Tauri) engine ──────────────────────────────────────────────
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      try {
        const cfg = await invoke<{
          model: WhisperModelId;
          hotkey: string;
          auto_paste: boolean;
          snippets?: { phrase: string; expansion: string }[];
        }>("get_config");
        setModelState(cfg.model);
        setHotkey(cfg.hotkey);
        setAutoPasteState(cfg.auto_paste);
        setSnippetsState(
          (cfg.snippets ?? []).map((s) => ({
            id: crypto.randomUUID(),
            phrase: s.phrase,
            expansion: s.expansion,
          }))
        );
        const ready = await invoke<boolean>("model_ready", { id: cfg.model });
        setEngineStatus(ready ? "ready" : "downloading");
        if (ready) setDownloadPct(100);
      } catch {
        /* commands unavailable */
      }

      unlisteners.push(
        await listen<{ state: FlowState }>("flow://state", (e) => {
          const s = e.payload.state;
          setFlowState(s);
          if (s === "listening") {
            setError(null);
            startedAtRef.current = performance.now();
            setElapsedMs(0);
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
            const tick = () => {
              setElapsedMs(performance.now() - startedAtRef.current);
              timerRef.current = requestAnimationFrame(tick);
            };
            timerRef.current = requestAnimationFrame(tick);
          } else {
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
            setLevel(0);
            setBars(new Array(BAR_COUNT).fill(0));
          }
        })
      );

      unlisteners.push(
        await listen<{ level: number; bars: number[] }>("flow://level", (e) => {
          setLevel(e.payload.level);
          if (Array.isArray(e.payload.bars)) setBars(e.payload.bars);
        })
      );

      unlisteners.push(
        await listen<{ text: string; durationMs: number; recordedMs: number }>(
          "flow://result",
          (e) => {
            persistResult(
              e.payload.text,
              e.payload.durationMs,
              e.payload.recordedMs
            );
          }
        )
      );

      unlisteners.push(
        await listen<{ message: string }>("flow://error", (e) => {
          setError(e.payload.message);
          setFlowState("error");
        })
      );

      unlisteners.push(
        await listen<{ id: string; pct: number }>("model://progress", (e) => {
          setDownloadPct(e.payload.pct);
          setEngineStatus(e.payload.pct >= 100 ? "ready" : "downloading");
        })
      );
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [native, persistResult]);

  // ─── Web engine (transformers.js worker) ─────────────────────────────────
  useEffect(() => {
    if (native) return;
    const worker = new Worker(new URL("../whisper/worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case "device":
          setDevice(msg.device);
          setEngineStatus((s) => (s === "ready" ? s : "downloading"));
          break;
        case "download":
          setEngineStatus("downloading");
          setDownloadPct(msg.progress);
          break;
        case "ready":
          setEngineStatus("ready");
          setDownloadPct(100);
          break;
        case "transcribing":
          setFlowState("transcribing");
          break;
        case "result":
          setFlowState(msg.text ? "ready" : "idle");
          persistResult(msg.text, msg.durationMs, recordedMsRef.current);
          break;
        case "error":
          setError(msg.message);
          setFlowState("error");
          setEngineStatus((s) => (s === "ready" ? s : "error"));
          break;
      }
    };

    worker.addEventListener("message", onMessage);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, [native, persistResult]);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setLevel(0);
    setBars(new Array(BAR_COUNT).fill(0));
  }, []);

  const teardownStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const preload = useCallback(() => {
    if (native) return;
    if (engineStatus === "cold") {
      setEngineStatus("warming");
      workerRef.current?.postMessage({ type: "load", model });
    }
  }, [native, engineStatus, model]);

  const setModel = useCallback(
    (next: WhisperModelId) => {
      setModelState(next);
      setEngineStatus("warming");
      setDownloadPct(0);
      if (native) {
        void (async () => {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("set_config", {
            config: {
              model: next,
              hotkey,
              auto_paste: autoPaste,
              snippets: snippetsRef.current.map(({ phrase, expansion }) => ({
                phrase,
                expansion,
              })),
            },
          });
          await invoke("prepare_model", { id: next });
        })();
        return;
      }
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ model: next }));
      } catch {
        /* ignore */
      }
      workerRef.current?.postMessage({ type: "load", model: next });
    },
    [native, hotkey, autoPaste]
  );

  const setSnippets = useCallback(
    (next: Snippet[]) => {
      setSnippetsState(next);
      saveSnippets(next);
      if (!native) return;
      void (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        const cfg = await invoke<{
          model: WhisperModelId;
          hotkey: string;
          auto_paste: boolean;
          snippets?: { phrase: string; expansion: string }[];
        }>("get_config");
        await invoke("set_config", {
          config: {
            ...cfg,
            snippets: next.map(({ phrase, expansion }) => ({
              phrase,
              expansion,
            })),
          },
        });
      })();
    },
    [native]
  );

  const setAutoPaste = useCallback(
    (next: boolean) => {
      setAutoPasteState(next);
      if (!native) return;
      void (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_config", {
          config: {
            model,
            hotkey,
            auto_paste: next,
            snippets: snippetsRef.current.map(({ phrase, expansion }) => ({
              phrase,
              expansion,
            })),
          },
        });
      })();
    },
    [native, model, hotkey]
  );

  // ─── Web capture ──────────────────────────────────────────────────────────
  const startWeb = useCallback(async () => {
    setError(null);
    setLastText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      analyserRef.current = analyser;

      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(time);
        analyserRef.current.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / time.length) * 2.6));
        const usable = Math.floor(freq.length * 0.6);
        const next = new Array(BAR_COUNT).fill(0).map((_, i) => {
          const startBin = Math.floor((i / BAR_COUNT) * usable);
          const endBin = Math.floor(((i + 1) / BAR_COUNT) * usable);
          let max = 0;
          for (let b = startBin; b <= endBin; b++) max = Math.max(max, freq[b]);
          return Math.min(1, (max / 255) * 1.15);
        });
        setBars(next);
        setElapsedMs(performance.now() - startedAtRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };

      chunksRef.current = [];
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;

      startedAtRef.current = performance.now();
      setElapsedMs(0);
      setFlowState("listening");
      preload();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone access was blocked. Check your browser permissions."
      );
      setFlowState("error");
      teardownStream();
      stopMeter();
    }
  }, [preload, stopMeter, teardownStream]);

  const stopWeb = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setFlowState("idle");
      return;
    }
    recordedMsRef.current = performance.now() - startedAtRef.current;
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () =>
        resolve(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          })
        );
      recorder.stop();
    });
    teardownStream();
    stopMeter();
    recorderRef.current = null;

    if (recordedMsRef.current < 350 || blob.size < 1200) {
      setFlowState("idle");
      return;
    }
    setFlowState("transcribing");
    try {
      const audio = await blobToPcm(blob);
      workerRef.current?.postMessage({
        type: "transcribe",
        id: crypto.randomUUID(),
        audio,
        model,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decode the recording.");
      setFlowState("error");
    }
  }, [model, stopMeter, teardownStream]);

  // ─── Public actions (dispatch to the right engine) ────────────────────────
  const start = useCallback(async () => {
    if (flowState === "listening") return;
    if (native) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_dictation");
      return;
    }
    await startWeb();
  }, [native, flowState, startWeb]);

  const stop = useCallback(async () => {
    if (native) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_dictation");
      return;
    }
    await stopWeb();
  }, [native, stopWeb]);

  const cancel = useCallback(() => {
    if (native) {
      void stop();
      return;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    teardownStream();
    stopMeter();
    setFlowState("idle");
  }, [native, stop, stopMeter, teardownStream]);

  const toggle = useCallback(() => {
    if (flowState === "listening") void stop();
    else if (flowState !== "transcribing") void start();
  }, [flowState, start, stop]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((d) => d.id !== id);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      teardownStream();
      stopMeter();
    };
  }, [stopMeter, teardownStream]);

  return {
    native,
    flowState,
    engineStatus,
    device,
    downloadPct,
    level,
    bars,
    elapsedMs,
    lastText,
    error,
    model,
    autoPaste,
    hotkey,
    history,
    snippets,
    setSnippets,
    setModel,
    setAutoPaste,
    preload,
    start,
    stop,
    cancel,
    toggle,
    clearHistory,
    removeEntry,
  };
}

export type DictationController = ReturnType<typeof useDictation>;
