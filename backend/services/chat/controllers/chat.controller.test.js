import test from 'node:test'
import assert from 'node:assert/strict'
import Conversation from '../models/coversation.model.js'
import Message from '../models/message.model.js'
import { getMessages, updateConversation, saveMessage } from './chat.controller.js'

test('foreign conversations cannot be read, renamed, or written', async () => {
    const original = Conversation.findOne
    const originalRead = Message.find
    const originalWrite = Message.create
    let checked = 0
    Conversation.findOne = async query => { checked++; assert.equal(query.userId, 'owner-b'); return null }
    Message.find = () => assert.fail('Messages must not be read')
    Message.create = () => assert.fail('Messages must not be written')
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaa'
    const req = { headers: { 'x-user-id': 'owner-b' }, params: { conversationId: id }, body: { id, conversationId: id, title: 'stolen', role: 'user', content: 'x' } }
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this }, json() { return this } }
    try {
        for (const handler of [getMessages, updateConversation, saveMessage]) {
            await handler(req, res)
            assert.equal(res.statusCode, 404)
        }
        assert.equal(checked, 3)
    } finally { Conversation.findOne = original; Message.find = originalRead; Message.create = originalWrite }
})
