import express from "express"
import { agent } from "../controllers/agent.controller.js"
import multer from "../config/multer.js"
import { localImagePath } from "../utils/localImages.js"

const router=express.Router()

router.post("/chat",multer.single("file"),agent)
router.get('/images/:filename', (req, res) => {
    let filename
    try {
        filename = localImagePath(req.headers['x-user-id'], req.params.filename)
    } catch {
        return res.status(404).json({ message: 'Image not found' })
    }
    res.set('Cache-Control', 'private, max-age=3600')
    res.sendFile(filename, error => {
        if (error && !res.headersSent) res.status(404).json({ message: 'Image not found' })
    })
})

export default router
