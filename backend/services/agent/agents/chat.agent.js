import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages"
import { getModel } from "../config/llmModels.js"
import { getMemory } from "../config/memory.js"
import { deductCredits } from "../utils/deductCredits.js"
import { checkAgentLimit } from "../config/agentLimit.js"
import { getClockContext } from "../utils/clockContext.js"
import { shouldIllustrate } from "../utils/imageSearch.js"
import { searchAgent } from "./search.agent.js"
import { bindChatImages, hasInlineImages } from "../utils/chatMedia.js"

export const chatAgent = async (state) => {

   

    try {

        await checkAgentLimit(state.userId,"chat")
        const requestedImages = shouldIllustrate(state.prompt)
        if (requestedImages && !state.searchResults) {
            state = await searchAgent(state)
        }

         const llm = await getModel("chat")

    const history = await getMemory(state.conversationId, state.userId)

   const searchContext=state.searchResults?`
   Web Search Results:

${JSON.stringify(state.searchResults)}

Answer the user using only the above search results.
`:""


    const systemPrompt = `
    You are CortexAI, an intelligent AI assistant.

    ${getClockContext(state.timeZone)}
 
    ${searchContext}

    Images attached to this response: ${state.images?.length || 0}.
    The application displays attached pictures above your answer.
    Never invent image URLs, S3 object names, or Markdown image links.
    Do not reuse image links from conversation history; they may be expired or invented.
    ${requestedImages && !state.images?.length ? 'The requested images could not be retrieved. Say so briefly, then give a text explanation. Do not describe nonexistent pictures or tell the user to click them.' : ''}
    ${state.images?.length ? 'Explain the topic using the actual retrieved material. Include source links to the original images from the search results, clearly labeled as image sources. Do not claim the gallery contains diagrams or views not retrieved.' : ''}

    If searchContext exists:

- Use search results to answer.
- Do not mention internal tools.


    Rules:

- For simple questions, greetings, and short queries, respond naturally in plain text.
- For technical, educational, coding, or detailed topics, use clean Markdown.


 Formatting:

- Use # for titles and ## for sections.
- Leave a blank line after headings.
- Use bullet points for lists.
- Use numbered lists for steps.
- Use fenced code blocks with language tags for code.
- Keep paragraphs short and readable.
- Never write headings and content on the same line.
- Never generate large walls of text.
`
    const messages = [
        new SystemMessage(systemPrompt)
    ]

    history.forEach(msg => {
        if (msg.role == "user") {
            messages.push(new HumanMessage(msg.content))
        }
        if (msg.role == "assistant") {
            messages.push(new AIMessage(bindChatImages(msg.content)))
        }
    });

    messages.push(new HumanMessage(state.prompt))





    const response = await llm.invoke(messages)
    let answer = response.content
    if (typeof answer === 'string' && hasInlineImages(answer) && !state.images?.length && !state.searchResults) {
        // The model may choose an illustrated explanation even when the request did not explicitly ask.
        state = await searchAgent(state)
    }
    answer = bindChatImages(answer, state.images || [])
    if ((requestedImages || hasInlineImages(response.content)) && !state.images?.length) {
        answer = 'I could not retrieve working images for this response.\n\n' + answer
    }
      await deductCredits(state.userId,"chat")
   
    return {
        ...state,
        aiResponse: answer,
        
    }
    } catch (error) {
        console.log(error)
         return {
            ...state,
            aiResponse:error?.data?.message || "failed to generate chat"
        }
        
    
    }
   
}
