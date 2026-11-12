import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentRoute } from './attachmentRoute.js'
import { needsPdfVision, samplePdfText } from './pdfText.js'

test('uploaded PDFs override every manual agent selection', () => {
    for (const agent of ['chat', 'auto', 'pdf', 'coding', 'search', 'vision', 'ppt']) {
        assert.equal(attachmentRoute({ agent, file: { mimetype: 'application/pdf' } }), 'pdfRag')
    }
    assert.equal(attachmentRoute({ agent: 'chat', file: { mimetype: 'image/png' } }), 'imageAnalyzer')
    assert.equal(attachmentRoute({ agent: 'coding' }), 'coding')
    assert.equal(attachmentRoute({ agent: 'auto' }), null)
})

test('scanned or sparse PDFs require visual analysis', () => {
    assert.equal(needsPdfVision('Sparse form text', 1), true)
    assert.equal(needsPdfVision('', 1), true)
    assert.equal(needsPdfVision('Document text. '.repeat(500), 2), false)
})

test('long-document fallback covers the beginning and ending', () => {
    const text = 'BEGIN' + 'x'.repeat(100000) + 'END'
    const excerpts = samplePdfText(text)
    assert.ok(excerpts.startsWith('BEGIN'))
    assert.ok(excerpts.endsWith('END'))
    assert.ok(excerpts.length < 41000)
    assert.equal(samplePdfText('short PDF'), 'short PDF')
})
