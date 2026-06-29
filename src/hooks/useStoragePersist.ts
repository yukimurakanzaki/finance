import { useState, useEffect, useCallback } from 'react'
import { requestStoragePersistence, isStoragePersisted } from '@lib/storage'

export function useStoragePersist() {
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    isStoragePersisted().then(setIsPersisted)
  }, [])

  const request = useCallback(async () => {
    const granted = await requestStoragePersistence()
    setIsPersisted(granted)
    return granted
  }, [])

  return { isPersisted, request }
}
