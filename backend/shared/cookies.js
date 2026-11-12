export const sessionCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
})

export const readCookie = (header = '', name) => {
    const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))
    if (!pair) return undefined
    try { return decodeURIComponent(pair.slice(name.length + 1)) } catch { return undefined }
}