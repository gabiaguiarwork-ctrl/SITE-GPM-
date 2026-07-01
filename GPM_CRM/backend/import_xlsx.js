import XLSX from 'xlsx'
import fs from 'fs'
import { initDatabase, openDatabase } from './db.js'
import path from 'path'

function parseNumber(v){
  if(v === null || v === undefined) return null
  const s = String(v).replace(/[^0-9,.-]/g,'').replace(',','.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export async function importXlsx(filepath){
  if(!fs.existsSync(filepath)){
    throw new Error(`File not found: ${filepath}`)
  }

  const absPath = path.resolve(filepath)
  console.log('IMPORT_DIAG: spreadsheet_path', absPath)

  const workbook = XLSX.readFile(filepath)
  const sheetName = workbook.SheetNames[0]
  console.log('IMPORT_DIAG: sheet_name', sheetName)
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, {defval: ''})
  console.log('IMPORT_DIAG: rows_found', rows.length)
  const headers = rows.length ? Object.keys(rows[0]) : []
  console.log('IMPORT_DIAG: headers', JSON.stringify(headers))
  console.log('IMPORT_DIAG: first_5_rows', JSON.stringify(rows.slice(0,5)))

  const db = await initDatabase()
  const run = (sql, params) => new Promise((res, rej) => db.run(sql, params, function(err){ if(err) rej(err); else res(this) }))

  let imported = 0
  let processed = 0
  for(const r of rows){
    processed++
    // map known columns from RD export
    const created_at = r['Data da Criação'] || r['Data'] || ''
    const opportunity_name = r['Nome'] || r['Nome da Oportunidade'] || ''
    const client = r['Empresa'] || r['Cliente'] || ''
    const funnel = r['Funil de vendas'] || ''
    const stage = r['Etapa'] || ''
    const value = parseNumber(r['Valor'] || r['Valor (R$)'] || r['Valor'])
    const temperature = r['Temperatura'] || ''
    const source = r['Fonte'] || ''
    const owner = r['Responsável'] || r['Owner'] || ''
    const products = r['Produtos'] || ''
    const licitations = r['Licitações'] || r['Licitações?'] || ''
    const bid_lot = r['Lote da Licitações'] || r['Lote'] || ''
    const contact_name = r['Contatos'] || r['Contato'] || ''
    const contact_role = r['Cargo'] || ''
    const email = r['Email'] || ''
    const phone = r['Telefone'] || ''

    const raw = JSON.stringify(r)

    // simple dedupe: if same client+opportunity+bid_lot exists, update; else insert
    const existing = await new Promise((res, rej) => db.get(`SELECT id FROM leads WHERE opportunity_name = ? AND client = ? AND bid_lot = ?`, [opportunity_name, client, bid_lot], (err,row)=> err?rej(err):res(row)))
    if(existing && existing.id){
      await run(`UPDATE leads SET created_at=?, funnel=?, stage=?, value=?, temperature=?, source=?, owner=?, products=?, licitations=?, bid_lot=?, contact_name=?, contact_role=?, email=?, phone=?, raw_data=?, created_at_import=datetime('now') WHERE id=?`, [created_at, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw, existing.id])
    } else {
      await run(`INSERT INTO leads (created_at, opportunity_name, client, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [created_at, opportunity_name, client, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw])
      imported++
    }
  }

  const dbPath = path.resolve('./data/crm.db')
  console.log('IMPORT_DIAG: db_path', dbPath)

  // write import record
  // note: original implementation may not have imports table; wrap in try
  try{
    const db = await openDatabase()
    const runDb = (sql, params) => new Promise((res, rej) => db.run(sql, params, function(err){ if(err) rej(err); else res(this) }))
    await runDb('INSERT INTO imports (filename, uploaded_by, rows_total, rows_inserted, rows_updated, summary) VALUES (?, ?, ?, ?, ?, ?)', [filepath, null, processed, imported, 0, JSON.stringify({rows_total: processed, inserted: imported, updated: 0}, null, 2)])
    db.close()
    console.log('IMPORT_DIAG: import_record_written')
  }catch(err){
    console.log('IMPORT_DIAG: imports_table_error', err && err.message)
  }

  console.log('IMPORT_DIAG: processed', processed)
  console.log('IMPORT_DIAG: inserted', imported)
  return { imported }
}

export default { importXlsx }
