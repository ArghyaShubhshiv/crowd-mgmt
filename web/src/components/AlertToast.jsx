import { useEffect, useState } from 'react'

export default function AlertToast({ alert }) {
  const [shown, setShown] = useState(null)

  useEffect(() => {
    if (!alert) return
    setShown(alert)
    const t = setTimeout(() => setShown(null), 5000)
    return () => clearTimeout(t)
  }, [alert])

  if (!shown) return null
  return <div className={`banner ${shown.severity}`}>{shown.message}</div>
}