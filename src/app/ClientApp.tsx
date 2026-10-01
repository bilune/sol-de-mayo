'use client'

import dynamic from 'next/dynamic'

/**
 * The whole app is client-only, like the Vite SPA it comes from: it reads the URL
 * fragment, `localStorage`, `navigator.languages`, the navigation type and
 * `matchMedia` before its first frame, and the bot is an animation loop. Rendering
 * it on the server would only produce a frame to throw away (and a hydration
 * mismatch for every returning visitor).
 */
const App = dynamic(() => import('@/components/App'), { ssr: false })

export default function ClientApp() {
  return <App />
}
