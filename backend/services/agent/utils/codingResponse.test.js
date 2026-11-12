import test from 'node:test'
import assert from 'node:assert/strict'
import { getResponseText, parseProjectResponse, requireCompleteResponse } from './codingResponse.js'
import { localImagePath } from './localImages.js'

test('rejects token-truncated output before JSON parsing', () => {
    assert.throws(() => parseProjectResponse({ content: '{"files":[', response_metadata: { finish_reason: 'length' } }), /token limit/)
})

test('accepts complete fenced project JSON and text content blocks', () => {
    const project = { files: [{ name: 'script.js', content: 'console.log(1)' }] }
    assert.deepEqual(parseProjectResponse({ content: '```json\n' + JSON.stringify(project) + '\n```' }), project)
    assert.equal(getResponseText({ content: [{ type: 'text', text: 'hello' }] }), 'hello')
})

test('rejects malformed, empty, duplicate, and unsafe project files', () => {
    for (const content of ['{"files":[', '{"files":[]}', JSON.stringify({ files: [{ name: '../secret', content: 'x' }] }),
        JSON.stringify({ files: [{ name: 'a.js', content: 'x' }, { name: 'a.js', content: 'y' }] })]) {
        assert.throws(() => parseProjectResponse({ content }))
    }
    assert.doesNotThrow(() => requireCompleteResponse({ response_metadata: { finish_reason: 'stop' } }))
})

test('image paths isolate users and reject traversal', () => {
    const filename = '00000000-0000-4000-8000-000000000000.png'
    const first = localImagePath('aaaaaaaaaaaaaaaaaaaaaaaa', filename)
    const second = localImagePath('bbbbbbbbbbbbbbbbbbbbbbbb', filename)
    assert.notEqual(first, second)
    assert.throws(() => localImagePath('../other', filename))
    assert.throws(() => localImagePath('aaaaaaaaaaaaaaaaaaaaaaaa', '../secret.png'))
})
