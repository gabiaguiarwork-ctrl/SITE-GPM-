import sqlite3
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent / 'data'
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / 'crm.db'


def get_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute('''
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      display_name TEXT,
      email TEXT,
      role TEXT
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT,
      opportunity_name TEXT,
      client TEXT,
      funnel TEXT,
      stage TEXT,
      value REAL,
      temperature TEXT,
      source TEXT,
      owner TEXT,
      products TEXT,
      licitations TEXT,
      bid_lot TEXT,
      contact_name TEXT,
      contact_role TEXT,
      email TEXT,
      phone TEXT,
      raw_data TEXT,
      created_at_import TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      author_id INTEGER,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      author_id INTEGER,
      remind_at TEXT,
      note TEXT,
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
    ''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      uploaded_by INTEGER,
      imported_at TEXT DEFAULT (datetime('now')),
      rows_total INTEGER,
      rows_inserted INTEGER,
      rows_updated INTEGER,
      summary TEXT
    )
    ''')

    # indexes
    cur.execute('CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_leads_funnel ON leads(funnel)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client)')

    conn.commit()
    conn.close()


if __name__ == '__main__':
    init_db()
    print('Initialized DB at', DB_PATH)
