import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const imageRoot = path.resolve('generated-images')
export const localImagePath = (userId, filename) => {
    if (!/^[a-f0-9]{24}$/i.test(userId || '') || !/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(filename || '')) {
        throw new Error('Invalid image path')
    }
    return path.join(imageRoot, userId, filename)
}

export const saveLocalImage = async (userId, filename, buffer) => {
    const destination = localImagePath(userId, filename)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, buffer, { flag: 'wx' })
    return `/api/agent/images/${filename}`
}