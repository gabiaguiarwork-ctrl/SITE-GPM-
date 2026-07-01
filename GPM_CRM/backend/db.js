import sqlite3 from 'sqlite3'
import { promisify } from 'util'

const DB_PATH = new URL('./data/crm.db', import.meta.url).pathname

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) reject(err)
      else resolve(db)
    })
  })
}

export async function initDatabase() {
  const db = await openDatabase()
  const run = promisify(db.run.bind(db))

  // Leads table
  await run(`
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
      created_at_import TEXT DEFAULT (datetime('now'))
    )
  `)

  // Activities (history/logs)
  await run(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      note TEXT,
      author TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `)

  // Reminders
  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      remind_at TEXT,
      note TEXT,
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
    )
  `)

  // Indexes for quicker queries
  await run(`CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads(temperature)`)
  await run(`CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client)`)

  return db
}
