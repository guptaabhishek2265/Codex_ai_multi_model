import { createHmac, timingSafeEqual } from 'node:crypto'
export const validSignature = (orderId, paymentId, signature, secret) => {
    if (![orderId, paymentId, signature, secret].every(value => typeof value === 'string' && value)) return false
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false
    const expected = createHmac('sha256', secret).update(orderId + '|' + paymentId).digest()
    const actual = Buffer.from(signature, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export const paymentMatchesOrder = (payment, order) =>
    payment.order_id === order.orderId && payment.amount === order.amount * 100 && payment.currency === order.currency