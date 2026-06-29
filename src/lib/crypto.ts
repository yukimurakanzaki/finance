const SALT_KEY = 'fi_device_salt'
const HASH_KEY = 'fi_pin_hash'

export class PinSaltMissingError extends Error {
  constructor() {
    super('PIN device salt missing — reset required')
    this.name = 'PinSaltMissingError'
  }
}

function getOrCreateSalt(): string {
  const existing = localStorage.getItem(SALT_KEY)
  if (existing) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  localStorage.setItem(SALT_KEY, hex)
  return hex
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setPin(rawPin: string): Promise<void> {
  const salt = getOrCreateSalt()
  const hash = await sha256Hex(rawPin + salt)
  localStorage.setItem(HASH_KEY, hash)
}

export async function verifyPin(rawPin: string): Promise<boolean> {
  const salt = localStorage.getItem(SALT_KEY)
  if (!salt) throw new PinSaltMissingError()
  const stored = localStorage.getItem(HASH_KEY)
  if (!stored) return false
  const hash = await sha256Hex(rawPin + salt)
  return hash === stored
}

export function hasPin(): boolean {
  return localStorage.getItem(HASH_KEY) !== null
}

export function clearPin(): void {
  localStorage.removeItem(HASH_KEY)
  localStorage.removeItem(SALT_KEY)
}
