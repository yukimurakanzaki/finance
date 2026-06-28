export async function requestStoragePersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    const granted = await navigator.storage.persist()
    if (!granted) {
      console.warn('[storage] persist() denied — data may be evicted under storage pressure')
    }
    return granted
  } catch {
    return false
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}
