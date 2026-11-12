import axios from 'axios'
import { internalHeaders } from '../../../shared/serviceAuth.js'
export const getMessages = async (conversationId, userId) => {
    const { data } = await axios.get(process.env.CHAT_SERVICE + '/get-messages/' + encodeURIComponent(conversationId), {
        headers: internalHeaders(userId), timeout: 15000
    })
    return data
}