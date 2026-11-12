export const wantsImages = (prompt = '') => {
    if (/\b(?:without|no)\s+(?:images?|pictures?|photos?|diagrams?)\b/i.test(prompt)) return false
    return /\b(?:with|include|including|add|show|display|give|need|want|using)\b[\s\S]{0,60}\b(?:images?|pictures?|photos?|diagrams?|illustrations?)\b/i.test(prompt)
}

export const shouldIllustrate = (prompt = '') => {
    if (/\b(?:without|no)\s+(?:images?|pictures?|photos?|diagrams?)\b|\b(?:text|words?)\s+only\b/i.test(prompt)) return false
    if (wantsImages(prompt)) return true
    // Personal/account questions, clock readings and arithmetic do not benefit from web pictures.
    if (/\b(?:my|your|our)\s+(?:name|age|email|password|account|credits?|plan|address)\b|\b(?:calculate|solve)\b|\d\s*[+*/=]\s*\d/i.test(prompt)) return false
    if (/\b(?:time|date|day)\s+(?:is\s+it|right\s+now|today)\b|\b(?:current|today's)\s+(?:time|date|day)\b|\bwhat\s+(?:is\s+the\s+)?(?:time|date)\s*(?:now|right\s+now|today)?[?.!]*$/i.test(prompt)) return false
    return /\b(?:what\s+(?:is|are)|explain|describe|teach\s+me|tell\s+me\s+about|help\s+me\s+understand|how\s+(?:does|do)|why\s+(?:does|do|is|are))\b/i.test(prompt)
}

export const normalizeSearchImages = (images) => {
    const seen = new Set()
    return (Array.isArray(images) ? images : []).flatMap(image => {
        const source = typeof image === 'string' ? image : image?.url
        try {
            const url = new URL(source)
            if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) return []
            seen.add(url.href)
            return [{ url: url.href, description: typeof image?.description === 'string' ? image.description : '' }]
        } catch { return [] }
    })
}

export const isPublicIPv4 = (address) => {
    const octets = address.split('.').map(Number)
    if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false
    const [a, b] = octets
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
        || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)))
}

export const imageType = (buffer) => {
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: 'png', mime: 'image/png' }
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' }
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { extension: 'webp', mime: 'image/webp' }
    throw new Error('Not a supported image')
}
