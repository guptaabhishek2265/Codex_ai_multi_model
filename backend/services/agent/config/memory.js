import redis from '../../../shared/redis/redis.js'
import { getMessages } from '../utils/getMessages.js'
export const getMemory = async (conversationId, userId) => {
    const key = 'messages-' + conversationId
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached)
    const messages = await getMessages(conversationId, userId)
    const history = messages.slice(-20)
    await redis.set(key, JSON.stringify(history), 'EX', 86400)
    return history
}
export const addMessage = async (conversationId, role, content) => {
    const key = 'messages-' + conversationId
    const raw = await redis.get(key)
    const messages = raw ? JSON.parse(raw) : []
    messages.push({ role, content })
    await redis.set(key, JSON.stringify(messages.slice(-20)), 'EX', 86400)
}