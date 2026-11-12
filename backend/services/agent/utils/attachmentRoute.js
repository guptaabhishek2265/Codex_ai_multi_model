export const attachmentRoute = (state) => {
    if (state.file?.mimetype === 'application/pdf') return 'pdfRag'
    if (state.file?.mimetype?.startsWith('image/')) return 'imageAnalyzer'
    return state.agent && state.agent !== 'auto' ? state.agent : null
}
