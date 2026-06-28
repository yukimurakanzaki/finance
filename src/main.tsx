import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { requestStoragePersistence } from '@lib/storage'
import { settingsRepo } from '@db/repositories/settings.repo'
import { useReconcileStore } from '@stores/reconcileStore'

// Register service worker
registerSW({ immediate: true })

// Bootstrap
async function bootstrap() {
  // Request storage persistence — log if denied, show passive banner once
  await requestStoragePersistence()

  // Restore reconcile-in-progress flag from Dexie to Zustand (survives app kill)
  const inProgress = await settingsRepo.get('reconcile_in_progress')
  if (inProgress === 'true') {
    useReconcileStore.getState().start()
  }
}

bootstrap().catch(console.error)

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
