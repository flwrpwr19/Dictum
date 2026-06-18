mod audio;
mod cloud;
mod macos_pill;
mod models;
mod snippets;
mod whisper;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder,
};
use tauri::utils::config::{BackgroundThrottlingPolicy, Color};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

use audio::AudioCmd;
use whisper::Transcriber;

pub use snippets::Snippet;

#[derive(Clone, Serialize, Deserialize)]
pub struct Config {
    pub model: String,
    pub hotkey: String,
    pub auto_paste: bool,
    #[serde(default)]
    pub snippets: Vec<Snippet>,
    #[serde(default)]
    pub api_keys: HashMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            model: "base".into(),
            hotkey: "CmdOrCtrl+Shift+D".into(),
            auto_paste: true,
            snippets: Vec::new(),
            api_keys: HashMap::new(),
        }
    }
}

pub struct AppState {
    audio_tx: Sender<AudioCmd>,
    recording: AtomicBool,
    /// Set after the pill overlay is positioned once at launch — never reset on dictate.
    pill_bootstrapped: AtomicBool,
    transcriber: Mutex<Option<(String, Arc<Transcriber>)>>,
    config: Mutex<Config>,
}

fn config_path(app: &AppHandle) -> anyhow::Result<std::path::PathBuf> {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

fn load_config(app: &AppHandle) -> Config {
    config_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, cfg: &Config) {
    if let Ok(p) = config_path(app) {
        let _ = std::fs::write(p, serde_json::to_string_pretty(cfg).unwrap_or_default());
    }
}

// ─── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
fn get_models() -> Vec<models::ModelInfo> {
    models::registry()
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.config.lock().clone()
}

#[tauri::command]
fn model_ready(app: AppHandle, state: State<AppState>, id: String) -> bool {
    let cfg = state.config.lock();
    models::model_ready(&app, &cfg.api_keys, &id)
}

#[tauri::command]
fn prepare_model(app: AppHandle, id: String) {
    if models::is_cloud(&id) {
        return;
    }
    std::thread::spawn(move || {
        if let Err(e) = models::ensure_model(&app, &id) {
            let _ = app.emit(
                "flow://error",
                serde_json::json!({ "message": format!("Model download failed: {e}") }),
            );
        }
    });
}

#[tauri::command]
fn set_config(app: AppHandle, state: State<AppState>, config: Config) {
    let previous = state.config.lock().clone();
    *state.config.lock() = config.clone();
    save_config(&app, &config);

    // Re-register the global shortcut if it changed.
    if previous.hotkey != config.hotkey {
        let gs = app.global_shortcut();
        let _ = gs.unregister_all();
        if let Some(sc) = parse_shortcut(&config.hotkey) {
            let _ = gs.register(sc);
        }
    }

    // Drop a cached transcriber if the model changed; pre-fetch local downloads.
    if previous.model != config.model {
        *state.transcriber.lock() = None;
        if !models::is_cloud(&config.model) {
            let app2 = app.clone();
            let id = config.model.clone();
            std::thread::spawn(move || {
                let _ = models::ensure_model(&app2, &id);
            });
        }
    }
}

#[tauri::command]
fn start_dictation(app: AppHandle, state: State<AppState>) {
    if state.recording.swap(true, Ordering::SeqCst) {
        return; // already recording
    }
    let _ = state.audio_tx.send(AudioCmd::Start);
    ensure_pill_visible(&app);
    let _ = app.emit("flow://state", serde_json::json!({ "state": "listening" }));
}

#[tauri::command]
fn stop_dictation(app: AppHandle, state: State<AppState>) {
    if !state.recording.swap(false, Ordering::SeqCst) {
        return; // wasn't recording
    }

    let (tx, rx) = std::sync::mpsc::channel();
    let _ = state.audio_tx.send(AudioCmd::Stop(tx));
    let (samples, rate) = rx.recv().unwrap_or_default();

    // Too short to mean anything.
    let recorded_ms = (samples.len() as f64 / rate.max(1) as f64 * 1000.0) as u64;
    if recorded_ms < 350 {
        let _ = app.emit("flow://state", serde_json::json!({ "state": "idle" }));
        return;
    }

    let _ = app.emit(
        "flow://state",
        serde_json::json!({ "state": "transcribing" }),
    );

    let cfg = state.config.lock().clone();

    // Heavy work off the UI/command thread.
    tauri::async_runtime::spawn(async move {
        let result = run_transcription(&app, &cfg.model, &cfg.api_keys, samples, rate);
        match result {
            Ok((raw_text, duration_ms)) => {
                let text = snippets::apply_snippets(&raw_text, &cfg.snippets);
                if text.is_empty() {
                    let _ = app.emit("flow://state", serde_json::json!({ "state": "idle" }));
                    return;
                }
                let _ = app.clipboard().write_text(text.clone());
                if cfg.auto_paste {
                    // macOS HIToolbox / TSM APIs used by keyboard simulation must run
                    // on the main dispatch queue — calling from a tokio worker crashes.
                    paste_on_main_thread(&app);
                }
                let _ = app.emit(
                    "flow://result",
                    serde_json::json!({
                        "text": text,
                        "durationMs": duration_ms,
                        "recordedMs": recorded_ms,
                    }),
                );
                let _ = app.emit("flow://state", serde_json::json!({ "state": "ready" }));
                schedule_idle_state(&app);
            }
            Err(e) => {
                let _ = app.emit(
                    "flow://error",
                    serde_json::json!({ "message": format!("Transcription failed: {e}") }),
                );
                let _ = app.emit("flow://state", serde_json::json!({ "state": "error" }));
            }
        }
    });
}

#[tauri::command]
fn toggle_dictation(app: AppHandle, state: State<AppState>) {
    if state.recording.load(Ordering::SeqCst) {
        stop_dictation(app, state);
    } else {
        start_dictation(app, state);
    }
}

fn run_transcription(
    app: &AppHandle,
    model: &str,
    api_keys: &HashMap<String, String>,
    samples: Vec<f32>,
    rate: u32,
) -> anyhow::Result<(String, u64)> {
    let started = std::time::Instant::now();
    if models::is_cloud(model) {
        let text = cloud::transcribe(model, api_keys, &samples, rate)?;
        return Ok((text, started.elapsed().as_millis() as u64));
    }
    let path = models::ensure_model(app, model)?;
    let state = app.state::<AppState>();

    // Reuse a cached context if the model matches.
    let transcriber = {
        let mut guard = state.transcriber.lock();
        match guard.as_ref() {
            Some((id, t)) if id == model => t.clone(),
            _ => {
                let t = Arc::new(Transcriber::load(&path)?);
                *guard = Some((model.to_string(), t.clone()));
                t
            }
        }
    };

    let audio = whisper::resample_to_16k(&samples, rate);
    let text = transcriber.transcribe(&audio)?;
    Ok((text, started.elapsed().as_millis() as u64))
}

// ─── Pill overlay window ──────────────────────────────────────────────────────

/// Bring the pill forward when dictation starts — keep the user's chosen position.
fn ensure_pill_visible(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(pill) = app.get_webview_window("pill") {
            let _ = pill.set_visible_on_all_workspaces(true);
            let _ = pill.show();
        }
    });
}

