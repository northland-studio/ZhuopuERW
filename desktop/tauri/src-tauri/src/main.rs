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
use tauri_plugin_opener::OpenerExt;

/// 讲评文件夹解析：
///   1) 优先用「可执行文件同级的 review/」（U 盘/绿色版可随身带走）
///   2) 但如果程序装在 Program Files 等只读位置，创建会失败 → 退到用户数据目录
/// 返回 (目录, 是否可写)
fn resolve_review_dir(app: &AppHandle) -> PathBuf {
    // 候选 1：exe 同级
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("review")))
    {
        if fs::create_dir_all(&dir).is_ok() {
            // 真正验证可写（create_dir_all 对已存在目录不会报错）
            let probe = dir.join(".write-test");
            if fs::write(&probe, b"ok").is_ok() {
                let _ = fs::remove_file(&probe);
                return dir;
            }
        }
    }
    // 候选 2：用户数据目录（%APPDATA%\top.xuanjian.zhuopu\review）
    let fallback = app
        .path()
        .app_data_dir()
        .map(|d| d.join("review"))
        .unwrap_or_else(|_| PathBuf::from("./review"));
    let _ = fs::create_dir_all(&fallback);
    fallback
}

fn review_dir(app: &AppHandle) -> PathBuf {
    resolve_review_dir(app)
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

/// 列表元素与前端 DesktopBridge 约定一致：{ name, size, mtime }
#[derive(serde::Serialize)]
struct ReviewFile {
    name: String,
    size: u64,
    mtime: u64,
}

#[tauri::command]
fn review_list(app: AppHandle) -> Result<Vec<ReviewFile>, String> {
    let dir = review_dir(&app);
    let entries = fs::read_dir(&dir).map_err(|e| format!("读取 {} 失败：{}", dir.display(), e))?;

    let mut files: Vec<ReviewFile> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|x| x.eq_ignore_ascii_case("json"))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(ReviewFile {
                name: e.file_name().into_string().ok()?,
                size: meta.len(),
                mtime,
            })
        })
        .collect();
    files.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(files)
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
