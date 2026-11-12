import "dotenv/config"
import express from "express"
import dotenv from "dotenv"
dotenv.config()
import cors from "cors"
import cookieParser from "cookie-parser"
import { getCurrentUser } from "./controllers/user.controller.js"
import protect from "./middleware/auth.middleware.js"
import { proxyWithHeader } from "./utils/proxyWithHeader.js"
import morgan from "morgan"
import redis from "../shared/redis/redis.js"
import { addHealthRoutes, safeErrorHandler } from "../shared/health.js"
import { validateProductionConfig } from "../shared/serviceAuth.js"
const port =process.env.PORT

const app=express()
validateProductionConfig()
app.disable('x-powered-by')
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 2 : 1)
addHealthRoutes(app, () => redis.status === 'ready')
app.use(cors({
    origin:process.env.FRONTEND_URL,
    credentials:true
}))
app.use(morgan("dev"))
app.use(cookieParser())
app.use('/api/auth', (req, res, next) => {
    if (!['/login', '/logout'].includes(req.path)) return res.status(404).json({ message: 'Not found' })
    next()
}, proxyWithHeader(process.env.AUTH_SERVICE))
// Messages are written only by the authenticated agent service.
app.use('/api/chat/save-message', (_req, res) => res.status(404).json({ message: 'Not found' }))
app.use("/api/chat",protect,proxyWithHeader(process.env.CHAT_SERVICE))
app.use("/api/agent",protect,proxyWithHeader(process.env.AGENT_SERVICE))
app.use("/api/billing",protect,proxyWithHeader(process.env.BILLING_SERVICE))
app.get("/api/me",protect,getCurrentUser)
app.get("/",(req,res)=>{
    res.json({message:"hello from gateway v5"})
})
app.use(safeErrorHandler)

app.listen(port,()=>{
    console.log(`gateway started at ${port}`)
})
