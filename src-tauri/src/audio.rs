//! Microphone capture via cpal. The cpal `Stream` is `!Send`, so it is owned by
//! a dedicated control thread that we drive with commands over a channel.

use std::sync::mpsc::{Receiver, Sender};
use std::sync::Arc;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

pub enum AudioCmd {
    /// Begin capturing into a fresh buffer.
    Start,
    /// Stop capturing; the captured mono samples + input sample rate are sent back.
    Stop(Sender<(Vec<f32>, u32)>),
}

const BARS: usize = 28;

/// Spawn the audio control thread. Returns a sender for commands.
pub fn spawn(app: AppHandle) -> Sender<AudioCmd> {
    let (tx, rx) = std::sync::mpsc::channel::<AudioCmd>();
    std::thread::spawn(move || audio_loop(app, rx));
    tx
}

fn audio_loop(app: AppHandle, rx: Receiver<AudioCmd>) {
    // Per-session capture state.
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut stream: Option<cpal::Stream> = None;
    let mut sample_rate: u32 = 16_000;

    while let Ok(cmd) = rx.recv() {
        match cmd {
            AudioCmd::Start => {
                buffer.lock().clear();
                match build_stream(&app, buffer.clone()) {
                    Ok((s, rate)) => {
                        sample_rate = rate;
                        if let Err(e) = s.play() {
                            emit_error(&app, &format!("Could not start microphone: {e}"));
                        } else {
                            stream = Some(s);
                        }
                    }
                    Err(e) => emit_error(&app, &format!("Microphone unavailable: {e}")),
                }
            }
            AudioCmd::Stop(reply) => {
                // Dropping the stream halts capture and flushes the callback.
                stream = None;
                let captured = buffer.lock().clone();
                let _ = reply.send((captured, sample_rate));
            }
        }
    }
}

fn build_stream(
    app: &AppHandle,
    buffer: Arc<Mutex<Vec<f32>>>,
) -> anyhow::Result<(cpal::Stream, u32)> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow::anyhow!("no input device"))?;
    let config = device.default_input_config()?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;
    let app_for_cb = app.clone();
    let app_for_err = app.clone();

    let err_fn = move |e| emit_error(&app_for_err, &format!("Audio stream error: {e}"));

    // Throttle level events to ~30/s regardless of buffer callback cadence.
    let last_emit = Arc::new(Mutex::new(std::time::Instant::now()));

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| {
                ingest(&app_for_cb, &buffer, &last_emit, data, channels, |s| s);
            },
            err_fn,
            None,
        )?,
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| {
                ingest(&app_for_cb, &buffer, &last_emit, data, channels, |s| {
                    s as f32 / i16::MAX as f32
                });
            },
            err_fn,
            None,
        )?,
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config.into(),
            move |data: &[u16], _| {
                ingest(&app_for_cb, &buffer, &last_emit, data, channels, |s| {
                    (s as f32 / u16::MAX as f32) * 2.0 - 1.0
                });
            },
            err_fn,
            None,
        )?,
        fmt => return Err(anyhow::anyhow!("unsupported sample format: {fmt:?}")),
    };

    Ok((stream, sample_rate))
}

/// Downmix interleaved frames to mono, append to the buffer, and emit a
/// throttled level + bars event for the waveform.
fn ingest<T: Copy>(
    app: &AppHandle,
    buffer: &Arc<Mutex<Vec<f32>>>,
    last_emit: &Arc<Mutex<std::time::Instant>>,
    data: &[T],
    channels: usize,
    to_f32: impl Fn(T) -> f32,
) {
    let frames = data.len() / channels.max(1);
    let mut mono = Vec::with_capacity(frames);
    for f in 0..frames {
        let mut sum = 0.0f32;
        for c in 0..channels {
            sum += to_f32(data[f * channels + c]);
        }
        mono.push(sum / channels as f32);
    }

    // RMS for the overall level.
    let rms = if mono.is_empty() {
        0.0
    } else {
        (mono.iter().map(|s| s * s).sum::<f32>() / mono.len() as f32).sqrt()
    };
    let level = (rms * 3.2).clamp(0.0, 1.0);

    // Segment RMS → bar heights.
    let mut bars = vec![0.0f32; BARS];
    if !mono.is_empty() {
        let seg = (mono.len() / BARS).max(1);
        for (i, bar) in bars.iter_mut().enumerate() {
            let start = i * seg;
            let end = ((i + 1) * seg).min(mono.len());
            if start >= end {
                continue;
            }
            let s: f32 = mono[start..end].iter().map(|v| v * v).sum::<f32>();
            *bar = ((s / (end - start) as f32).sqrt() * 4.0).clamp(0.0, 1.0);
        }
    }

    buffer.lock().extend_from_slice(&mono);

    let mut last = last_emit.lock();
    if last.elapsed().as_millis() >= 33 {
        *last = std::time::Instant::now();
        let _ = app.emit(
            "flow://level",
            serde_json::json!({ "level": level, "bars": bars }),
        );
    }
}

fn emit_error(app: &AppHandle, message: &str) {
    let _ = app.emit("flow://error", serde_json::json!({ "message": message }));
}
