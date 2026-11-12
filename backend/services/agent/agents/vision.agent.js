import { getModel } from '../config/llmModels.js'
import axios from 'axios'
import { uploadToS3 } from '../utils/uploadToS3.js'
import { getFromS3 } from '../utils/getFromS3.js'
import { deductCredits } from '../utils/deductCredits.js'
import { checkAgentLimit } from '../config/agentLimit.js'
import { checkS3Configuration } from '../config/s3.js'
import { randomUUID } from 'node:crypto'

export const visionAgent = async (state) => {
    try {
        if (!process.env.POLLINATIONS_API_KEY?.trim()) {
            return { ...state, aiResponse: 'Image generation needs a Pollinations secret API key. Add POLLINATIONS_API_KEY to backend/services/agent/.env, then restart the agent. Chat and coding can still be used.', images: [] }
        }
        await checkS3Configuration()
        await checkAgentLimit(state.userId, 'image')
        const model = await getModel('image')
        const response = await model.invoke(`Write a concise image-generation prompt, at most 100 words, for: ${state.prompt}. Preserve the requested style. Return only the prompt.`)
        const prompt = response.content.trim()
        const image = await axios.get(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`, {
            headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}` },
            params: { model: process.env.POLLINATIONS_IMAGE_MODEL || 'flux', width: 768, height: 768 },
            responseType: 'arraybuffer', timeout: 120000, maxContentLength: 20 * 1024 * 1024
        })
        const contentType = image.headers['content-type']?.split(';')[0].toLowerCase()
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[contentType]
        if (!extension) throw new Error('Provider did not return a supported image')
        const filename = `${randomUUID()}.${extension}`
        const buffer = Buffer.from(image.data)
        await uploadToS3(filename, buffer, contentType)
        const downloadUrl = await getFromS3(filename, 86400)
        await deductCredits(state.userId, 'vision')
        return { ...state, aiResponse: `Image generated.\n\n[Download image](${downloadUrl})\n\nDownload link expires in 24 hours.`, images: [downloadUrl] }
    } catch (error) {
        const status = error.response?.status
        console.warn(`Image generation failed: ${error.code || error.name} (${status || 'unknown'})`)
        const message = (error.code === 'S3_CONFIGURATION' ? error.message : null) || error.data?.message || ({
            401: 'The image provider rejected the API key. Check POLLINATIONS_API_KEY.',
            402: 'The image provider reports an exhausted account or key budget.',
            403: 'Your image API key does not have permission to use this model.',
            429: 'The image provider is busy or rate-limited. Please retry later.',
            503: 'The image provider is temporarily unavailable. Please retry later.'
        }[status]) || (error.code === 'ECONNABORTED'
            ? 'Image generation timed out. Please retry later.'
            : 'The image could not be generated or saved. Please check the agent service configuration and retry.')
        return { ...state, aiResponse: message, images: [] }
    }
}
