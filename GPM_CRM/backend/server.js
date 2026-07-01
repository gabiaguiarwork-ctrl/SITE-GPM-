import express from 'express'
import cors from 'cors'
import { crmRouter } from './routes.js'
import { initDatabase } from './db.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/api', crmRouter)

const PORT = process.env.PORT || 4000

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CRM backend listening on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize database', error)
    process.exit(1)
  })
