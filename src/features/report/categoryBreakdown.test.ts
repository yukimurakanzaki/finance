import { describe, expect, it } from 'vitest'
import { groupByCategory } from './categoryBreakdown'

const catName = new Map([
  ['cat-food', 'Food'],
  ['cat-transport', 'Transport'],
])

describe('groupByCategory', () => {
  it('sums per category and sorts descending by amount', () => {
    const rows = groupByCategory(
      [
        { category_id: 'cat-food', amount: 20_000 },
        { category_id: 'cat-transport', amount: 50_000 },
        { category_id: 'cat-food', amount: 15_000 },
      ],
      catName,
    )
    expect(rows).toEqual([
      { id: 'cat-transport', name: 'Transport', amount: 50_000 },
      { id: 'cat-food', name: 'Food', amount: 35_000 },
    ])
  })

  it('buckets null category_id under Uncategorized', () => {
    const rows = groupByCategory(
      [
        { category_id: null, amount: 10_000 },
        { category_id: null, amount: 5_000 },
      ],
      catName,
    )
    expect(rows).toEqual([
      { id: '__uncategorized__', name: 'Uncategorized', amount: 15_000 },
    ])
  })

  it('buckets an unknown/deleted category_id under Uncategorized too', () => {
    const rows = groupByCategory(
      [{ category_id: 'cat-deleted', amount: 7_000 }],
      catName,
    )
    expect(rows).toEqual([
      { id: '__uncategorized__', name: 'Uncategorized', amount: 7_000 },
    ])
  })

  it('merges null and unknown category_id into the same Uncategorized bucket', () => {
    const rows = groupByCategory(
      [
        { category_id: null, amount: 3_000 },
        { category_id: 'cat-deleted', amount: 4_000 },
      ],
      catName,
    )
    expect(rows).toEqual([
      { id: '__uncategorized__', name: 'Uncategorized', amount: 7_000 },
    ])
  })

  it('returns an empty array for no expenses', () => {
    expect(groupByCategory([], catName)).toEqual([])
  })

  it('reconciles: the sum of all row amounts equals the sum of the input transactions', () => {
    const txns = [
      { category_id: 'cat-food', amount: 20_000 },
      { category_id: 'cat-transport', amount: 50_000 },
      { category_id: null, amount: 9_000 },
      { category_id: 'cat-food', amount: 1_000 },
    ]
    const rows = groupByCategory(txns, catName)
    const rowTotal = rows.reduce((s, r) => s + r.amount, 0)
    const txnTotal = txns.reduce((s, t) => s + t.amount, 0)
    expect(rowTotal).toBe(txnTotal)
  })
})
