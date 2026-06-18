//! Full model catalog — local ggml downloads + cloud providers.

use std::collections::HashMap;

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub blurb: String,
    pub speed: u8,
    pub accuracy: u8,
    pub featured: bool,
    pub file: Option<String>,
    pub size: Option<String>,
    pub provider: Option<String>,
}

fn local(
    id: &str,
    label: &str,
    file: &str,
    size: &str,
    blurb: &str,
    speed: u8,
    accuracy: u8,
    featured: bool,
) -> ModelInfo {
    ModelInfo {
        id: id.into(),
        label: label.into(),
        kind: "local".into(),
        blurb: blurb.into(),
        speed,
        accuracy,
        featured,
        file: Some(file.into()),
        size: Some(size.into()),
        provider: None,
    }
}

fn cloud(
    id: &str,
    label: &str,
    provider: &str,
    blurb: &str,
    speed: u8,
    accuracy: u8,
) -> ModelInfo {
    ModelInfo {
        id: id.into(),
        label: label.into(),
        kind: "cloud".into(),
        blurb: blurb.into(),
        speed,
        accuracy,
        featured: false,
        file: None,
        size: None,
        provider: Some(provider.into()),
    }
}

pub fn registry() -> Vec<ModelInfo> {
    vec![
        // ── Featured local (main three) ──
        local(
            "tiny",
            "Whisper Tiny",
            "ggml-tiny.en.bin",
            "~75 MB",
            "Fastest on-device option. Quick notes and light machines.",
            5,
            2,
            true,
        ),
        local(
            "base",
            "Whisper Base",
            "ggml-base.en.bin",
            "~142 MB",
            "Balanced speed and accuracy. The default for most users.",
            4,
            3,
            true,
        ),
        local(
            "small",
            "Whisper Small",
            "ggml-small.en.bin",
            "~466 MB",
            "Strong accuracy with Metal acceleration. Great daily driver.",
            3,
            4,
            true,
        ),
        // ── Extended local library ──
        local(
            "medium",
            "Whisper Medium",
            "ggml-medium.en.bin",
            "~1.5 GB",
            "Professional-grade local accuracy. Heavier download.",
            2,
            4,
            false,
        ),
        local(
            "large-v3-turbo",
            "Whisper Large v3 Turbo",
            "ggml-large-v3-turbo.bin",
            "~1.6 GB",
            "Near-large accuracy at ~4× speed. Best local sweet spot.",
            3,
            5,
            false,
        ),
        local(
            "large-v3",
            "Whisper Large v3",
            "ggml-large-v3.bin",
            "~2.9 GB",
            "Maximum local accuracy. Multilingual and demanding.",
            1,
            5,
            false,
        ),
        local(
            "tiny-multilingual",
            "Whisper Tiny (Multilingual)",
            "ggml-tiny.bin",
            "~75 MB",
            "Compact model with broad language support.",
            5,
            2,
            false,
        ),
        local(
            "base-multilingual",
            "Whisper Base (Multilingual)",
            "ggml-base.bin",
            "~142 MB",
            "Lightweight multilingual transcription.",
            4,
            3,
            false,
        ),
        // ── Cloud providers ──
        cloud(
            "openai-whisper-1",
            "OpenAI Whisper",
            "openai",
            "Industry-standard cloud transcription via OpenAI.",
            4,
            4,
        ),
        cloud(
            "openai-gpt-4o-transcribe",
            "GPT-4o Transcribe",
            "openai",
            "OpenAI's latest speech model with strong formatting.",
            3,
            5,
        ),
        cloud(
            "openai-gpt-4o-mini-transcribe",
            "GPT-4o Mini Transcribe",
            "openai",
            "Lower-cost OpenAI transcription with solid accuracy.",
            5,
            4,
        ),
        cloud(
            "deepgram-nova-3",
            "Deepgram Nova-3",
            "deepgram",
            "Fast streaming cloud STT tuned for real-time use.",
            5,
            4,
        ),
        cloud(
            "assemblyai-universal",
            "AssemblyAI Universal",
            "assemblyai",
            "Robust cloud model with strong punctuation.",
            4,
            4,
        ),
        cloud(
            "groq-whisper-large-v3",
            "Groq Whisper Large v3",
            "groq",
            "Whisper Large v3 on Groq's ultra-low-latency hardware.",
            5,
            5,
        ),
        cloud(
            "google-chirp-2",
            "Google Chirp 2",
            "google",
            "Google Cloud speech model with wide language coverage.",
            3,
            5,
        ),
    ]
}

pub fn find(id: &str) -> Option<ModelInfo> {
    registry().into_iter().find(|m| m.id == id)
}

pub fn file_for(id: &str) -> Option<String> {
    find(id).and_then(|m| m.file)
}

pub fn is_cloud(id: &str) -> bool {
    find(id).map(|m| m.kind == "cloud").unwrap_or(false)
}

pub fn provider_for(id: &str) -> Option<String> {
    find(id).and_then(|m| m.provider)
}

pub fn cloud_ready(api_keys: &HashMap<String, String>, id: &str) -> bool {
    let Some(provider) = provider_for(id) else {
        return false;
    };
    api_keys
        .get(&provider)
        .map(|k| !k.trim().is_empty())
        .unwrap_or(false)
}

pub fn model_ready(app: &tauri::AppHandle, api_keys: &HashMap<String, String>, id: &str) -> bool {
    if is_cloud(id) {
        return cloud_ready(api_keys, id);
    }
    is_downloaded(app, id)
}

// ─── Download + cache ───────────────────────────────────────────────────────

use std::io::Read;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager};

pub fn models_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let dir = app.path().app_data_dir()?.join("models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn model_path(app: &AppHandle, id: &str) -> anyhow::Result<PathBuf> {
    let file = file_for(id).ok_or_else(|| anyhow::anyhow!("unknown model: {id}"))?;
    Ok(models_dir(app)?.join(file))
}

pub fn is_downloaded(app: &AppHandle, id: &str) -> bool {
    if is_cloud(id) {
        return false;
    }
    model_path(app, id).map(|p| p.exists()).unwrap_or(false)
}

/// Download the ggml model for `id` into the app data dir, emitting
/// `model://progress` events. No-op if it already exists.
pub fn ensure_model(app: &AppHandle, id: &str) -> anyhow::Result<PathBuf> {
    if is_cloud(id) {
        return Err(anyhow::anyhow!("cloud model {id} has no local download"));
    }

    let path = model_path(app, id)?;
    if path.exists() {
        let _ = app.emit("model://progress", serde_json::json!({ "id": id, "pct": 100 }));
        return Ok(path);
    }

    let file = file_for(id).ok_or_else(|| anyhow::anyhow!("unknown model: {id}"))?;
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{file}"
    );

    let resp = ureq::get(&url).call()?;
    let total: u64 = resp
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let tmp = path.with_extension("download");
    let mut out = std::fs::File::create(&tmp)?;
    let mut reader = resp.into_reader();
    let mut buf = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_pct: i64 = -1;

    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        std::io::Write::write_all(&mut out, &buf[..n])?;
        downloaded += n as u64;
        if total > 0 {
            let pct = ((downloaded * 100) / total) as i64;
            if pct != last_pct {
                last_pct = pct;
                let _ = app.emit(
                    "model://progress",
                    serde_json::json!({ "id": id, "pct": pct }),
                );
            }
        }
    }
    out.sync_all()?;
    drop(out);
    std::fs::rename(&tmp, &path)?;

    let _ = app.emit("model://progress", serde_json::json!({ "id": id, "pct": 100 }));
    Ok(path)
}
