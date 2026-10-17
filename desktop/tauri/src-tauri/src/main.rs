// 琢璞英语讲评工作台 · Tauri 2 桌面壳
//
// 原生能力与 Electron 版保持一致：
//   - 系统托盘（显示/隐藏、打开讲评文件夹、退出）
//   - 无边框窗口 + 前端自绘顶部操作栏（window: 最小化/最大化/关闭）
//   - 文件版讲评：读写程序目录下的 review 文件夹
//
// 说明：窗口的“禁用开发者工具/右键”在 Tauri 中通过
//   1) tauri.conf.json 不开启 devtools（默认关闭）
//   2) 前端 index.html 的桌面守卫屏蔽右键与 F12
// 来实现；正式包不会出现开发者工具入口。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// 讲评文件夹：程序所在目录下的 review/
fn review_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .resource_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| PathBuf::from("."));
    // 正式包放在可执行文件旁边，便于 U 盘带走；找不到就退到资源目录
    let exe_side = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("review")));
    let dir = exe_side.unwrap_or_else(|| base.join("review"));
    let _ = fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<bool, String> {
    let max = window.is_maximized().map_err(|e| e.to_string())?;
    if max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn review_list(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = review_dir(&app);
    let mut names: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
fn review_read(app: AppHandle, name: String) -> Result<String, String> {
    let dir = review_dir(&app);
    fs::read_to_string(dir.join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn review_write(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let dir = review_dir(&app);
    let safe: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let file = if safe.to_lowercase().ends_with(".json") { safe } else { format!("{}.json", safe) };
    let full = dir.join(&file);
    fs::write(&full, content).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}

#[tauri::command]
fn review_delete(app: AppHandle, name: String) -> Result<(), String> {
    let dir = review_dir(&app);
    fs::remove_file(dir.join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn review_reveal(app: AppHandle) -> Result<(), String> {
    let dir = review_dir(&app);
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "reviewDir": review_dir(&app).to_string_lossy().to_string()
    }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_toggle_maximize,
            window_close,
            review_list,
            review_read,
            review_write,
            review_delete,
            review_reveal,
            app_info
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
            let open_dir = MenuItem::with_id(app, "open_dir", "打开讲评文件夹", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &open_dir, &quit])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| tauri::Error::AssetNotFound("icon".into()))?;

            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("琢璞英语讲评工作台")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                    "open_dir" => {
                        let dir = review_dir(app);
                        let _ = app
                            .opener()
                            .open_path(dir.to_string_lossy().to_string(), None::<&str>);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
