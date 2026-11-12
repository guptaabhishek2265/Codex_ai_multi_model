import { GoogleGenerativeAI } from '@google/generative-ai'

export const analyzePdfVisually = async (buffer, instructions, question) => {
    try {
        if (!process.env.GOOGLE_API_KEY?.trim()) throw new Error('MissingGoogleKey')
        const client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
        const model = client.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: instructions })
        const result = await model.generateContent([
            { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
            { text: question }
        ], { timeout: 60000 })
        return result.response.text()
    } catch (cause) {
        const error = new Error('PDF document vision unavailable')
        error.code = 'PDF_VISION_UNAVAILABLE'
        error.status = cause.status
        throw error
    }
}
