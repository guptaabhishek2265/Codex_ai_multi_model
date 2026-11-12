import { readFile } from 'node:fs/promises'
import { PDFParse } from 'pdf-parse'

export const needsPdfVision = (text, pages) => text.replace(/\s/g, '').length < Math.max(300, pages * 150)

export const readPdfText = async (filename) => {
    const buffer = await readFile(filename)
    const parser = new PDFParse({ data: buffer })
    try {
        const result = await parser.getText()
        return { text: result.text?.trim() || '', pages: result.total || result.pages?.length || 0 }
    } finally {
        await parser.destroy()
    }
}

// Include coverage across a long document if vector retrieval is unavailable.
export const samplePdfText = (text, limit = 40000) => {
    if (text.length <= limit) return text
    const size = Math.floor(limit / 8)
    return Array.from({ length: 8 }, (_, index) => {
        const start = Math.floor(index * (text.length - size) / 7)
        return text.slice(start, start + size)
    }).join('\n\n[... document excerpt gap ...]\n\n')
}
