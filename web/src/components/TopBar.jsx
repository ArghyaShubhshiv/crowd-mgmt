import {SLUG} from "../config"

export default function TopBar({connected}){
    return (
        <header>
            <span className={`dot ${connected ? 'live' : ''}`}/>
                <h1>ConPulse - {SLUG}</h1>
            <span className="status">{connected ? 'live' : 'connecting…'}</span>
        </header>
    )
}