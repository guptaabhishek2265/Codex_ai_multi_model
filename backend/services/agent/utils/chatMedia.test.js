import test from 'node:test'
import assert from 'node:assert/strict'
import { bindChatImages, hasInlineImages } from './chatMedia.js'

test('replaces fabricated signed image links with actual application uploads', () => {
    const fake = 'https://example.s3.amazonaws.com/fake.png?X-Amz-Signature=invented'
    const real = 'https://example.s3.amazonaws.com/search-images/real.png?X-Amz-Signature=verified'
    const result = bindChatImages('Diagram: ![Energy flow](' + fake + ')', [real])
    assert.ok(result.includes(real))
    assert.ok(!result.includes(fake))
})

test('removes unverified historical images and preserves ordinary links and code examples', () => {
    const result = bindChatImages('![old](https://example.com/old.png) [Source](https://example.com)')
    assert.equal(result.trim(), '[Source](https://example.com)')
    const code = '```markdown\n![example](https://example.com/image.png)\n```'
    assert.equal(bindChatImages(code), code)
    assert.equal(hasInlineImages(code), false)
    assert.equal(hasInlineImages('![diagram](https://example.com/image.png)'), true)
})

test('never emits more image links than available verified uploads', () => {
    const result = bindChatImages('![a](https://example.com/a) ![b](https://example.com/b)', ['https://bucket.example/real.png'])
    assert.equal((result.match(/!\[/g) || []).length, 1)
    assert.ok(!result.includes('example.com'))
})
