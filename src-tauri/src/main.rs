#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::fs;
use std::str::FromStr;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use tauri::Emitter;
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

// ---------- 纯数据层：只依赖 &Connection，便于 in-memory 单测 ----------

const SEL_REC: &str =
    "SELECT id,type,cat,subcat,amount,account,bucket,mood,note,ts FROM records ORDER BY ts";

fn map_rec(r: &rusqlite::Row) -> rusqlite::Result<RecordRow> {
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
}

fn q_records(c: &Connection) -> Vec<RecordRow> {
    let mut stmt = match c.prepare(SEL_REC) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([], |r| map_rec(r)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|x| x.ok()).collect()
}

fn q_accounts(c: &Connection) -> Vec<AccountRow> {
    let mut stmt = match c.prepare("SELECT id,name,balance FROM accounts ORDER BY name") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map([], |r| {
        Ok(AccountRow { id: r.get(0)?, name: r.get(1)?, balance: r.get(2)? })
    }) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|x| x.ok()).collect()
}

fn q_meta(c: &Connection) -> HashMap<String, String> {
    let mut meta: HashMap<String, String> = HashMap::new();
    if let Ok(mut stmt) = c.prepare("SELECT k,v FROM meta") {
        if let Ok(rows) =
            stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        {
            for (k, v) in rows.filter_map(|x| x.ok()) {
                meta.insert(k, v);
            }
        }
    }
    meta
}

fn list_records(c: &Connection, range: Option<(i64, i64)>) -> Vec<RecordRow> {
    let mut out = q_records(c);
    if let Some((a, b)) = range {
        out.retain(|r| r.ts >= a && r.ts <= b);
    }
    out
}

fn insert_record(c: &Connection, p: &RecPayload) -> i64 {
    let ok = c.execute(
        "INSERT INTO records (type,cat,subcat,amount,account,bucket,mood,note,ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![
            p.rtype,
            p.cat,
            p.subcat.clone().unwrap_or_default(),
            p.amount,
            p.account.clone().unwrap_or_default(),
            p.bucket.clone().unwrap_or_default(),
            p.mood.clone().unwrap_or_default(),
            p.note.clone().unwrap_or_default(),
            p.ts
        ],
    );
    if ok.is_err() {
        return -1;
    }
    c.last_insert_rowid()
}

fn update_record(c: &Connection, id: i64, p: &RecPayload) -> bool {
    c.execute(
        "UPDATE records SET type=?1,cat=?2,subcat=?3,amount=?4,account=?5,bucket=?6,mood=?7,note=?8,ts=?9 WHERE id=?10",
        rusqlite::params![
            p.rtype,
            p.cat,
            p.subcat.clone().unwrap_or_default(),
            p.amount,
            p.account.clone().unwrap_or_default(),
            p.bucket.clone().unwrap_or_default(),
            p.mood.clone().unwrap_or_default(),
            p.note.clone().unwrap_or_default(),
            p.ts,
            id
        ],
    )
    .map(|n| n > 0)
    .unwrap_or(false)
}

fn delete_record(c: &Connection, id: i64) -> bool {
    c.execute("DELETE FROM records WHERE id=?1", [id]).map(|n| n > 0).unwrap_or(false)
}

fn upsert_account(c: &Connection, name: &str, balance: f64) -> bool {
    c.execute(
        "INSERT INTO accounts (name,balance) VALUES (?1,?2) ON CONFLICT(name) DO UPDATE SET balance=excluded.balance",
        rusqlite::params![name, balance],
    )
    .is_ok()
}

fn export_json(c: &Connection) -> String {
    serde_json::json!({
        "records": q_records(c),
        "accounts": q_accounts(c),
        "meta": q_meta(c),
    })
    .to_string()
}

