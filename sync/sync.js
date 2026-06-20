import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { createClient } from '@supabase/supabase-js'

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.production,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function syncItem(itemId, accessToken) {
  const { data: cursorRow } = await supabase
    .from('sync_cursors')
    .select('cursor')
    .eq('item_id', itemId)
    .maybeSingle()

  let cursor = cursorRow?.cursor ?? undefined
  let added = [], modified = [], removed = []
  let hasMore = true

  while (hasMore) {
    const { data } = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
    })
    added = added.concat(data.added)
    modified = modified.concat(data.modified)
    removed = removed.concat(data.removed)
    hasMore = data.has_more
    cursor = data.next_cursor
  }

  const toUpsert = [...added, ...modified].map((t) => ({
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    amount: t.amount,
    date: t.date,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    category: t.personal_finance_category?.primary ?? null,
    pending: t.pending,
  }))

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('transactions')
      .upsert(toUpsert, { onConflict: 'transaction_id' })
    if (error) throw error
  }

  if (removed.length > 0) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('transaction_id', removed.map((t) => t.transaction_id))
    if (error) throw error
  }

  const { error: cursorErr } = await supabase
    .from('sync_cursors')
    .upsert({ item_id: itemId, cursor, last_synced_at: new Date().toISOString() }, { onConflict: 'item_id' })
  if (cursorErr) throw cursorErr

  console.log(`[${itemId}] +${added.length} modified:${modified.length} removed:${removed.length}`)
}

async function main() {
  const { data: items, error } = await supabase
    .from('plaid_items')
    .select('item_id, access_token')

  if (error) throw error
  if (!items.length) { console.log('No items to sync'); return }

  for (const item of items) {
    try {
      await syncItem(item.item_id, item.access_token)
    } catch (err) {
      console.error(`Failed to sync ${item.item_id}:`, err?.response?.data ?? err.message)
      process.exitCode = 1
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
