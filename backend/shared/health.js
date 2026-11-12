export const addHealthRoutes = (app, ready) => {
    const handler = (_req, res) => res.status(ready() ? 200 : 503).json({ ready: ready() })
    app.get('/health', handler)
    app.get('/api/health', handler)
}

export const safeErrorHandler = (error, _req, res, _next) => {
    console.error(`Request failed: ${error.name || 'Error'} (${error.status || 500})`)
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500
    res.status(status).json({ message: status < 500 ? 'Invalid request' : 'The request could not be completed' })
}
