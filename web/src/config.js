export const API  = import.meta.env.VITE_API_URL    ?? 'http://localhost:3001'
export const WS   = import.meta.env.VITE_WS_URL     ?? 'ws://localhost:4001'
const params = new URLSearchParams(window.location.search)
export const SLUG = params.get('event') || import.meta.env.VITE_EVENT_SLUG