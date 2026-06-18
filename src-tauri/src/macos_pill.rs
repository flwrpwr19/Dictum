//! macOS-only NSWindow tweaks for the frameless pill overlay.
//! WKWebView transparency is handled by Tauri/wry — we only clear the native
//! window chrome so release builds don't paint an opaque white plate.

#[cfg(target_os = "macos")]
pub fn clear_window_background(win: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSColor, NSWindow};

    let Ok(ptr) = win.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }

    let ns_window = unsafe { &*(ptr as *mut NSWindow) };
    ns_window.setOpaque(false);
    let clear = NSColor::clearColor();
    ns_window.setBackgroundColor(Some(clear.as_ref()));
}

#[cfg(not(target_os = "macos"))]
pub fn clear_window_background(_win: &tauri::WebviewWindow) {}
