import axios from 'axios'
import { rm } from 'node:fs/promises'
import { graph } from '../graph/graph.js'
import { addMessage } from '../config/memory.js'
import { internalHeaders } from '../../../shared/serviceAuth.js'

export const agent = async (req, res, next) => {
    const file = req.file
    try {
        const { prompt, conversationId, agent, timeZone } = req.body
        const userId = req.headers['x-user-id']
        if ((!prompt?.trim() && !file) || !conversationId || !userId) return res.status(400).json({ message: 'A prompt or attachment, conversation, and login are required' })
        const options = { headers: internalHeaders(userId), timeout: 15000 }
        // Check ownership before using cached memory, attachments, or AI providers.
        await axios.get(process.env.CHAT_SERVICE + '/get-messages/' + encodeURIComponent(conversationId), options)
        await axios.post(process.env.AUTH_SERVICE + '/check-credits', { userId, agent: 'chat' }, options)
        await axios.post(process.env.CHAT_SERVICE + '/save-message', { conversationId, role: 'user', content: prompt || 'Analyze the attached file' }, options)
        const result = await graph.invoke({ prompt: prompt || 'Analyze the attached file', conversationId, agent, userId, file, timeZone })
        await addMessage(conversationId, 'user', prompt || 'Analyze the attached file')
        await addMessage(conversationId, 'assistant', result.aiResponse)
        await axios.post(process.env.CHAT_SERVICE + '/save-message', {
            conversationId, role: 'assistant', content: result.aiResponse, images: result.images, artifacts: result.artifacts
        }, options)
        return res.json({ answer: result.aiResponse, images: result.images, artifacts: result.artifacts })
    } catch (error) {
        const status = error.response?.status
        if ([400, 401, 402, 404, 429].includes(status)) return res.status(status).json({ message: error.response.data?.message || 'Request rejected' })
        next(error)
    } finally {
        if (file?.path) {
            try { await rm(file.path, { force: true }) } catch { console.warn('Upload cleanup failed') }
        }
    }
}