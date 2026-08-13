#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::str::FromStr;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use tauri::Manager;
use tauri::State;
use tauri::menu::{Menu, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// SQLite 连接经 Mutex 注入 Tauri 状态（Connection 非 Sync，必须包 Mutex 才能 manage）。
struct DbConn(Mutex<Connection>);

#[derive(Serialize, Deserialize, Clone)]
struct RecordRow {
    id: i64,
    #[serde(rename = "type")]
    rtype: String,
    cat: String,
    subcat: String,
    amount: f64,
    account: String,
    bucket: String,
    mood: String,
    note: String,
    ts: i64,
}

#[derive(Deserialize)]
struct RecPayload {
    #[serde(rename = "type")]
    rtype: String,
    cat: String,
    #[serde(default)]
    subcat: Option<String>,
    amount: f64,
    #[serde(default)]
    account: Option<String>,
    #[serde(default)]
    bucket: Option<String>,
    #[serde(default)]
    mood: Option<String>,
    #[serde(default)]
    note: Option<String>,
    ts: i64,
}

#[derive(Serialize, Deserialize, Clone)]
struct AccountRow {
    id: i64,
    name: String,
    balance: f64,
}

#[derive(Deserialize)]
struct ExportBlob {
    records: Vec<RecordRow>,
    accounts: Vec<AccountRow>,
    #[serde(default)]
    meta: HashMap<String, String>,
}

/// 建表 + 写版本 meta（幂等，可重复调用）。
fn init_schema(c: &Connection) {
    let _ = c.execute_batch(
        "CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            cat TEXT NOT NULL,
            subcat TEXT DEFAULT '',
            amount REAL NOT NULL,
            account TEXT DEFAULT '',
            bucket TEXT DEFAULT '',
            mood TEXT DEFAULT '',
            note TEXT DEFAULT '',
            ts INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts);
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            balance REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS meta (
            k TEXT PRIMARY KEY,
            v TEXT
        );",
    );
    let _ = c.execute("INSERT OR IGNORE INTO meta (k,v) VALUES ('version','2')", []);
}

#[tauri::command]
fn db_init(state: State<DbConn>) -> bool {
    let c = state.0.lock().unwrap();
    init_schema(&c);
    true
}

#[tauri::command]
fn record_list(state: State<DbConn>, range: Option<(i64, i64)>) -> Vec<RecordRow> {
    let c = state.0.lock().unwrap();
    let mut stmt = c
        .prepare("SELECT id,type,cat,subcat,amount,account,bucket,mood,note,ts FROM records ORDER BY ts")
        .unwrap();
    let rows = stmt
        .query_map([], |r| {
            Ok(RecordRow {
                id: r.get(0)?,
                rtype: r.get(1)?,
                cat: r.get(2)?,
                subcat: r.get(3)?,
                amount: r.get(4)?,
                account: r.get(5)?,
                bucket: r.get(6)?,
                mood: r.get(7)?,
                note: r.get(8)?,
                ts: r.get(9)?,
            })
        })
        .unwrap();
    let mut out: Vec<RecordRow> = rows.filter_map(|x| x.ok()).collect();
    if let Some((a, b)) = range {
        out.retain(|r| r.ts >= a && r.ts <= b);
    }
    out
}

#[tauri::command]
fn record_insert(state: State<DbConn>, p: RecPayload) -> i64 {
    let c = state.0.lock().unwrap();
    c.execute(
        "INSERT INTO records (type,cat,subcat,amount,account,bucket,mood,note,ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![
            p.rtype,
            p.cat,
            p.subcat.unwrap_or_default(),
            p.amount,
            p.account.unwrap_or_default(),
            p.bucket.unwrap_or_default(),
            p.mood.unwrap_or_default(),
            p.note.unwrap_or_default(),
            p.ts
        ],
    )
    .unwrap();
    c.last_insert_rowid()
}

#[tauri::command]
fn record_update(state: State<DbConn>, id: i64, p: RecPayload) -> bool {
    let c = state.0.lock().unwrap();
    c.execute(
        "UPDATE records SET type=?1,cat=?2,subcat=?3,amount=?4,account=?5,bucket=?6,mood=?7,note=?8,ts=?9 WHERE id=?10",
        rusqlite::params![
            p.rtype,
            p.cat,
            p.subcat.unwrap_or_default(),
            p.amount,
            p.account.unwrap_or_default(),
            p.bucket.unwrap_or_default(),
            p.mood.unwrap_or_default(),
            p.note.unwrap_or_default(),
            p.ts,
            id
        ],
    )
    .is_ok()
}

#[tauri::command]
fn record_delete(state: State<DbConn>, id: i64) -> bool {
    let c = state.0.lock().unwrap();
    c.execute("DELETE FROM records WHERE id=?1", [id]).is_ok()
}

