//! Native Whisper (ggml) model registry + on-demand downloader.

use std::io::Read;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub file: String,
    pub size: String,
    pub blurb: String,
}

/// Map our friendly model id to the ggml file published on the
/// `ggerganov/whisper.cpp` Hugging Face repo.
pub fn registry() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "tiny".into(),
            label: "Tiny".into(),
            file: "ggml-tiny.en.bin".into(),
            size: "~75 MB".into(),
            blurb: "Fastest. Great for quick notes.".into(),
        },
        ModelInfo {
            id: "base".into(),
            label: "Base".into(),
            file: "ggml-base.en.bin".into(),
            size: "~142 MB".into(),
            blurb: "Balanced speed and accuracy. The default.".into(),
        },
        ModelInfo {
            id: "small".into(),
            label: "Small".into(),
            file: "ggml-small.en.bin".into(),
            size: "~466 MB".into(),
            blurb: "Most accurate. Metal-accelerated.".into(),
        },
    ]
}

pub fn file_for(id: &str) -> Option<String> {
    registry().into_iter().find(|m| m.id == id).map(|m| m.file)
}

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
    model_path(app, id).map(|p| p.exists()).unwrap_or(false)
}

/// Download the ggml model for `id` into the app data dir, emitting
/// `model://progress` events. No-op if it already exists.
pub fn ensure_model(app: &AppHandle, id: &str) -> anyhow::Result<PathBuf> {
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
