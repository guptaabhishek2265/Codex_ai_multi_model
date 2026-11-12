export const getResponseText = (response) => {
    if (typeof response.content === 'string') return response.content
    if (Array.isArray(response.content)) return response.content
        .filter(block => block.type === 'text').map(block => block.text).join('\n')
    throw new Error('Missing text in model response')
}

export const requireCompleteResponse = (response) => {
    const reason = response.response_metadata?.finish_reason || response.response_metadata?.finishReason
    if (['length', 'max_tokens', 'MAX_TOKENS'].includes(reason)) {
        throw new Error('Model response exceeded its token limit')
    }
}

export const parseProjectResponse = (response) => {
    requireCompleteResponse(response)
    const text = getResponseText(response).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const project = JSON.parse(text)
    if (!Array.isArray(project.files) || project.files.length === 0 || project.files.length > 30) {
        throw new Error('Project must contain files')
    }
    const names = new Set()
    for (const file of project.files) {
        if (typeof file.name !== 'string' || !file.name.trim() || typeof file.content !== 'string' || !file.content.trim()
            || file.name.includes('..') || /^[\\/]/.test(file.name) || names.has(file.name)) {
            throw new Error('Invalid project file')
        }
        names.add(file.name)
    }
    return project
}