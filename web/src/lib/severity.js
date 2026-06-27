export const COLORS = { ok: '#22c55e', warning: '#eab308', critical: '#ef4444' }

export function severityFor(count, zone){
    if (!zone) return 'ok'
    if (count >= zone.critical_threshold) return 'critical'
    if (count >= zone.warning_threshold) return 'warning'

    return 'ok'
}