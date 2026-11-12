import { checkAgentLimit } from "../config/agentLimit.js"
import { searchTool } from "../config/tavily.js"
import { deductCredits } from "../utils/deductCredits.js"
import { searchImagesToS3 } from "../utils/searchImagesToS3.js"
export const searchAgent = async (state) => {
    try {
        await checkAgentLimit(state.userId, "search")
        const raw = await searchTool.invoke({
            query: state.prompt
        })
        const results = typeof raw === 'string' ? JSON.parse(raw) : raw
        let gallery = []
        try {
            gallery = await searchImagesToS3(results)
        } catch (error) {
            console.warn(`Search images unavailable: ${error.code || error.name}`)
        }
        await deductCredits(state.userId, "search")
        return {
            ...state,
            searchResults: { ...results, images: gallery.map(image => ({ url: image.source, description: image.description })) },
            images: gallery.map(image => image.url)
        }
    } catch (error) {
        console.warn(`Search failed: ${error.code || error.name}`)
        return {
            ...state,
            searchResults: [],
            images: [],
            aiResponse: error?.data?.message || "failed to search"
        }
    }
}
