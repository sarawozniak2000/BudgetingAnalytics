import type { NextApiRequest, NextApiResponse } from 'next'
import { plaidClient } from '@/lib/plaid'
import { createClient } from '@supabase/supabase-js'

function serverSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { public_token, institution_id, institution_name } = req.body
  if (!public_token) return res.status(400).json({ error: 'public_token required' })

  const supabase = serverSupabase()

  try {
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = exchangeRes.data

    const { data: item, error: itemErr } = await supabase
      .from('plaid_items')
      .upsert(
        { item_id, access_token, institution_id: institution_id ?? null, institution_name: institution_name ?? null },
        { onConflict: 'item_id' }
      )
      .select()
      .single()

    if (itemErr) throw itemErr

    const accountsRes = await plaidClient.accountsGet({ access_token })
    const accounts = accountsRes.data.accounts.map((a) => ({
      plaid_item_id: item.id,
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      mask: a.mask ?? null,
    }))

    const { error: accErr } = await supabase
      .from('accounts')
      .upsert(accounts, { onConflict: 'account_id' })

    if (accErr) throw accErr

    res.json({
      success: true,
      item_id,
      accounts: accountsRes.data.accounts.map((a) => ({ name: a.name, mask: a.mask, type: a.type })),
    })
  } catch (err: any) {
    console.error('exchange-token error:', err?.response?.data ?? err)
    res.status(500).json({ error: 'Failed to exchange token', detail: err?.response?.data?.error_message ?? err.message })
  }
}
