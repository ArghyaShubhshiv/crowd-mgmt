import { useEffect, useRef, useState } from 'react'
import { WS, SLUG } from '../config'

export function useLiveDensity(){
    const [densities, setDensities] = useState({})
    const [alert, setAlert]         = useState(null)
    const [connected, setConnected] = useState(false)
    const wsRef = useRef(null)

    useEffect(()=>{
        let retry, closed = false;

        function connect(){
            console.log('WS =', WS, 'SLUG =', SLUG)
            const ws = new WebSocket(`${WS}/live?event_slug=${SLUG}`)
            wsRef.current = ws

            ws.onopen = () => setConnected(true)

            ws.onmessage = (e) =>{
                const msg = JSON.parse(e.data);
                if (msg.type === 'alert') { console.log('ALERT FRAME', msg); setAlert(msg) }

                else if (msg.densities) setDensities(msg.densities)
            }

            ws.onclose = () => {
                setConnected(false)
                if (!connected){
                    retry = setTimeout(connect, 1500)
                }
            }

            ws.onerror = () => ws.close()
        }
        connect()
        
        return () => {closed = true, clearTimeout(retry), wsRef.current?.close()}
    }, [])

    return {densities, alert, connected}
}