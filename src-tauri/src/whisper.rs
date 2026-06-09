//! Native Whisper transcription via whisper-rs (whisper.cpp, Metal accelerated).

use std::path::Path;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Resample a mono signal from `from_rate` to 16 kHz using linear
/// interpolation — Whisper expects 16 kHz f32 mono.
pub fn resample_to_16k(input: &[f32], from_rate: u32) -> Vec<f32> {
    const TARGET: u32 = 16_000;
    if from_rate == TARGET || input.is_empty() {
        return input.to_vec();
    }
    let ratio = TARGET as f64 / from_rate as f64;
    let out_len = ((input.len() as f64) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 / ratio;
        let idx = src.floor() as usize;
        let frac = src - idx as f64;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac as f32);
    }
    out
}

pub struct Transcriber {
    ctx: WhisperContext,
}

impl Transcriber {
    pub fn load(model_path: &Path) -> anyhow::Result<Self> {
        let ctx = WhisperContext::new_with_params(
            model_path
                .to_str()
                .ok_or_else(|| anyhow::anyhow!("invalid model path"))?,
            WhisperContextParameters::default(),
        )?;
        Ok(Self { ctx })
    }

    /// Transcribe 16 kHz mono f32 samples into a single cleaned string.
    pub fn transcribe(&self, audio_16k: &[f32]) -> anyhow::Result<String> {
        let mut state = self.ctx.create_state()?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        let threads = std::thread::available_parallelism()
            .map(|n| n.get() as i32)
            .unwrap_or(4)
            .min(8);
        params.set_n_threads(threads);
        params.set_language(Some("en"));
        params.set_translate(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        state.full(params, audio_16k)?;

        let n = state.full_n_segments()?;
        let mut text = String::new();
        for i in 0..n {
            let seg = state.full_get_segment_text(i)?;
            text.push_str(&seg);
        }
        Ok(clean(&text))
    }
}

/// Trim whisper's leading space and collapse interior whitespace.
fn clean(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}
