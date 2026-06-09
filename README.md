<div align="center">

<br />

<img src="https://img.shields.io/badge/●-Dictum-8b7bff?style=for-the-badge&labelColor=0b0c10" alt="Dictum" />

<br /><br />

<h1>Talk at full speed.<br/>Text stays on your Mac.</h1>

<p>
  <strong>Dictum</strong> is a native macOS dictation app — local Whisper, global hotkey,<br/>
  floating speaking pill, auto-paste. Your audio never leaves the device.
</p>

<p>
  <img src="https://img.shields.io/badge/macOS-11%2B-111218?style=flat-square&logo=apple&logoColor=f4f4f7" alt="macOS 11+" />
  <img src="https://img.shields.io/badge/Whisper-on--device-111218?style=flat-square&labelColor=0b0c10&color=67e8f9" alt="On-device" />
  <img src="https://img.shields.io/badge/Metal-accelerated-111218?style=flat-square&labelColor=0b0c10&color=8b7bff" alt="Metal" />
  <img src="https://img.shields.io/badge/License-private-111218?style=flat-square&labelColor=0b0c10&color=8a90a4" alt="License" />
</p>

<br />

</div>

---

## Install

> **Unsigned build.** macOS Gatekeeper will block the app on first open. This is expected until the app is notarized.

### 1 · Download

Grab the latest **`.dmg`** from [**Releases**](https://github.com/flwrpwr19/Dictum/releases/latest).

### 2 · Clear quarantine

After downloading, remove the quarantine flag macOS attaches to unsigned files:

```bash
xattr -cr ~/Downloads/Dictum_*.dmg
```

### 3 · Install

Open the DMG, drag **Dictum** into **Applications**, then clear quarantine on the app itself:

```bash
xattr -cr /Applications/Dictum.app
```

### 4 · Launch

Open Dictum from Applications. Grant **Microphone** when prompted.

For **auto-paste** into other apps, also enable **Accessibility**:
**System Settings → Privacy & Security → Accessibility → Dictum**.

---

## Controls

| Action | Default |
| --- | --- |
| Toggle dictation | `⌘` `⇧` `D` |
| Speaking pill | Always-on-top overlay — click or drag |
| Tray menu | Start/stop · Open · Quit |

Change the hotkey in **Settings** inside the app.

---

## Build the DMG

Requirements: **macOS**, **Xcode CLI tools**, **Rust**, **Bun**.

```bash
bun install
bun run build:dmg
```

Output:

```text
src-tauri/target/release/bundle/dmg/Dictum_0.1.0_aarch64.dmg
```

(Exact filename depends on version and architecture.)

### Development

```bash
bun run desktop
```

---

## Architecture

| Layer | Stack |
| --- | --- |
| Shell | Tauri 2 · global hotkey · tray · auto-paste |
| Transcription | whisper.cpp via whisper-rs · Metal |
| Audio | cpal · live waveform levels |
| UI | Next.js · React · Framer Motion |

**Flow:** hotkey → mic capture → local Whisper → snippets expansion → clipboard + auto-paste → workspace history.

---

## Website

Marketing pages live in the [**Clarum**](https://github.com/SinergaOptima/Clarum) monorepo under `apps/dictum-web`.

---

<div align="center">

<br />

<sub>Lattice Labs · Dictum v0.1.0</sub>

<br /><br />

</div>
