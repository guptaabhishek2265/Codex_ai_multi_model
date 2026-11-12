import { getAuth } from 'firebase-admin/auth'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { app } from '../config/firebase.js'
import User from '../models/user.model.js'
import CreditGrant from '../models/creditGrant.model.js'
import redis from '../../../shared/redis/redis.js'
import { PLANS } from '../../../shared/plans.js'
import { CREDIT_COST } from '../../../shared/credits.js'
import { readCookie, sessionCookieOptions } from '../../../shared/cookies.js'

const userSession = user => ({
    userId: user._id, name: user.name, email: user.email, avatar: user.avatar,
    plan: user.plan, credits: user.credits, totalCredits: user.totalCredits, planExpiresAt: user.planExpiresAt
})

const refreshSessions = async user => {
    const ids = new Set(await redis.smembers('user-sessions-' + user._id))
    const latest = await redis.get('user-session-' + user._id)
    if (latest) ids.add(latest)
    for (const id of ids) {
        const ttl = await redis.ttl('session-' + id)
        if (ttl > 0) await redis.set('session-' + id, JSON.stringify(userSession(user)), 'EX', ttl)
        else await redis.srem('user-sessions-' + user._id, id)
    }
}

export const login = async (req, res) => {
    try {
        if (typeof req.body.token !== 'string' || !req.body.token) return res.status(400).json({ message: 'Login token required' })
        const decoded = await getAuth(app).verifyIdToken(req.body.token)
        let user = await User.findOne({ firebaseUid: decoded.uid })
        if (!user) user = await User.create({ firebaseUid: decoded.uid, name: decoded.name, email: decoded.email, avatar: decoded.picture })
        const id = randomUUID()
        const ttl = 7 * 24 * 60 * 60
        await redis.set('session-' + id, JSON.stringify(userSession(user)), 'EX', ttl)
        await redis.set('user-session-' + user._id, id, 'EX', ttl)
        await redis.sadd('user-sessions-' + user._id, id)
        await redis.expire('user-sessions-' + user._id, ttl)
        res.cookie('session', id, sessionCookieOptions())
        return res.json(user)
    } catch (error) {
        console.error('Login failed: ' + error.name)
        return res.status(401).json({ message: 'Could not complete login. Please retry.' })
    }
}

export const logOut = async (req, res) => {
    try {
        const id = readCookie(req.headers.cookie, 'session')
        if (id) {
            const session = await redis.get('session-' + id)
            await redis.del('session-' + id)
            if (session) await redis.srem('user-sessions-' + JSON.parse(session).userId, id)
        }
        const { maxAge, ...options } = sessionCookieOptions()
        res.clearCookie('session', options)
        return res.json({ message: 'Logged out' })
    } catch { return res.status(503).json({ message: 'Logout service unavailable' }) }
}

export const updateUserPayment = async (req, res) => {
    const { plan, userId, orderId } = req.body
    if (!PLANS[plan]?.amount || !mongoose.isValidObjectId(userId) || typeof orderId !== 'string' || !orderId.startsWith('order_')) {
        return res.status(400).json({ message: 'Invalid credit grant' })
    }
    const session = await mongoose.startSession()
    try {
        await session.withTransaction(async () => {
            const existing = await CreditGrant.findOne({ orderId }).session(session)
            if (existing) {
                if (existing.userId !== userId || existing.plan !== plan) throw new Error('Grant mismatch')
                return
            }
            await CreditGrant.create([{ orderId, userId, plan }], { session })
            const updated = await User.findByIdAndUpdate(userId, {
                $inc: { credits: PLANS[plan].credits, totalCredits: PLANS[plan].credits },
                $set: { plan, planExpiresAt: new Date(Date.now() + PLANS[plan].validity * 86400000) }
            }, { new: true, session })
            if (!updated) throw new Error('User missing')
        })
        const user = await User.findById(userId)
        await refreshSessions(user)
        return res.json({ success: true, credits: user.credits })
    } catch (error) {
        // A concurrent retry may lose the unique order-ID race after the other transaction committed.
        if (error.code === 11000) {
            const grant = await CreditGrant.findOne({ orderId })
            if (grant?.userId === userId && grant.plan === plan) {
                const user = await User.findById(userId)
                await refreshSessions(user)
                return res.json({ success: true, credits: user.credits })
            }
        }
        console.error('Credit grant failed: ' + error.name)
        return res.status(503).json({ message: 'Credit update could not complete; retry verification.' })
    } finally { await session.endSession() }
}

export const checkCredits = async (req, res) => {
    const cost = CREDIT_COST[req.body.agent]
    if (!cost || !mongoose.isValidObjectId(req.body.userId)) return res.status(400).json({ message: 'Invalid credit request' })
    try {
        const user = await User.findById(req.body.userId)
        if (!user) return res.status(404).json({ message: 'User not found' })
        if (user.credits < cost) return res.status(402).json({ message: 'Not enough credits.' })
        return res.json({ success: true, credits: user.credits })
    } catch { return res.status(503).json({ message: 'Credit service unavailable' }) }
}

export const deductCredits = async (req, res) => {
    const cost = CREDIT_COST[req.body.agent]
    if (!cost || !mongoose.isValidObjectId(req.body.userId)) return res.status(400).json({ message: 'Invalid credit request' })
    try {
        const user = await User.findOneAndUpdate({ _id: req.body.userId, credits: { $gte: cost } }, { $inc: { credits: -cost } }, { new: true })
        if (!user) return res.status(402).json({ message: 'Not enough credits.' })
        await refreshSessions(user)
        return res.json({ success: true, credits: user.credits })
    } catch { return res.status(503).json({ message: 'Credit service unavailable' }) }
}