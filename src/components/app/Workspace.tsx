"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Clipboard,
  Cpu,
  Eraser,
  Gauge,
  Plus,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/dictation/useDictation";
import { newSnippet } from "@/lib/snippets";
import { WHISPER_MODELS } from "@/lib/whisper/models";
import { AppSidebar, type WorkspaceView } from "./AppSidebar";
import { FlowPill } from "./FlowPill";
import { Waveform } from "./Waveform";

const ease = [0.16, 1, 0.3, 1] as const;
const DICT_KEY = "dictum.dictionary.v1";
const NOTE_KEY = "dictum.note.v1";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Workspace() {
  const ctrl = useDictation();
  const [view, setView] = useState<WorkspaceView>("capture");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [newSnippetPhrase, setNewSnippetPhrase] = useState("");
  const [newSnippetExpansion, setNewSnippetExpansion] = useState("");
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const lastHandled = useRef<string>("");

  // Hydrate note + dictionary from local storage.
  useEffect(() => {
    try {
      setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
      const raw = window.localStorage.getItem(DICT_KEY);
      if (raw) setTerms(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist note (debounced via effect).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(NOTE_KEY, note);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [note]);

  // When a fresh transcription lands, append it to the capture note.
  useEffect(() => {
    if (!ctrl.lastText) return;
    if (lastHandled.current === ctrl.lastText) return;
    lastHandled.current = ctrl.lastText;
    setNote((prev) =>
      prev ? `${prev.replace(/\s*$/, "")} ${ctrl.lastText}` : ctrl.lastText
    );
  }, [ctrl.lastText]);

  // In-window hotkey: ⌥/Alt + Space toggles dictation. In the desktop app the
  // OS-level global shortcut handles this everywhere, so we skip it there to
  // avoid a double toggle.
  useEffect(() => {
    if (ctrl.native) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "Space") {
        e.preventDefault();
        ctrl.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctrl]);

  const addTerm = useCallback(() => {
    const value = newTerm.trim();
    if (!value) return;
    setTerms((prev) => {
      if (prev.includes(value)) return prev;
      const next = [value, ...prev];
      try {
        window.localStorage.setItem(DICT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setNewTerm("");
  }, [newTerm]);

  const addSnippet = useCallback(() => {
    const phrase = newSnippetPhrase.trim();
    const expansion = newSnippetExpansion.trim();
    if (!phrase || !expansion) return;
    ctrl.setSnippets([newSnippet(phrase, expansion), ...ctrl.snippets]);
    setNewSnippetPhrase("");
    setNewSnippetExpansion("");
  }, [ctrl, newSnippetPhrase, newSnippetExpansion]);

  const removeSnippet = useCallback(
    (id: string) => {
      ctrl.setSnippets(ctrl.snippets.filter((s) => s.id !== id));
    },
    [ctrl]
  );

  const removeTerm = useCallback((term: string) => {
    setTerms((prev) => {
      const next = prev.filter((t) => t !== term);
      try {
        window.localStorage.setItem(DICT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const copyNote = useCallback(async () => {
    if (!note) return;
    await navigator.clipboard.writeText(note);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [note]);

  const stats = useMemo(() => {
    const totalWords = ctrl.history.reduce((sum, d) => sum + d.words, 0);
    const sessions = ctrl.history.length;
    const recordedMs = ctrl.history.reduce((s, d) => s + d.recordedMs, 0);
    // Typing baseline ~40 wpm vs speaking; time saved estimate.
    const spokenMins = recordedMs / 60000;
    const typedMins = totalWords / 40;
    const savedMins = Math.max(0, typedMins - spokenMins);
    const avgWpm = recordedMs > 0 ? totalWords / (recordedMs / 60000) : 0;
    return {
      totalWords,
      sessions,
      savedMins,
      avgWpm: Math.round(avgWpm),
    };
  }, [ctrl.history]);

  const noteWords = note.trim() ? note.trim().split(/\s+/).length : 0;

  const desktop = mounted && ctrl.native;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background">
      {desktop && (
        <div
          data-tauri-drag-region
          className="h-[52px] shrink-0 border-b border-dictum-border/60 bg-[#0f1014]"
          aria-hidden
        />
      )}

      <div className="relative flex min-h-0 flex-1 w-full">
        <AppSidebar
          view={view}
          onSelect={setView}
          engineStatus={ctrl.engineStatus}
          device={ctrl.device}
          desktop={desktop}
        />

        <main className="relative flex h-full flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl px-6 pb-40 pt-10 sm:px-10">
            <AnimatePresence mode="wait">
              {view === "capture" && (
                <motion.div
                  key="capture"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <header className="mb-8">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.4em] text-dictum-iris/80">
                      {mounted ? greeting() : "Welcome"}
                    </div>
                    <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                      Talk at full speed.
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      Press the pill below or hit{" "}
                      <kbd
                        suppressHydrationWarning
                        className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                      >
                        {mounted && ctrl.native
                          ? prettyHotkey(ctrl.hotkey)
                          : "⌥ Space"}
                      </kbd>{" "}
                      and start talking. Everything is transcribed locally and
                      dropped straight into your note
                      {mounted && ctrl.native
                        ? " — and pasted wherever your cursor is"
                        : ""}
                      .
                    </p>
                  </header>

                  <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                      icon={Type}
                      label="Words captured"
                      value={stats.totalWords.toLocaleString()}
                    />
                    <StatCard
                      icon={Sparkles}
                      label="Sessions"
                      value={stats.sessions.toLocaleString()}
                    />
                    <StatCard
                      icon={Gauge}
                      label="Avg pace"
                      value={`${stats.avgWpm} wpm`}
                    />
                    <StatCard
                      icon={Cpu}
                      label="Time saved"
                      value={`${Math.round(stats.savedMins)}m`}
                    />
                  </div>

                  <div className="overflow-hidden rounded-3xl border border-dictum-border bg-dictum-panel ">
                    <div className="flex items-center justify-between border-b border-dictum-border px-5 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full transition-colors",
                            ctrl.flowState === "listening"
                              ? "bg-dictum-cyan"
                              : ctrl.flowState === "transcribing"
                                ? "bg-dictum-amber"
                                : "bg-white/30"
                          )}
                        />
                        Live note
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {noteWords} words
                        </span>
                        <button
                          type="button"
                          onClick={copyNote}
                          disabled={!note}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-dictum-cyan" />
                          ) : (
                            <Clipboard className="h-3.5 w-3.5" />
                          )}
                          {copied ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setNote("")}
                          disabled={!note}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                        >
                          <Eraser className="h-3.5 w-3.5" />
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <textarea
                        ref={noteRef}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Your dictation appears here. You can also type — Dictum stays out of your way."
                        className="min-h-[320px] w-full resize-none bg-transparent px-5 py-5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                      />
                      <AnimatePresence>
                        {ctrl.flowState === "listening" && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-center gap-3 rounded-2xl border border-dictum-border bg-[#16171f] px-4 py-2.5"
                          >
                            <span className="text-xs text-dictum-cyan">
                              Listening
                            </span>
                            <div className="h-6 flex-1">
                              <Waveform bars={ctrl.bars} active />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

              {view === "history" && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <header className="mb-6 flex items-end justify-between">
                    <div>
                      <h1 className="text-3xl font-medium tracking-tight text-foreground">
                        History
                      </h1>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Every transcript, stored locally in this browser.
                      </p>
                    </div>
                    {ctrl.history.length > 0 && (
                      <button
                        type="button"
                        onClick={ctrl.clearHistory}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear all
                      </button>
                    )}
                  </header>

                  {ctrl.history.length === 0 ? (
                    <EmptyState
                      title="No dictations yet"
                      body="Head back to Capture and speak your first note."
                    />
                  ) : (
                    <div className="space-y-3">
                      {ctrl.history.map((d) => (
                        <div
                          key={d.id}
                          className="group rounded-2xl border border-dictum-border bg-dictum-panel p-4  transition-colors hover:border-white/15"
                        >
                          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{relativeTime(d.createdAt)}</span>
                            <div className="flex items-center gap-3">
                              <span>{d.words} words</span>
                              <span className="text-dictum-cyan">
                                {(d.durationMs / 1000).toFixed(1)}s
                              </span>
                              <button
                                type="button"
                                onClick={() => ctrl.removeEntry(d.id)}
                                className="text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                aria-label="Delete transcript"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm leading-relaxed text-foreground/90">
                            {d.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {view === "dictionary" && (
                <motion.div
                  key="dictionary"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <header className="mb-6">
                    <h1 className="text-3xl font-medium tracking-tight text-foreground">
                      Snippets
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      Say a short phrase and Dictum expands it — e.g. &ldquo;my main
                      proton mail&rdquo; becomes your email address. Everything
                      stays on-device.
                    </p>
                  </header>

                  <section className="mb-10 rounded-2xl border border-dictum-border bg-dictum-panel p-5">
                    <h2 className="mb-1 text-sm font-medium text-foreground">
                      Voice shortcuts
                    </h2>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Phrase matching is case-insensitive. Longer phrases take
                      priority.
                    </p>
                    <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={newSnippetPhrase}
                        onChange={(e) => setNewSnippetPhrase(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSnippet()}
                        placeholder='Phrase — e.g. "my main proton mail"'
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-dictum-iris/40 focus:outline-none"
                      />
                      <input
                        value={newSnippetExpansion}
                        onChange={(e) => setNewSnippetExpansion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addSnippet()}
                        placeholder="Expands to — e.g. you@proton.me"
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-dictum-iris/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addSnippet}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </button>
                    </div>

                    {ctrl.snippets.length === 0 ? (
                      <EmptyState
                        title="No snippets yet"
                        body='Add a phrase like "my main proton mail" and the text you want pasted instead.'
                      />
                    ) : (
                      <ul className="space-y-2">
                        {ctrl.snippets.map((snippet) => (
                          <li
                            key={snippet.id}
                            className="flex items-center gap-3 rounded-xl border border-dictum-border bg-white/[0.03] px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">
                                &ldquo;{snippet.phrase}&rdquo;
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                → {snippet.expansion}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSnippet(snippet.id)}
                              aria-label={`Remove snippet ${snippet.phrase}`}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-white/10 hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <header className="mb-4">
                    <h2 className="text-lg font-medium tracking-tight text-foreground">
                      Dictionary
                    </h2>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                      Names, jargon, and product terms you want spelled your way.
                    </p>
                  </header>

                  <div className="mb-6 flex gap-2">
                    <input
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTerm()}
                      placeholder="Add a term — e.g. Lattice Labs, Sinerga Optima"
                      className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-dictum-iris/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addTerm}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>

                  {terms.length === 0 ? (
                    <EmptyState
                      title="Your dictionary is empty"
                      body="Add the words you say often so you recognise them at a glance."
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {terms.map((term) => (
                        <span
                          key={term}
                          className="group inline-flex items-center gap-2 rounded-full border border-dictum-border bg-white/[0.04] py-1.5 pl-4 pr-2 text-sm text-foreground"
                        >
                          {term}
                          <button
                            type="button"
                            onClick={() => removeTerm(term)}
                            aria-label={`Remove ${term}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-white/10 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {view === "settings" && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <header className="mb-6">
                    <h1 className="text-3xl font-medium tracking-tight text-foreground">
                      Settings
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Choose the local model and review your privacy posture.
                    </p>
                  </header>

                  <section className="mb-6 rounded-2xl border border-dictum-border bg-dictum-panel p-6 ">
                    <h2 className="mb-1 text-sm font-medium text-foreground">
                      Whisper model
                    </h2>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Larger models are more accurate but take longer to load and
                      run. Switching re-downloads once, then caches.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {WHISPER_MODELS.map((m) => {
                        const active = ctrl.model === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => ctrl.setModel(m.id)}
                            className={cn(
                              "rounded-xl border p-4 text-left transition-all",
                              active
                                ? "border-dictum-iris/40 bg-dictum-iris/[0.08]"
                                : "border-white/8 bg-black/25 hover:border-white/15"
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {m.label}
                              </span>
                              {active && (
                                <Check className="h-4 w-4 text-dictum-cyan" />
                              )}
                            </div>
                            <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                              {m.size}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {m.blurb}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <Cpu className="h-3.5 w-3.5 text-dictum-cyan" />
                      Running on{" "}
                      <span className="text-foreground">
                        {!mounted
                          ? "detecting…"
                          : ctrl.native
                            ? "native whisper.cpp (Metal)"
                            : ctrl.device === "webgpu"
                              ? "WebGPU"
                              : ctrl.device === "wasm"
                                ? "WASM (CPU)"
                                : "detecting…"}
                      </span>
                      {ctrl.engineStatus === "downloading" && (
                        <span>· loading {ctrl.downloadPct}%</span>
                      )}
                    </div>
                  </section>

                  {mounted && ctrl.native && (
                    <section className="mb-6 rounded-2xl border border-dictum-border bg-dictum-panel p-6 ">
                      <h2 className="mb-1 text-sm font-medium text-foreground">
                        Dictation
                      </h2>
                      <p className="mb-4 text-xs text-muted-foreground">
                        Trigger dictation from anywhere and drop text into the app
                        you&apos;re using.
                      </p>
                      <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/25 px-4 py-3">
                        <div>
                          <div className="text-sm text-foreground">Global hotkey</div>
                          <div className="text-xs text-muted-foreground">
                            Toggle listening from any app
                          </div>
                        </div>
                        <kbd className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-xs text-foreground">
                          {prettyHotkey(ctrl.hotkey)}
                        </kbd>
                      </div>
                      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-black/25 px-4 py-3">
                        <div>
                          <div className="text-sm text-foreground">Auto-paste</div>
                          <div className="text-xs text-muted-foreground">
                            Paste the transcript into the focused app
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ctrl.autoPaste}
                          onClick={() => ctrl.setAutoPaste(!ctrl.autoPaste)}
                          className={cn(
                            "relative h-6 w-11 rounded-full transition-colors",
                            ctrl.autoPaste ? "bg-primary" : "bg-white/15"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                              ctrl.autoPaste ? "left-[22px]" : "left-0.5"
                            )}
                          />
                        </button>
                      </label>
                      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
                        Auto-paste needs macOS Accessibility permission for Dictum
                        (System Settings → Privacy &amp; Security → Accessibility).
                      </p>
                    </section>
                  )}

                  <section className="rounded-2xl border border-dictum-border bg-dictum-panel p-6 ">
                    <h2 className="mb-1 text-sm font-medium text-foreground">
                      Privacy & data
                    </h2>
                    <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                      Audio never leaves this device. Transcripts, notes, and your
                      dictionary live in this browser&apos;s local storage only.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        ctrl.clearHistory();
                        setNote("");
                        setTerms([]);
                        try {
                          window.localStorage.removeItem(DICT_KEY);
                          window.localStorage.removeItem(NOTE_KEY);
                        } catch {
                          /* ignore */
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Erase everything on this device
                    </button>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {(!mounted || !ctrl.native) && <FlowPill ctrl={ctrl} />}

      <AnimatePresence>
        {ctrl.error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-destructive/30 bg-[#160d12]/90 px-4 py-2.5 text-sm text-destructive "
          >
            {ctrl.error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function prettyHotkey(spec: string) {
  return spec
    .replace(/CmdOrCtrl|CommandOrControl/gi, "⌘")
    .replace(/Cmd|Command|Meta|Super/gi, "⌘")
    .replace(/Ctrl|Control/gi, "⌃")
    .replace(/Alt|Option/gi, "⌥")
    .replace(/Shift/gi, "⇧")
    .replace(/\+/g, " ")
    .replace(/\bSpace\b/gi, "Space");
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Type;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-dictum-border bg-dictum-panel p-4 ">
      <Icon className="mb-3 h-4 w-4 text-dictum-iris" />
      <div className="text-xl font-medium tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-dictum-border bg-dictum-panel/50 px-6 py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
        <Sparkles className="h-5 w-5 text-dictum-iris" />
      </div>
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
