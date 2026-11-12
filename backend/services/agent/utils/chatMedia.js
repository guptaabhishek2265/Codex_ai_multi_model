const inlineImage = /!\[([^\]]*)\]\(<?(https?:\/\/[^\s)]+)>?(?:\s+["'][^"']*["'])?\)/g

const outsideCode = (text, transform) => String(text || '').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map(part => /^(?:```|~~~)/.test(part) ? part : transform(part)).join('')

export const hasInlineImages = (text) => {
    let found = false
    outsideCode(text, part => { if ([...part.matchAll(inlineImage)].length) found = true; return part })
    return found
}

// Only application-created URLs may become displayed images. Never trust a model's signature.
export const bindChatImages = (text, verifiedImages = []) => {
    let index = 0
    return outsideCode(text, part => part.replace(inlineImage, (_match, _alt, url) => {
        const image = verifiedImages.includes(url) ? url : verifiedImages[index++]
        return image ? `![Retrieved illustration](${image})` : ''
    }))
}
