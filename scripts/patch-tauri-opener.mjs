import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'desktop', 'tauri', 'src-tauri', 'src', 'main.rs');
let s = fs.readFileSync(p, 'utf8');

// tauri-plugin-opener v2 的 app.opener() 由 OpenerExt trait 提供，必须显式引入
if (!s.includes('OpenerExt')) {
    s = s.replace(
        'use tauri_plugin_dialog::DialogExt;',
        'use tauri_plugin_dialog::DialogExt;\nuse tauri_plugin_opener::OpenerExt;'
    );
    fs.writeFileSync(p, s, 'utf8');
    console.log('main.rs：已引入 tauri_plugin_opener::OpenerExt');
} else {
    console.log('main.rs：已引入过 OpenerExt');
}
