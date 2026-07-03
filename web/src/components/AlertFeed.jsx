import {useEffect, useState} from 'react'

const MAX_ITEMS = 30

export default function AlertFeed({alert}){
    const [items, setItems] = useState([])

    useEffect(()=>{
        if (!alert) return
        setItems(prev => [{ ...alert, id: `${alert.zone}-${alert.ts}` }, ...prev].slice(0, MAX_ITEMS))
    }, [alert])

    return (
        <div className = "feed">
            <div className = "feed-title">Alerts</div>
            {items.length === 0 && <div className="feed-empty">No alerts yet</div>}
            <div className="feed-list">
                {items.map(a => (
                    <div key={a.id} className={`feed-item ${a.severity}`}>
                        <div className="feed-row">
                            <span className='feed-sev'>{a.severity}</span>
                            <span className='feed-time'>
                                {new Date(a.ts).toLocaleTimeString('en-GB', {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                })}
                            </span>
                        </div>
                        <div className='feed-msg'>{a.message}</div>
                        {a.suggestion && (
                            <div className="feed-suggestion">
                                <span className='spark'>✦</span>
                                {a.suggestion}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}