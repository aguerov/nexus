#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AtomicBool::new(false))
        .invoke_handler(tauri::generate_handler![set_session_active])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<AtomicBool>().load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.minimize();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NEXUS client");
}
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[tauri::command]
fn set_session_active(active: bool, session: tauri::State<'_, AtomicBool>) {
    session.store(active, Ordering::Relaxed);
}

