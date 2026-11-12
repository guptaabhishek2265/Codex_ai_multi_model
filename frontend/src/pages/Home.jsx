import { signInWithPopup } from 'firebase/auth'
import React, { useState } from 'react'
import { auth, googleProvider } from '../../utils/firebase'
import api from '../../utils/axios'
import { FcGoogle } from "react-icons/fc";
import { useDispatch, useSelector } from 'react-redux';
import { setUserdata } from '../redux/userSlice';
import SideBar from '../components/SideBar';
import ChatArea from '../components/ChatArea';
import Artifact from '../components/Artifact';

function Home() {
    const {userData}=useSelector(state=>state.user)
    const dispatch=useDispatch()
    const [isSigningIn, setIsSigningIn] = useState(false)
    const [loginError, setLoginError] = useState('')

    const googleLogin = async () => {
        if (isSigningIn) return
        setIsSigningIn(true)
        setLoginError('')
        try {
            const result = await signInWithPopup(auth, googleProvider)
            const token = await result.user.getIdToken()
            const { data } = await api.post('/api/auth/login', { token }, { timeout: 15000 })
            dispatch(setUserdata(data))
        } catch (error) {
            const messages = {
                'auth/popup-blocked': 'Your browser blocked Google sign-in. Allow pop-ups for this site and try again.',
                'auth/popup-closed-by-user': 'The Google sign-in window was closed. Please try again.',
                'auth/cancelled-popup-request': 'Another sign-in window is already open. Close it and try again.',
                'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
                'auth/operation-not-allowed': 'Enable Google sign-in in Firebase Authentication.',
                'auth/network-request-failed': 'Unable to reach Google. Check your internet connection and try again.',
                'auth/invalid-api-key': 'The Firebase API key is invalid. Check the frontend configuration.',
                'ERR_NETWORK': 'Unable to reach the login API. Check that the gateway is running on port 8000.',
                'ECONNABORTED': 'Login timed out. Check that the auth service, MongoDB, and Redis are available.'
            }
            setLoginError(messages[error.code] || (error.response
                ? 'The login server could not complete sign-in. Check the auth service logs and try again.'
                : `Google sign-in failed (${error.code || 'unknown error'}). Please try again.`))
        } finally {
            setIsSigningIn(false)
        }
    }
    return (
        <div className='h-screen  flex bg-[#0d0f14] text-white overflow-hidden'>

<SideBar/>
<ChatArea/>
<Artifact/>




{!userData &&   <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur'>
                <div className='w-[340px] bg-[#13151c] border border-white/[0.08] rounded-2xl p-7 flex flex-col gap-5'>
                    <div className='flex flex-col gap-1'>
                        <h2 className='text-[17px] font-semibold text-slate-100 tracking-tight'>Welcome to CortexAI</h2>
                        <p className='text-[13px] text-slate-500'>Please login to continue using the app.</p>
                    </div>

                    <button disabled={isSigningIn} className='w-full flex items-center justify-center gap-3 py-[11px] rounded-xl text-sm font-medium text-black/90 bg-white hover:bg-gray-200 transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait' onClick={googleLogin}>
                        <FcGoogle size={15} />
                        {isSigningIn ? 'Signing in…' : 'Continue With Google'}
                    </button>
                    {loginError && <p role='alert' className='text-sm text-red-400'>{loginError}</p>}
                </div>
            </div>}
          
        </div>
    )
}

export default Home
