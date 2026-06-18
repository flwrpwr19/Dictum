"use client";

import { useMemo } from "react";
import { Cloud, Cpu, HardDrive } from "lucide-react";
import type { DictationController } from "@/lib/dictation/useDictation";
import { ModelCard, ModelList } from "./ModelCard";

export function ModelsView({ ctrl }: { ctrl: DictationController }) {
  const featured = useMemo(
    () => ctrl.catalog.filter((m) => m.featured),
    [ctrl.catalog]
  );
  const localLibrary = useMemo(
    () => ctrl.catalog.filter((m) => m.kind === "local" && !m.featured),
    [ctrl.catalog]
  );
  const cloudLibrary = useMemo(
    () => ctrl.catalog.filter((m) => m.kind === "cloud"),
    [ctrl.catalog]
  );

  const renderRow = (m: (typeof ctrl.catalog)[number]) => (
    <ModelCard
      key={m.id}
      model={m}
      active={ctrl.model === m.id}
      ready={ctrl.isModelReady(m.id)}
      downloadPct={ctrl.downloadPctByModel[m.id] ?? 0}
      downloading={ctrl.downloadingModel === m.id}
      apiKey={m.provider ? ctrl.apiKeys[m.provider] : undefined}
      onSelect={() => ctrl.setModel(m.id)}
      onDownload={() => ctrl.prepareModel(m.id)}
      onApiKeyChange={
        m.provider ? (key) => ctrl.setApiKey(m.provider!, key) : undefined
      }
    />
  );

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl font-medium tracking-tight text-foreground">
          Models
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a local Whisper model for on-device dictation, or connect a cloud
          provider with an API key.
        </p>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-dictum-cyan" />
          <h2 className="text-sm font-medium text-foreground">
            Recommended local
          </h2>
        </div>
        <ModelList>{featured.map(renderRow)}</ModelList>
      </section>

      {localLibrary.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              Local library
            </h2>
          </div>
          <ModelList>{localLibrary.map(renderRow)}</ModelList>
        </section>
      )}

      {cloudLibrary.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              Cloud models
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Save your API key once per provider. Groq and OpenAI models work
            today; Deepgram, AssemblyAI, and Google are coming soon.
          </p>
          <ModelList>{cloudLibrary.map(renderRow)}</ModelList>
        </section>
      )}
    </div>
  );
}