#[tauri::command]
fn account_list(state: State<DbConn>) -> Vec<AccountRow> {
    let c = state.0.lock().unwrap();
    let mut stmt = c.prepare("SELECT id,name,balance FROM accounts ORDER BY name").unwrap();
    let rows = stmt
        .query_map([], |r| Ok(AccountRow { id: r.get(0)?, name: r.get(1)?, balance: r.get(2)? }))
        .unwrap();
    rows.filter_map(|x| x.ok()).collect()
}

#[tauri::command]
fn account_upsert(state: State<DbConn>, name: String, balance: f64) -> bool {
    let c = state.0.lock().unwrap();
    c.execute(
        "INSERT INTO accounts (name,balance) VALUES (?1,?2) ON CONFLICT(name) DO UPDATE SET balance=excluded.balance",
        rusqlite::params![name, balance],
    )
    .is_ok()
}

#[tauri::command]
fn export_data(state: State<DbConn>) -> String {
    let c = state.0.lock().unwrap();
    let records: Vec<RecordRow> = {
        let mut stmt = c
            .prepare("SELECT id,type,cat,subcat,amount,account,bucket,mood,note,ts FROM records ORDER BY ts")
            .unwrap();
        let rows = stmt
            .query_map([], |r| {
                Ok(RecordRow {
                    id: r.get(0)?,
                    rtype: r.get(1)?,
                    cat: r.get(2)?,
                    subcat: r.get(3)?,
                    amount: r.get(4)?,
                    account: r.get(5)?,
                    bucket: r.get(6)?,
                    mood: r.get(7)?,
                    note: r.get(8)?,
                    ts: r.get(9)?,
                })
            })
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    };
    let accounts: Vec<AccountRow> = {
        let mut stmt = c.prepare("SELECT id,name,balance FROM accounts ORDER BY name").unwrap();
        let rows = stmt
            .query_map([], |r| Ok(AccountRow { id: r.get(0)?, name: r.get(1)?, balance: r.get(2)? }))
            .unwrap();
        rows.filter_map(|x| x.ok()).collect()
    };
    let mut meta: HashMap<String, String> = HashMap::new();
    {
        let mut stmt = c.prepare("SELECT k,v FROM meta").unwrap();
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .unwrap();
        for r in rows.filter_map(|x| x.ok()) {
            meta.insert(r.0, r.1);
        }
    }
    serde_json::json!({ "records": records, "accounts": accounts, "meta": meta }).to_string()
}

#[tauri::command]
fn import_data(state: State<DbConn>, json: String) -> bool {
    let blob: ExportBlob = match serde_json::from_str(&json) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let c = state.0.lock().unwrap();
    let tx = match c.transaction() {
        Ok(t) => t,
        Err(_) => return false,
    };
    if tx.execute("DELETE FROM records", []).is_err() {
        return false;
    }
    if tx.execute("DELETE FROM accounts", []).is_err() {
        return false;
    }
    if tx.execute("DELETE FROM meta", []).is_err() {
        return false;
    }
    for r in &blob.records {
        if tx
            .execute(
                "INSERT INTO records (id,type,cat,subcat,amount,account,bucket,mood,note,ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                rusqlite::params![r.id, r.rtype, r.cat, r.subcat, r.amount, r.account, r.bucket, r.mood, r.note, r.ts],
            )
            .is_err()
        {
            return false;
        }
    }
    for a in &blob.accounts {
        if tx
            .execute(
                "INSERT INTO accounts (id,name,balance) VALUES (?1,?2,?3)",
                rusqlite::params![a.id, a.name, a.balance],
            )
            .is_err()
        {
            return false;
        }
    }
    for (k, v) in &blob.meta {
        if tx.execute("INSERT OR REPLACE INTO meta (k,v) VALUES (?1,?2)", rusqlite::params![k, v]).is_err() {
            return false;
        }
    }
    tx.commit().is_ok()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            db_init,
            record_list,
            record_insert,
            record_update,
            record_delete,
            account_list,
            account_upsert,
            export_data,
            import_data
        ])
        .setup(|app| {
            // 打开 SQLite（所有平台）；完全不读取旧 ledger.json
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = fs::create_dir_all(&dir);
                let path = dir.join("ledger.db");
                if let Ok(conn) = Connection::open(&path) {
                    init_schema(&conn);
                    app.manage(DbConn(Mutex::new(conn)));
                }
            }

            #[cfg(desktop)]
            {
                // 托盘图标：复用应用默认图标
                if let Some(icon) = app.default_window_icon().cloned() {
                    let show_i = MenuItemBuilder::with_id("show", "打开账本").build(app)?;
                    let quit_i = MenuItemBuilder::with_id("quit", "退出").build(app)?;
                    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
                    let _tray = TrayIconBuilder::with_id("main-tray")
                        .icon(icon)
                        .tooltip("打工人小账本")
                        .menu(&menu)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
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
                    let _ = app.global_shortcut().on_shortcut(sc, |app, _sc, _event| {
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
