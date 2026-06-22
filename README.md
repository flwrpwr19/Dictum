# Dictum

Speak naturally — Dictum turns your words into text on your Mac and keeps your audio private.

Dictum is a native macOS dictation app that runs Whisper on your device. It provides a global hotkey, a small floating “speaking pill” you can click or drag, and optional auto‑paste into other apps. Requires macOS 11+.

## Quick install

1. Download the latest `.dmg` from Releases: https://github.com/flwrpwr19/Dictum/releases/latest
2. Remove macOS quarantine on the downloaded DMG:
```bash
xattr -cr ~/Downloads/Dictum_*.dmg
```
3. Open the DMG and drag Dictum to Applications, then clear quarantine on the installed app:
```bash
xattr -cr /Applications/Dictum.app
```
4. Launch Dictum and grant Microphone access.  
For auto‑paste, enable Accessibility: System Settings → Privacy & Security → Accessibility → Dictum

> Note: If macOS warns you when opening an unsigned app, that’s expected for builds that haven’t been notarized yet.

## Controls

- Toggle dictation: ⌘ ⇧ D (changeable in Settings)
- Speaking pill: always-on-top overlay — click or drag
- Tray menu: Start/Stop · Open · Quit

## Architecture (high level)

- Shell: Tauri — global hotkey, tray, auto-paste  
- Transcription: whisper.cpp via whisper-rs (Metal accelerated)  
- Audio: cpal — live waveform levels  
- UI: Next.js · React · Framer Motion

Flow: hotkey → mic capture → local Whisper → snippet expansion → clipboard + auto‑paste → workspace history

---

Lattice Labs · Dictum v0.1.0
