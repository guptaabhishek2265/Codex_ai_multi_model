import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import connectDb from './config/db.js'
import router from './routes/billing.route.js'
import { addHealthRoutes, safeErrorHandler } from '../../shared/health.js'
import { requireInternalService, validateProductionConfig } from '../../shared/serviceAuth.js'


validateProductionConfig()
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
addHealthRoutes(app, () => mongoose.connection.readyState === 1)
app.use(requireInternalService)
app.use(express.json({ limit: '5mb' }))
app.use('/', router)
app.get('/', (_req, res) => res.json({ service: 'billing' }))
app.use(safeErrorHandler)
try {
    await connectDb()

    const server = app.listen(process.env.PORT || 8004, '0.0.0.0', () => console.log('billing listening'))
    process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref() })
} catch (error) {
    console.error('Startup failed: ' + error.name)
    process.exit(1)
}
