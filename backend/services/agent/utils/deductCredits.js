import axios from 'axios'
import { internalHeaders } from '../../../shared/serviceAuth.js'
export const deductCredits = async (userId, agent) => {
    try {
        const { data } = await axios.post(process.env.AUTH_SERVICE + '/deduct-credits', { userId, agent }, { headers: internalHeaders(), timeout: 10000 })
        return data
    } catch (cause) {
        const error = new Error('Credit deduction failed')
        error.data = { message: cause.response?.data?.message || 'Credit service unavailable. Please retry.' }
        error.status = cause.response?.status || 503
        throw error
    }
}