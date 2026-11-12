import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import axios from 'axios'
import Payment from '../models/payment.model.js'
import { validSignature, paymentMatchesOrder } from '../utils/paymentVerification.js'

process.env.RAZORPAY_KEY_ID = 'rzp_test_unit'
process.env.RAZORPAY_KEY_SECRET = 'unit-test-secret'
const { default: razorpay } = await import('../config/razorpay.js')
const { verifyPayment } = await import('./billing.controller.js')

test('verification rejects tampered signatures and mismatched amounts', () => {
    assert.equal(validSignature('order_1', 'pay_1', 'bad', 'secret'), false)
    assert.equal(paymentMatchesOrder({ order_id: 'order_1', amount: 1, currency: 'INR' }, { orderId: 'order_1', amount: 199, currency: 'INR' }), false)
})

test('repeated verification grants credits only once and scopes the order to its owner', async () => {
    const original = { find: Payment.findOne, update: Payment.updateOne, fetch: razorpay.payments.fetch, post: axios.post }
    const order = { _id: 'test-order', orderId: 'order_1', userId: 'owner', plan: 'starter', amount: 199, currency: 'INR', status: 'created' }
    let grants = 0
    Payment.findOne = async query => { assert.deepEqual(query, { orderId: 'order_1', userId: 'owner' }); return order }
    Payment.updateOne = async (_query, update) => { Object.assign(order, update.$set) }
    razorpay.payments.fetch = async () => ({ order_id: 'order_1', id: 'pay_1', amount: 19900, currency: 'INR', status: 'captured' })
    axios.post = async (_url, body) => { grants++; assert.equal(body.orderId, 'order_1'); return { data: { success: true } } }
    const req = { headers: { 'x-user-id': 'owner' }, body: { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_1|pay_1').digest('hex') } }
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this }, json() { return this } }
    try {
        await verifyPayment(req, res)
        await verifyPayment(req, res)
        assert.equal(res.statusCode, 200)
        assert.equal(grants, 1)
        assert.equal(order.status, 'paid')
    } finally {
        Payment.findOne = original.find; Payment.updateOne = original.update
        razorpay.payments.fetch = original.fetch; axios.post = original.post
    }
})
