import { db } from '../db'
import { deletionsRepo } from './deletions.repo'
import type { Account } from '../types'
import { todayISO } from '@lib/dates'

const now = () => new Date().toISOString()

export const accountsRepo = {
  getAll: () => db.accounts.toArray(),

  getActive: () => db.accounts.filter((a) => a.is_active).toArray(),

  getById: (id: string) => db.accounts.get(id),

  create: (data: Omit<Account, 'id' | 'created_at'>) =>
    db.accounts.add({ ...data, created_at: now() }),

  update: (id: string, patch: Partial<Account>) => db.accounts.update(id, patch),

  deactivate: (id: string) => db.accounts.update(id, { is_active: false }),

  reactivate: (id: string) => db.accounts.update(id, { is_active: true }),

  /**
   * Delete an account for good — but only once nothing points at it.
   *
   * A deleted account whose transactions survive leaves every account-grouped
   * view resolving a dead account_id, and deleting the transactions along with
   * it would silently rewrite past months' spending and net worth. So the
   * refusal is the feature: the caller offers to move the history or to
   * deactivate instead, and never to destroy it.
   */
  async deleteAccount(
    id: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'has_transactions'; count: number }> {
    // Counts adjustments too — a balance correction is an ordinary transaction
    // on this account, and orphaning one is the same bug as orphaning any other.
    const count = await db.transactions.where('account_id').equals(id).count()
    if (count > 0) return { ok: false, reason: 'has_transactions', count }

    await deletionsRepo.remove('accounts', id)
    return { ok: true }
  },

  /**
   * Reassign every transaction on one account to another, so the first can be
   * deleted. Returns how many moved.
   *
   * `updated_at` is stamped by hand: Dexie's `.modify()` bypasses the `updating`
   * hook that normally sets it (see the v12 note in db.ts). Leaving it untouched
   * would make the move invisible to the watermark push — this device would show
   * the new account while every other device kept the old one, permanently.
   *
   * The correction audit rows move too. They record "this account went from X to
   * Y", so leaving them behind orphans them locally while the cloud's FK
   * cascade removes them, and the two copies diverge.
   */
  async moveTransactions(fromId: string, toId: string): Promise<number> {
    const stamp = now()
    return db.transaction('rw', db.transactions, db.balanceCorrections, async () => {
      await db.balanceCorrections
        .where('account_id')
        .equals(fromId)
        .modify({ account_id: toId, updated_at: stamp })
      return db.transactions
        .where('account_id')
        .equals(fromId)
        .modify({ account_id: toId, updated_at: stamp })
    })
  },

  updateManualBalance: (id: string, balance: number) =>
    db.accounts.update(id, {
      manual_balance_override: balance,
      last_balance_updated_at: todayISO(),
    }),

  remove: (id: string) => db.accounts.delete(id),
}