fn import_json(c: &mut Connection, json: &str) -> bool {
    let blob: ExportBlob = match serde_json::from_str(json) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let tx = match c.transaction() {
        Ok(t) => t,
        Err(_) => return false,
    };
    for sql in ["DELETE FROM records", "DELETE FROM accounts", "DELETE FROM meta"] {
        if tx.execute(sql, []).is_err() {
            return false;
        }
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
        if tx
            .execute("INSERT OR REPLACE INTO meta (k,v) VALUES (?1,?2)", rusqlite::params![k, v])
            .is_err()
        {
            return false;
        }
    }
    tx.commit().is_ok()
}

// ---------- Tauri 命令：只做加锁 + 委派 ----------

#[tauri::command]
fn db_init(state: State<DbConn>) -> bool {
    let c = state.0.lock().unwrap();
    init_schema(&c);
    true
}

#[tauri::command]
fn record_list(state: State<DbConn>, range: Option<(i64, i64)>) -> Vec<RecordRow> {
    let c = state.0.lock().unwrap();
    list_records(&c, range)
}

#[tauri::command]
fn record_insert(state: State<DbConn>, p: RecPayload) -> i64 {
    let c = state.0.lock().unwrap();
    insert_record(&c, &p)
}

#[tauri::command]
fn record_update(state: State<DbConn>, id: i64, p: RecPayload) -> bool {
    let c = state.0.lock().unwrap();
    update_record(&c, id, &p)
}

#[tauri::command]
fn record_delete(state: State<DbConn>, id: i64) -> bool {
    let c = state.0.lock().unwrap();
    delete_record(&c, id)
}

#[tauri::command]
fn account_list(state: State<DbConn>) -> Vec<AccountRow> {
    let c = state.0.lock().unwrap();
    q_accounts(&c)
}

#[tauri::command]
fn account_upsert(state: State<DbConn>, name: String, balance: f64) -> bool {
    let c = state.0.lock().unwrap();
    upsert_account(&c, &name, balance)
}

#[tauri::command]
fn export_data(state: State<DbConn>) -> String {
    let c = state.0.lock().unwrap();
    export_json(&c)
}

