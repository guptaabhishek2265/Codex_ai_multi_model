import axios from 'axios'
import { PLANS } from '../config/Plans.js'
import razorpay from '../config/razorpay.js'
import Payment from '../models/payment.model.js'
import { internalHeaders } from '../../../shared/serviceAuth.js'
import { validSignature, paymentMatchesOrder } from '../utils/paymentVerification.js'

export const createOrder = async (req, res) => {
    try {
        const selected = PLANS[req.body.plan]
        const userId = req.headers['x-user-id']
        if (!userId) return res.status(401).json({ message: 'Login required' })
        if (!selected?.amount) return res.status(400).json({ message: 'Choose a paid plan' })
        const order = await razorpay.orders.create({ amount: selected.amount * 100, currency: 'INR', receipt: 'receipt-' + Date.now() })
        await Payment.create({ userId, orderId: order.id, amount: selected.amount, credits: selected.credits, plan: selected.id, currency: order.currency, status: 'created' })
        return res.json({ order, plan: selected })
    } catch (error) {
        console.error('Create order failed: ' + error.name)
        return res.status(503).json({ message: 'Could not create checkout. Please retry.' })
    }
}

export const verifyPayment = async (req, res) => {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body
    if (!validSignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) return res.status(400).json({ message: 'Payment verification failed' })
    try {
        const order = await Payment.findOne({ orderId, userId: req.headers['x-user-id'] })
        if (!order) return res.status(404).json({ message: 'Order not found' })
        if (order.status === 'paid') {
            if (order.paymentId !== paymentId) return res.status(400).json({ message: 'Payment does not match order' })
            return res.json({ message: 'Payment already verified' })
        }
        let payment = await razorpay.payments.fetch(paymentId)
        if (!paymentMatchesOrder(payment, order)) return res.status(400).json({ message: 'Payment does not match order' })
        if (payment.status === 'authorized') {
            try { payment = await razorpay.payments.capture(paymentId, payment.amount, payment.currency) }
            catch { payment = await razorpay.payments.fetch(paymentId) }
        }
        if (payment.status !== 'captured') return res.status(409).json({ message: 'Payment is not captured yet. Retry verification shortly.' })
        // The auth service grants each Razorpay order only once using a unique ledger and MongoDB transaction.
        await axios.post(process.env.AUTH_SERVICE + '/update-plan', { userId: order.userId, plan: order.plan, orderId }, { headers: internalHeaders(), timeout: 15000 })
        await Payment.updateOne({ _id: order._id }, { $set: { status: 'paid', paymentId } })
        return res.json({ message: 'Payment verified' })
    } catch (error) {
        console.error('Verify payment failed: ' + error.name)
        return res.status(503).json({ message: 'Could not finish verification. Please retry; the same order cannot add credits twice.' })
    }
}