import { timingSafeEqual } from 'node:crypto'

export const internalHeaders = (userId) => ({
    ...(process.env.INTERNAL_SERVICE_TOKEN ? { 'x-service-token': process.env.INTERNAL_SERVICE_TOKEN } : {}),
    ...(userId ? { 'x-user-id': String(userId) } : {})
})

export const requireInternalService = (req, res, next) => {
    const expected = process.env.INTERNAL_SERVICE_TOKEN
    if (!expected) {
        if (process.env.NODE_ENV === 'production') return res.status(503).json({ message: 'Service authentication is not configured' })
        return next()
    }
    const supplied = req.headers['x-service-token']
    if (typeof supplied !== 'string') return res.status(401).json({ message: 'Unauthorized service' })
    const left = Buffer.from(supplied)
    const right = Buffer.from(expected)
    if (left.length !== right.length || !timingSafeEqual(left, right)) return res.status(401).json({ message: 'Unauthorized service' })
    next()
}

export const validateProductionConfig = () => {
    if (process.env.NODE_ENV === 'production' && (process.env.INTERNAL_SERVICE_TOKEN?.length || 0) < 32) {
        throw new Error('Production requires INTERNAL_SERVICE_TOKEN of at least 32 characters')
    }
}