fn bootstrap_pill(app: &AppHandle, win: &tauri::WebviewWindow) {
    let state = app.state::<AppState>();
    let first = !state.pill_bootstrapped.swap(true, Ordering::SeqCst);

    if first {
        macos_pill::clear_window_background(win);
        position_pill(app, win);
    }
    let _ = win.set_visible_on_all_workspaces(true);
    let _ = win.show();
    if first {
        let _ = app.emit("flow://state", serde_json::json!({ "state": "idle" }));
    }
}

/// Pill window setup must run on the AppKit main thread.
fn schedule_pill_bootstrap(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(pill) = app.get_webview_window("pill") {
            bootstrap_pill(&app, &pill);
        }
    });
}

fn schedule_idle_state(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1600));
        if !app.state::<AppState>().recording.load(Ordering::SeqCst) {
            let _ = app.emit("flow://state", serde_json::json!({ "state": "idle" }));
        }
    });
}

fn position_pill(app: &AppHandle, win: &tauri::WebviewWindow) {
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return;
    };

    // work_area excludes the menu bar and Dock — sit just above the dock edge.
    let work = monitor.work_area();
    let gap = (12.0 * monitor.scale_factor()) as i32;

    if let Ok(size) = win.outer_size() {
        let x = work.position.x + (work.size.width as i32 - size.width as i32) / 2;
        let y = work.position.y + work.size.height as i32 - size.height as i32 - gap;
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

// ─── Auto-paste ───────────────────────────────────────────────────────────────

/// Schedule ⌘V (or Ctrl+V) on the AppKit main thread and wait briefly so paste
/// finishes before we emit the transcript to the UI.
fn paste_on_main_thread(app: &AppHandle) {
    let (done_tx, done_rx) = std::sync::mpsc::sync_channel(1);
    let app = app.clone();
    if app
        .run_on_main_thread(move || {
            paste_into_focused();
            let _ = done_tx.send(());
        })
        .is_err()
    {
        return;
    }
    let _ = done_rx.recv_timeout(std::time::Duration::from_secs(2));
}

fn paste_into_focused() {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    // Small delay so the clipboard write settles and the target app is frontmost.
    std::thread::sleep(std::time::Duration::from_millis(120));
    let Ok(mut enigo) = Enigo::new(&Settings::default()) else {
        return;
    };
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    let _ = enigo.key(modifier, Direction::Press);
    let _ = enigo.key(Key::Unicode('v'), Direction::Click);
    let _ = enigo.key(modifier, Direction::Release);
}

// ─── Global shortcut parsing ──────────────────────────────────────────────────

fn parse_shortcut(spec: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in spec.split('+') {
        match part.trim().to_ascii_lowercase().as_str() {
            "cmdorctrl" | "commandorcontrol" => {
                #[cfg(target_os = "macos")]
                {
                    mods |= Modifiers::META;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    mods |= Modifiers::CONTROL;
                }
            }
            "cmd" | "command" | "meta" | "super" => mods |= Modifiers::META,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            key => code = key_to_code(key),
        }
    }
    code.map(|c| Shortcut::new(Some(mods), c))
}

fn key_to_code(key: &str) -> Option<Code> {
    let c = match key {
        "space" => Code::Space,
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "v" => Code::KeyV,
        "z" => Code::KeyZ,
        "period" | "." => Code::Period,
        "semicolon" | ";" => Code::Semicolon,
        "backquote" | "`" => Code::Backquote,
        _ => return None,
    };
    Some(c)
}

// ─── App bootstrap ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let app = app.clone();
                        let state = app.state::<AppState>();
                        toggle_dictation(app.clone(), state);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            let config = load_config(&handle);

            // Audio capture thread.
            let audio_tx = audio::spawn(handle.clone());

            app.manage(AppState {
                audio_tx,
                recording: AtomicBool::new(false),
                pill_bootstrapped: AtomicBool::new(false),
                transcriber: Mutex::new(None),
                config: Mutex::new(config.clone()),
            });

            // Desktop shell only uses the workspace — keep marketing routes web-only.
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.eval(
                    "if (!location.pathname.startsWith('/app')) { window.location.replace('/app'); }",
                );
            }

            // Floating pill overlay window (frameless, transparent, on-top).
            let pill = WebviewWindowBuilder::new(app, "pill", WebviewUrl::App("/pill".into()))
                .title("Dictum")
                .inner_size(360.0, 64.0)
                .min_inner_size(360.0, 64.0)
                .max_inner_size(360.0, 64.0)
                .decorations(false)
                .transparent(true)
                .background_color(Color(0, 0, 0, 0))
                .always_on_top(true)
                .skip_taskbar(true)
                .shadow(false)
                .resizable(false)
                .focused(false)
                .visible(false)
                .accept_first_mouse(true)
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .on_page_load({
                    let handle = handle.clone();
                    move |_win, payload| {
                        if payload.event() == PageLoadEvent::Finished {
                            schedule_pill_bootstrap(&handle);
                        }
                    }
                })
                .build()?;
            let _ = pill;

            let handle_delayed = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                schedule_pill_bootstrap(&handle_delayed);
            });

            // Register the configured global shortcut.
            if let Some(sc) = parse_shortcut(&config.hotkey) {
                let _ = app.global_shortcut().register(sc);
            }

            // Tray icon + menu.
            let toggle_item = MenuItem::with_id(app, "toggle", "Start / Stop dictation", true, None::<&str>)?;
            let open_item = MenuItem::with_id(app, "open", "Open Dictum", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &open_item, &quit_item])?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Dictum — Speak. It's written.")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        let state = app.state::<AppState>();
                        toggle_dictation(app.clone(), state);
                    }
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Warm the default local model in the background.
            let warm = handle.clone();
            let model_id = config.model.clone();
            if !models::is_cloud(&model_id) {
                std::thread::spawn(move || {
                    let _ = models::ensure_model(&warm, &model_id);
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_models,
            get_config,
            set_config,
            model_ready,
            prepare_model,
            start_dictation,
            stop_dictation,
            toggle_dictation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dictum");
}
