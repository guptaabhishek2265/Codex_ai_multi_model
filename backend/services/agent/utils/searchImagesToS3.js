import axios from 'axios'
import { lookup } from 'node:dns/promises'
import { Agent } from 'node:https'
import { randomUUID } from 'node:crypto'
import { isPublicIPv4, imageType, normalizeSearchImages } from './imageSearch.js'
import { checkS3Configuration } from '../config/s3.js'
import { uploadToS3 } from './uploadToS3.js'
import { getFromS3 } from './getFromS3.js'

const downloadImage = async (address) => {
    let url = new URL(address)
    for (let redirects = 0; redirects <= 2; redirects++) {
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Invalid image address')
        const addresses = await lookup(url.hostname, { all: true, family: 4 })
        if (!addresses.length || addresses.some(item => !isPublicIPv4(item.address))) throw new Error('Private image address')
        // Pin the checked DNS result so a redirect or DNS change cannot reach an internal service.
        const agent = new Agent({ lookup: (_hostname, options, callback) => {
            if (options?.all) callback(null, addresses)
            else callback(null, addresses[0].address, 4)
        } })
        try {
            const response = await axios.get(url.href, {
                httpsAgent: agent, proxy: false, responseType: 'arraybuffer', timeout: 10000,
                maxContentLength: 8 * 1024 * 1024, maxRedirects: 0,
                headers: { 'User-Agent': 'AgentVerse/1.0', Accept: 'image/*' },
                validateStatus: status => status === 200 || [301, 302, 303, 307, 308].includes(status)
            })
            if (response.status !== 200) {
                if (!response.headers.location) throw new Error('Missing redirect address')
                url = new URL(response.headers.location, url)
                continue
            }
            const buffer = Buffer.from(response.data)
            return { buffer, ...imageType(buffer) }
        } finally { agent.destroy() }
    }
    throw new Error('Too many image redirects')
}

export const searchImagesToS3 = async (results) => {
    await checkS3Configuration()
    const candidates = normalizeSearchImages(results.images).slice(0, 6)
    const saved = []
    // Try two sources at a time; stop after three working pictures.
    for (let index = 0; index < candidates.length && saved.length < 3;) {
        const sources = candidates.slice(index, index + Math.min(2, 3 - saved.length))
        index += sources.length
        const batch = await Promise.allSettled(sources.map(async source => {
            const image = await downloadImage(source.url)
            const key = `search-images/${randomUUID()}.${image.extension}`
            await uploadToS3(key, image.buffer, image.mime)
            return { url: await getFromS3(key, 86400), source: source.url, description: source.description }
        }))
        for (const result of batch) if (result.status === 'fulfilled') saved.push(result.value)
    }
    return saved
}
