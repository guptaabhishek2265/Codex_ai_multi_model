import test from 'node:test'
import assert from 'node:assert/strict'
import { wantsImages, shouldIllustrate, normalizeSearchImages, isPublicIPv4, imageType } from './imageSearch.js'

test('requests illustrations in Chat mode without matching ordinary questions', () => {
    assert.equal(wantsImages('explain earth with images'), true)
    assert.equal(wantsImages('show me pictures of Earth'), true)
    assert.equal(wantsImages('explain image compression'), false)
    assert.equal(wantsImages('explain earth without images'), false)
})

test('accepts Tavily strings and image objects and removes invalid or duplicate URLs', () => {
    const images = normalizeSearchImages(['https://example.com/a.png', { url: 'https://example.com/b.jpg', description: 'Earth' },
        'https://example.com/a.png', {url: 'javascript:alert(1)'}, null])
    assert.equal(images.length, 2)
    assert.equal(images[1].description, 'Earth')
    assert.equal(normalizeSearchImages(undefined).length, 0)
})

test('illustrates educational questions by default without explicit image wording', () => {
    for (const prompt of ['what is ecosystem', 'What is an ecosystem?', 'explain ecosystem',
        'How does photosynthesis work?', 'tell me about the solar system', 'Can you explain image compression?', 'Why do day and night occur?']) {
        assert.equal(shouldIllustrate(prompt), true, prompt)
    }
    for (const prompt of ['hello', 'what is my name', 'what is the time right now', 'what is 2 + 2',
        'explain ecosystem without images', 'explain ecosystem, text only']) {
        assert.equal(shouldIllustrate(prompt), false, prompt)
    }
})

test('rejects private download addresses and non-image payloads', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1']) {
        assert.equal(isPublicIPv4(address), false)
    }
    assert.equal(isPublicIPv4('8.8.8.8'), true)
    assert.throws(() => imageType(Buffer.from('<html>Error</html>')))
    assert.equal(imageType(Buffer.from([255,216,255,224])).mime, 'image/jpeg')
})