#[tauri::command]
fn import_data(state: State<DbConn>, json: String) -> bool {
    let mut c = state.0.lock().unwrap();
    import_json(&mut c, &json)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(cat: &str, amount: f64, ts: i64) -> RecPayload {
        RecPayload {
            rtype: "expense".into(),
            cat: cat.into(),
            subcat: None,
            amount,
            account: None,
            bucket: Some("必要".into()),
            mood: None,
            note: Some("测试".into()),
            ts,
        }
    }

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init_schema(&c);
        c
    }

    #[test]
    fn schema_is_idempotent() {
        let c = mem();
        init_schema(&c);
        init_schema(&c);
        let n: i64 = c
            .query_row("SELECT COUNT(*) FROM meta WHERE k='version'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let v: String = c
            .query_row("SELECT v FROM meta WHERE k='version'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "2");
    }

    #[test]
    fn schema_creates_all_tables() {
        let c = mem();
        for t in ["records", "accounts", "meta"] {
            let n: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [t],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "table {} missing", t);
        }
        let idx: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_records_ts'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn record_crud_roundtrip() {
        let c = mem();
        let id = insert_record(&c, &payload("吃饭", 32.0, 1_700_000_000_000));
        assert!(id > 0);

        let rows = list_records(&c, None);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].cat, "吃饭");
        assert_eq!(rows[0].amount, 32.0);
        assert_eq!(rows[0].bucket, "必要");
        assert_eq!(rows[0].subcat, "");

        assert!(update_record(&c, id, &payload("咖啡", 18.5, 1_700_000_000_001)));
        let rows = list_records(&c, None);
        assert_eq!(rows[0].cat, "咖啡");
        assert_eq!(rows[0].amount, 18.5);

        assert!(delete_record(&c, id));
        assert!(list_records(&c, None).is_empty());
        assert!(!delete_record(&c, id), "重复删除应返回 false");
    }

    #[test]
    fn record_list_range_filters() {
        let c = mem();
        insert_record(&c, &payload("A", 1.0, 100));
        insert_record(&c, &payload("B", 2.0, 200));
        insert_record(&c, &payload("C", 3.0, 300));
        assert_eq!(list_records(&c, None).len(), 3);
        let mid = list_records(&c, Some((150, 250)));
        assert_eq!(mid.len(), 1);
        assert_eq!(mid[0].cat, "B");
        assert_eq!(list_records(&c, Some((0, 99))).len(), 0);
        assert_eq!(list_records(&c, Some((100, 300))).len(), 3);
    }

    #[test]
    fn record_list_ordered_by_ts() {
        let c = mem();
        insert_record(&c, &payload("late", 1.0, 900));
        insert_record(&c, &payload("early", 1.0, 100));
        let rows = list_records(&c, None);
        assert_eq!(rows[0].cat, "early");
        assert_eq!(rows[1].cat, "late");
    }

    #[test]
    fn account_upsert_is_unique_by_name() {
        let c = mem();
        assert!(upsert_account(&c, "储蓄卡", 1000.0));
        assert!(upsert_account(&c, "储蓄卡", 2000.0));
        let a = q_accounts(&c);
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].name, "储蓄卡");
        assert_eq!(a[0].balance, 2000.0);
        assert!(upsert_account(&c, "工资卡", 500.0));
        assert_eq!(q_accounts(&c).len(), 2);
    }

    #[test]
    fn export_import_roundtrip() {
        let mut c = mem();
        insert_record(&c, &payload("吃饭", 32.0, 111));
        upsert_account(&c, "储蓄卡", 1000.0);
        let blob = export_json(&c);
        assert!(blob.contains("吃饭"));
        assert!(blob.contains("储蓄卡"));

        // 清空后再导入，应完整还原
        c.execute("DELETE FROM records", []).unwrap();
        c.execute("DELETE FROM accounts", []).unwrap();
        assert!(list_records(&c, None).is_empty());

        assert!(import_json(&mut c, &blob));
        let rows = list_records(&c, None);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].cat, "吃饭");
        assert_eq!(q_accounts(&c).len(), 1);
        assert_eq!(q_meta(&c).get("version").map(|s| s.as_str()), Some("2"));
    }

    #[test]
    fn import_rejects_bad_json() {
        let mut c = mem();
        insert_record(&c, &payload("吃饭", 32.0, 111));
        assert!(!import_json(&mut c, "not json"));
        // 失败不应破坏既有数据
        assert_eq!(list_records(&c, None).len(), 1);
    }

    #[test]
    fn import_replaces_existing_rows() {
        let mut c = mem();
        insert_record(&c, &payload("旧", 1.0, 1));
        let empty = serde_json::json!({ "records": [], "accounts": [], "meta": {} }).to_string();
        assert!(import_json(&mut c, &empty));
        assert!(list_records(&c, None).is_empty());
    }

    #[test]
    fn payload_defaults_fill_empty_strings() {
        let c = mem();
        let p = RecPayload {
            rtype: "income".into(),
            cat: "副业".into(),
            subcat: None,
            amount: 500.0,
            account: None,
            bucket: None,
            mood: None,
            note: None,
            ts: 42,
        };
        insert_record(&c, &p);
        let r = &list_records(&c, None)[0];
        assert_eq!(r.rtype, "income");
        assert_eq!(r.subcat, "");
        assert_eq!(r.account, "");
        assert_eq!(r.bucket, "");
        assert_eq!(r.mood, "");
        assert_eq!(r.note, "");
    }

    #[test]
    fn payload_deserializes_type_field() {
        let p: RecPayload =
            serde_json::from_str(r#"{"type":"expense","cat":"交通","amount":6,"ts":9}"#).unwrap();
        assert_eq!(p.rtype, "expense");
        assert_eq!(p.cat, "交通");
        assert_eq!(p.amount, 6.0);
        assert_eq!(p.ts, 9);
    }

    #[test]
    fn record_row_serializes_type_field() {
        let c = mem();
        insert_record(&c, &payload("吃饭", 1.0, 1));
        let json = export_json(&c);
        assert!(json.contains("\"type\":\"expense\""), "序列化应输出 type 而非 rtype: {}", json);
    }
}
