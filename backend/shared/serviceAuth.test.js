import test from 'node:test'
import assert from 'node:assert/strict'
import { internalHeaders, requireInternalService, validateProductionConfig } from './serviceAuth.js'
import { readCookie, sessionCookieOptions } from './cookies.js'

test('production rejects missing or forged internal service credentials', () => {
    const previous = { node: process.env.NODE_ENV, token: process.env.INTERNAL_SERVICE_TOKEN }
    try {
        process.env.NODE_ENV = 'production'
        delete process.env.INTERNAL_SERVICE_TOKEN
        assert.throws(validateProductionConfig)
        let status
        const res = { status(value) { status = value; return this }, json() {} }
        requireInternalService({ headers: {} }, res, () => assert.fail('Must reject missing configuration'))
        assert.equal(status, 503)
        process.env.INTERNAL_SERVICE_TOKEN = 'a'.repeat(64)
        requireInternalService({ headers: { 'x-service-token': 'forged' } }, res, () => assert.fail('Must reject forgery'))
        assert.equal(status, 401)
        let passed = false
        requireInternalService({ headers: internalHeaders('user-id') }, res, () => { passed = true })
        assert.equal(passed, true)
        assert.equal(internalHeaders('user-id')['x-user-id'], 'user-id')
        assert.equal(sessionCookieOptions().secure, true)
        assert.equal(readCookie('other=x; session=abc-123; third=y', 'session'), 'abc-123')
        assert.equal(readCookie('session=%broken', 'session'), undefined)
    } finally {
        if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node
        if (previous.token === undefined) delete process.env.INTERNAL_SERVICE_TOKEN; else process.env.INTERNAL_SERVICE_TOKEN = previous.token
    }
})
