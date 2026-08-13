#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::str::FromStr;
use tauri::Manager;
use tauri::menu::{Menu, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 过滤文件名中的非法字符，防止路径穿越
fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// 读取账本 JSON（应用数据目录下 ledger.json）。无文件时返回 "null"。
#[tauri::command(name = "ledger-load")]
fn ledger_load(app: tauri::AppHandle) -> String {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let path = dir.join("ledger.json");
            fs::read_to_string(&path).unwrap_or_else(|_| "null".to_string())
        }
        Err(_) => "null".to_string(),
    }
}

/// 写入账本 JSON（应用数据目录下 ledger.json）。
#[tauri::command(name = "ledger-save")]
fn ledger_save(app: tauri::AppHandle, json: String) -> bool {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let _ = fs::create_dir_all(&dir);
            let path = dir.join("ledger.json");
            fs::File::create(&path)
                .and_then(|mut f| f.write_all(json.as_bytes()))
                .is_ok()
        }
        Err(_) => false,
    }
}

/// 导出文件（应用数据目录下 exports/<name>），返回完整路径供提示用户。
#[tauri::command(name = "ledger-export")]
fn ledger_export(app: tauri::AppHandle, name: String, content: String) -> String {
    match app.path().app_data_dir() {
        Ok(dir) => {
            let exp = dir.join("exports");
            let _ = fs::create_dir_all(&exp);
            let path = exp.join(sanitize(&name));
            match fs::File::create(&path).and_then(|mut f| f.write_all(content.as_bytes())) {
                Ok(_) => path.to_string_lossy().to_string(),
                Err(_) => "导出失败".to_string(),
            }
        }
        Err(_) => "导出失败".to_string(),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            ledger_load,
            ledger_save,
            ledger_export
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                // 托盘图标：复用应用默认图标，无需额外资源
                if let Some(icon) = app.default_window_icon().cloned() {
                    let show_i = MenuItemBuilder::with_id("show", "打开账本").build(app)?;
                    let quit_i = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
                    let _tray = TrayIconBuilder::with_id("main-tray")
                        .icon(icon)
                        .tooltip("打工人小账本")
                        .menu(&menu)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
                            "quit" => app.exit(0),
                            _ => {}
                        })
                        .on_tray_icon_event(|tray_icon, event| {
                            if let TrayIconEvent::Click { .. } = event {
                                if let Some(w) = tray_icon.app_handle().get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        })
                        .build(app)?;
                }

                // 全局快捷键：Cmd/Ctrl + Shift + K 唤起快速记账
                if let Ok(sc) = tauri_plugin_global_shortcut::Shortcut::from_str("CmdOrCtrl+Shift+K") {
                    let _ = app.global_shortcut().on_shortcut(sc, |app, _sc| {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("quick-add", ());
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
