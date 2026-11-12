import mongoose from 'mongoose'
const schema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    plan: { type: String, required: true }
}, { timestamps: true })
export default mongoose.model('CreditGrant', schema)