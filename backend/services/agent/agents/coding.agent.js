import { checkAgentLimit } from '../config/agentLimit.js'
import { getModel } from '../config/llmModels.js'
import { deductCredits } from '../utils/deductCredits.js'
import { getResponseText, parseProjectResponse, requireCompleteResponse } from '../utils/codingResponse.js'

export const codingAgent = async (state) => {
    try {
        await checkAgentLimit(state.userId, 'coding')
        const classifier = await getModel('intent')
        const classification = await classifier.invoke(`Classify the request. Return only PROJECT or ANSWER.
PROJECT: the user explicitly requests a complete website, app, dashboard, project, or interactive visualizer with files.
ANSWER: algorithms, code snippets, functions, code review, debugging, explanations, optimization, and documentation.
Examples: "binary search code" -> ANSWER; "build a binary search visualizer website" -> PROJECT.
Do not turn a code snippet request into a website.
Request: ${state.prompt}`)
        const isProject = getResponseText(classification).trim().toUpperCase() === 'PROJECT'
        const prompt = isProject
            ? `Generate a compact, working project for this request: ${state.prompt}
Default stack: HTML, CSS, JavaScript. Use another stack only if explicitly requested.
Return ONLY valid JSON: {"files":[{"name":"index.html","content":"..."},{"name":"style.css","content":"..."},{"name":"script.js","content":"..."}]}.
Include complete files. Keep the whole project under 300 lines. Prefer concise working code over elaborate styling.
Do not add images unless requested. No Markdown fences or explanation. Escape all JSON strings correctly.`
            : `Answer this programming request directly in Markdown: ${state.prompt}
For a code request, provide complete runnable code in a fenced block and a short explanation, including complexity for algorithms.
Use the requested language; if unspecified, use Python. Do not build a website or return project JSON unless explicitly requested.
Keep the answer concise and complete.`
        let output
        for (const modelName of ['coding', 'chat']) {
            try {
                const model = await getModel(modelName)
                const response = await model.invoke(prompt)
                requireCompleteResponse(response)
                output = isProject ? parseProjectResponse(response) : getResponseText(response)
                if (!output || (typeof output === 'string' && !output.trim())) throw new Error('Empty coding response')
                break
            } catch (error) {
                console.warn(`Coding ${modelName} response failed: ${error.name || 'Error'} (${error.status || 'invalid response'})`)
                if (modelName === 'chat') throw error
            }
        }
        await deductCredits(state.userId, 'coding')
        return {
            ...state,
            aiResponse: isProject ? 'Code generated successfully.' : output,
            artifacts: isProject ? [{ id: Date.now(), type: 'Project', title: state.prompt, files: output.files }] : []
        }
    } catch (error) {
        console.warn(`Coding request failed: ${error.name || 'Error'} (${error.status || 'unknown'})`)
        return {
            ...state,
            aiResponse: error.data?.message || 'The coding providers could not return a complete answer. Please retry or ask for a smaller example.',
            artifacts: []
        }
    }
}