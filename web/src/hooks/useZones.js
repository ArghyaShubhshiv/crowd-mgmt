import {useState, useEffect} from 'react'
import {API, SLUG} from '../config'

export function useZones(){
    const [zones, setZones]   = useState(null)   // null = still loading
    const [error, setError]   = useState(null)

    useEffect(()=>{
        let cancelled = false;
        ;(
        async () => {
                try {
                    const res = await fetch(`${API}/public/events/${SLUG}/zones`)

                    if (!res.ok) throw new Error(`Error: zones fetch failed: ${res.status}`) 

                    const data = await res.json()

                    if (cancelled) return;     
                    
                    const slugZoneMap = new Map(
                        data.zones
                        .filter(z => z.center_lat != null && z.center_lng != null)
                        .map(z => [z.slug, z])
                    )

                    setZones(slugZoneMap)
                }
                catch (error){
                    if (!cancelled) setError(e)
                }
            }
        )()
        return () => {cancelled: true}
    }, [])

    return {zones, error}
}