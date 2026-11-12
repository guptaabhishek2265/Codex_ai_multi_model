import express from "express"
import { checkCredits, deductCredits, login, logOut, updateUserPayment } from "../controllers/auth.controller.js"

const router=express.Router()

router.post("/login",login)
router.get("/logout",logOut)
router.post("/update-plan",updateUserPayment)
router.post("/deduct-credits",deductCredits)
router.post('/check-credits', checkCredits)
export default router
