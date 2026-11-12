import mongoose from 'mongoose'
import Conversation from '../models/coversation.model.js'
import Message from '../models/message.model.js'

const ownConversation = async (id, userId) => {
    if (!mongoose.isValidObjectId(id) || !userId) return null
    return Conversation.findOne({ _id: id, userId })
}
const failure = res => res.status(503).json({ message: 'Conversation service unavailable' })

export const createConversation = async (req, res) => {
    if (!req.headers['x-user-id']) return res.status(401).json({ message: 'Login required' })
    try { return res.json(await Conversation.create({ userId: req.headers['x-user-id'] })) }
    catch { return failure(res) }
}
export const getConversations = async (req, res) => {
    if (!req.headers['x-user-id']) return res.status(401).json({ message: 'Login required' })
    try { return res.json(await Conversation.find({ userId: req.headers['x-user-id'] }).sort({ updatedAt: -1 })) }
    catch { return failure(res) }
}
export const updateConversation = async (req, res) => {
    try {
        if (!await ownConversation(req.body.id, req.headers['x-user-id'])) return res.status(404).json({ message: 'Conversation not found' })
        if (typeof req.body.title !== 'string' || !req.body.title.trim()) return res.status(400).json({ message: 'Title required' })
        const conversation = await Conversation.findOneAndUpdate({ _id: req.body.id, userId: req.headers['x-user-id'] }, { title: req.body.title.trim().slice(0, 120) }, { new: true })
        return res.json(conversation)
    } catch { return failure(res) }
}
export const saveMessage = async (req, res) => {
    try {
        const { conversationId, role, content, images, artifacts } = req.body
        if (!await ownConversation(conversationId, req.headers['x-user-id'])) return res.status(404).json({ message: 'Conversation not found' })
        const message = await Message.create({ conversationId, role, content, images, artifacts })
        await Conversation.updateOne({ _id: conversationId }, { $set: { updatedAt: new Date() } })
        return res.json(message)
    } catch { return failure(res) }
}
export const getMessages = async (req, res) => {
    try {
        if (!await ownConversation(req.params.conversationId, req.headers['x-user-id'])) return res.status(404).json({ message: 'Conversation not found' })
        return res.json(await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 }))
    } catch { return failure(res) }
}