import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import connectDb from './config/db.js'
import router from './routes/auth.route.js'
import { addHealthRoutes, safeErrorHandler } from '../../shared/health.js'
import { requireInternalService, validateProductionConfig } from '../../shared/serviceAuth.js'
import redis from '../../shared/redis/redis.js'
import CreditGrant from './models/creditGrant.model.js'

validateProductionConfig()
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
addHealthRoutes(app, () => mongoose.connection.readyState === 1 && redis.status === 'ready')
app.use(requireInternalService)
app.use(express.json({ limit: '5mb' }))
app.use('/', router)
app.get('/', (_req, res) => res.json({ service: 'auth' }))
app.use(safeErrorHandler)
try {
    await connectDb()
    await CreditGrant.init()
    const server = app.listen(process.env.PORT || 8001, '0.0.0.0', () => console.log('auth listening'))
    process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref() })
} catch (error) {
    console.error('Startup failed: ' + error.name)
    process.exit(1)
}