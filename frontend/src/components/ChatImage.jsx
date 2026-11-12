import { useState } from 'react'

export default function ChatImage({ src, alt = 'Chat illustration', onOpen }) {
    const [failedSource, setFailedSource] = useState(null)
    if (!src) return null
    if (failedSource === src) return (
        <span role='status' className='inline-block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400'>
            Image could not load.{' '}
            <a href={src} target='_blank' rel='noreferrer' className='text-indigo-400 underline'>Open image link</a>
        </span>
    )
    return <img src={src} alt={alt} loading='lazy' onClick={() => onOpen(src)}
        onError={() => setFailedSource(src)}
        className='w-64 max-w-full h-44 rounded-xl object-contain bg-white/5 border border-white/10 cursor-zoom-in hover:opacity-90 transition' />
}
