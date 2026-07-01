import express from 'express'
import { openDatabase } from './db.js'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

const UNITS = [
  'MDO E TECNOLOGIA',
  'MOVIMENTAÇÃO DE CARGA',
  'TECNOLOGIA EM OP. INDUSTRIAIS',
  'TROPHEUS'
]

const STAGES = [
  'LEAD GERADO',
  'QUALIFICADO',
  'ANÁLISE TÉCNICA',
  'PESQUISA DE PREÇOS',
  'PROPOSTA ENVIADA',
  'NEGOCIAÇÃO',
  'KICK-OFF INTERNO'
]

router.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

router.get('/units', (req, res) => {
  res.json({ units: UNITS })
})

router.get('/stages', (req, res) => {
  res.json({ stages: STAGES })
})

router.get('/columns', (req, res) => {
  res.json({
    columns: [
      'Data da Criação',
      'Nome',
      'Empresa',
      'Funil de vendas',
      'Etapa',
      'Valor',
      'Temperatura',
      'Fonte',
      'Responsável',
      'Produtos',
      'Licitações',
      'Lote da Licitações',
      'Contatos',
      'Cargo',
      'Email',
      'Telefone'
    ]
  })
})

// List leads with optional filters
router.get('/leads', async (req, res, next) => {
  try {
    const { funnel, stage, temperature, owner, q, limit = 500, offset = 0 } = req.query
    const db = await openDatabase()
    const all = promisify(db.all.bind(db))
    const conditions = []
    const params = []

    if (funnel) {
      conditions.push('lower(funnel) = ?')
      params.push(funnel.toLowerCase())
    }
    if (stage) {
      conditions.push('lower(stage) = ?')
      params.push(stage.toLowerCase())
    }
    if (temperature) {
      conditions.push('lower(temperature) = ?')
      params.push(temperature.toLowerCase())
    }
    if (owner) {
      conditions.push('lower(owner) = ?')
      params.push(owner.toLowerCase())
    }
    if (q) {
      const term = `%${q.toLowerCase()}%`
      conditions.push('(lower(opportunity_name) LIKE ? OR lower(client) LIKE ? OR lower(contact_name) LIKE ? OR lower(source) LIKE ? OR lower(owner) LIKE ?)')
      params.push(term, term, term, term, term)
    }

    let query = 'SELECT * FROM leads'
    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ')
    }
    query += ' ORDER BY created_at_import DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const rows = await all(query, params)
    res.json(rows)
  } catch (error) {
    next(error)
  }
})

router.get('/leads/:id', async (req, res, next) => {
  try {
    const db = await openDatabase()
    const get = promisify(db.get.bind(db))
    const row = await get('SELECT * FROM leads WHERE id = ?', [req.params.id])
    if (!row) {
      return res.status(404).json({ error: 'Lead not found' })
    }
    res.json(row)
  } catch (error) {
    next(error)
  }
})

router.put('/leads/:id', async (req, res, next) => {
  try {
    const { stage } = req.body || {}
    if (!stage) {
      return res.status(400).json({ error: 'Stage is required' })
    }
    const db = await openDatabase()
    const run = promisify(db.run.bind(db))
    const get = promisify(db.get.bind(db))

    await run('UPDATE leads SET stage = ? WHERE id = ?', [stage, req.params.id])
    const row = await get('SELECT * FROM leads WHERE id = ?', [req.params.id])
    res.json(row)
  } catch (error) {
    next(error)
  }
})

// Import endpoint - triggers reading the source xlsx and importing rows
router.post('/import', async (req, res, next) => {
  try {
    const { importFile } = req.body || {}
    const importPath = importFile || path.resolve(__dirname, '../../CRM/FUNIL_MDO_corrigido.xlsx')
    const { importXlsx } = await import('./import_xlsx.js')
    const result = await importXlsx(importPath)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// KPIs for dashboard and per-unit funnel view
router.get('/kpis', async (req, res, next) => {
  try {
    const { unit } = req.query
    const db = await openDatabase()
    const get = promisify(db.get.bind(db))
    const all = promisify(db.all.bind(db))

    const globalPipeline = await get('SELECT SUM(value) as total FROM leads WHERE value IS NOT NULL', [])
    const temps = await all('SELECT temperature, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY temperature', [])
    const byUnit = await all('SELECT funnel as unit, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY funnel', [])
    const byStage = await all('SELECT stage, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY stage', [])
    const topOpportunities = await all('SELECT id, opportunity_name, client, funnel, stage, value, temperature, owner FROM leads ORDER BY value DESC LIMIT 10', [])

    const globalQuente = await get('SELECT COUNT(*) as count FROM leads WHERE lower(temperature) = ?', ['quente'])
    const globalMorno = await get('SELECT COUNT(*) as count FROM leads WHERE lower(temperature) = ?', ['morno'])
    const globalFrio = await get('SELECT COUNT(*) as count FROM leads WHERE lower(temperature) = ?', ['frio'])

    const response = {
      pipeline_total: globalPipeline.total || 0,
      by_temperature: temps,
      by_unit: byUnit,
      by_stage: byStage,
      top_opportunities: topOpportunities,
      deals_quentes: globalQuente.count || 0,
      deals_mornos: globalMorno.count || 0,
      deals_frios: globalFrio.count || 0
    }

    if (unit) {
      const unitTotal = await get('SELECT SUM(value) as total FROM leads WHERE funnel = ?', [unit])
      const quente = await get('SELECT COUNT(*) as count FROM leads WHERE funnel = ? AND lower(temperature) = ?', [unit, 'quente'])
      const morno = await get('SELECT COUNT(*) as count FROM leads WHERE funnel = ? AND lower(temperature) = ?', [unit, 'morno'])
      const frio = await get('SELECT COUNT(*) as count FROM leads WHERE funnel = ? AND lower(temperature) = ?', [unit, 'frio'])
      const largest = await get('SELECT id, opportunity_name, client, value, stage, temperature, owner FROM leads WHERE funnel = ? ORDER BY value DESC LIMIT 1', [unit])
      const stageBreakdown = await all('SELECT stage, COUNT(*) as qty, SUM(value) as total FROM leads WHERE funnel = ? GROUP BY stage', [unit])

      response.unit = unit
      response.pipeline_total = unitTotal.total || 0
      response.deals_quentes = quente.count || 0
      response.deals_mornos = morno.count || 0
      response.deals_frios = frio.count || 0
      response.largest_opportunity = largest || null
      response.by_stage = stageBreakdown
      response.top_opportunities = await all('SELECT id, opportunity_name, client, funnel, stage, value, temperature, owner FROM leads WHERE funnel = ? ORDER BY value DESC LIMIT 10', [unit])
    }

    res.json(response)
  } catch (error) {
    next(error)
  }
})

export { router as crmRouter }
