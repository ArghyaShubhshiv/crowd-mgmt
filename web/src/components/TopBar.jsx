import {SLUG} from "../config"

export default function TopBar({connected}){
    return (
        <header>
            <span className={`dot ${connected ? 'live' : ''}`}/>
                <h3>ConPulse - {SLUG}</h3>
            <span className="status">{connected ? 'live' : 'connecting…'}</span>
        </header>
    )
}