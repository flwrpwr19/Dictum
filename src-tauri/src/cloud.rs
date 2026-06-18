//! Cloud STT providers — Groq, OpenAI, etc.

use std::collections::HashMap;

use crate::{models, whisper};

/// Transcribe audio using the selected cloud model id and stored API keys.
pub fn transcribe(
    model_id: &str,
    api_keys: &HashMap<String, String>,
    samples: &[f32],
    rate: u32,
) -> anyhow::Result<String> {
    let provider = models::provider_for(model_id)
        .ok_or_else(|| anyhow::anyhow!("unknown cloud model: {model_id}"))?;
    let key = api_keys
        .get(&provider)
        .map(|k| k.trim())
        .filter(|k| !k.is_empty())
        .ok_or_else(|| anyhow::anyhow!("missing API key for {provider}"))?;

    let audio_16k = whisper::resample_to_16k(samples, rate);
    if audio_16k.is_empty() {
        return Err(anyhow::anyhow!("recording was empty"));
    }
    let wav = encode_wav_16k_mono(&audio_16k);

    match model_id {
        "groq-whisper-large-v3" => {
            openai_compatible_transcribe(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                key,
                "whisper-large-v3",
                &wav,
            )
        }
        "openai-whisper-1" => {
            openai_compatible_transcribe(
                "https://api.openai.com/v1/audio/transcriptions",
                key,
                "whisper-1",
                &wav,
            )
        }
        "openai-gpt-4o-transcribe" => {
            openai_compatible_transcribe(
                "https://api.openai.com/v1/audio/transcriptions",
                key,
                "gpt-4o-transcribe",
                &wav,
            )
        }
        "openai-gpt-4o-mini-transcribe" => {
            openai_compatible_transcribe(
                "https://api.openai.com/v1/audio/transcriptions",
                key,
                "gpt-4o-mini-transcribe",
                &wav,
            )
        }
        _ => Err(anyhow::anyhow!(
            "{provider} transcription for this model is not wired up yet — try Groq or OpenAI Whisper."
        )),
    }
}

/// OpenAI-compatible multipart `/audio/transcriptions` endpoint.
fn openai_compatible_transcribe(
    url: &str,
    api_key: &str,
    model: &str,
    wav: &[u8],
) -> anyhow::Result<String> {
    let boundary = "dictum-audio-boundary";
    let body = build_multipart_body(boundary, model, wav);

    let resp = ureq::post(url)
        .set("Authorization", &format!("Bearer {api_key}"))
        .set(
            "Content-Type",
            &format!("multipart/form-data; boundary={boundary}"),
        )
        .send_bytes(&body)?;

    let status = resp.status();
    let body_text = resp.into_string()?;

    if status >= 400 {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_text) {
            let msg = json
                .pointer("/error/message")
                .or_else(|| json.pointer("/message"))
                .and_then(|v| v.as_str())
                .unwrap_or(&body_text);
            return Err(anyhow::anyhow!("{msg}"));
        }
        return Err(anyhow::anyhow!("HTTP {status}: {body_text}"));
    }

    let json: serde_json::Value = serde_json::from_str(&body_text)?;
    json.get("text")
        .and_then(|v| v.as_str())
        .map(|s| clean(s))
        .ok_or_else(|| anyhow::anyhow!("unexpected response: {body_text}"))
}

fn build_multipart_body(boundary: &str, model: &str, wav: &[u8]) -> Vec<u8> {
    let mut body = Vec::new();
    append_part(
        &mut body,
        boundary,
        "file",
        Some(("audio.wav", "audio/wav", wav)),
        None,
    );
    append_part(&mut body, boundary, "model", None, Some(model));
    append_part(&mut body, boundary, "response_format", None, Some("json"));
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    body
}

fn append_part(
    body: &mut Vec<u8>,
    boundary: &str,
    name: &str,
    file: Option<(&str, &str, &[u8])>,
    field: Option<&str>,
) {
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    if let Some((filename, mime, data)) = file {
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n")
                .as_bytes(),
        );
        body.extend_from_slice(format!("Content-Type: {mime}\r\n\r\n").as_bytes());
        body.extend_from_slice(data);
        body.extend_from_slice(b"\r\n");
    } else if let Some(value) = field {
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes(),
        );
    }
}

/// Encode mono 16 kHz f32 PCM as a WAV file in memory.
fn encode_wav_16k_mono(samples: &[f32]) -> Vec<u8> {
    let num_samples = samples.len() as u32;
    let byte_rate: u32 = 16_000 * 2;
    let block_align: u16 = 2;
    let bits_per_sample: u16 = 16;
    let data_size = num_samples * 2;
    let chunk_size = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + data_size as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&chunk_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&16_000u32.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let i16_sample = (clamped * 32767.0).round() as i16;
        wav.extend_from_slice(&i16_sample.to_le_bytes());
    }
    wav
}

fn clean(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_header_is_valid() {
        let wav = encode_wav_16k_mono(&[0.0, 0.5, -0.5]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + 3 * 2);
    }
}
