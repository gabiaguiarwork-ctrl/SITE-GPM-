const sqlite3 = require('sqlite3').verbose();
const DB = './data/crm.db';
const db = new sqlite3.Database(DB, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('DB_OPEN_ERROR', err.message);
    process.exit(2);
  }
});

db.get("SELECT COUNT(*) as cnt FROM leads", (e, r) => {
  if (e) {
    console.error('COUNT_ERROR', e.message);
    db.close(() => process.exit(3));
    return;
  }
  console.log('LEADS_COUNT', r.cnt);
  db.get("SELECT filename, rows_total, rows_inserted, rows_updated FROM imports ORDER BY id DESC LIMIT 1", (ie, ir) => {
    if (ie) {
      console.log('NO_IMPORTS_TABLE_OR_ERROR', ie.message);
      db.close(() => process.exit(0));
      return;
    }
    console.log('LAST_IMPORT', JSON.stringify(ir));
    db.get("PRAGMA database_list;", (pe, pr) => {
      if (!pe) console.log('DB_LIST', JSON.stringify(pr));
      db.close(() => process.exit(0));
    });
  });
});
