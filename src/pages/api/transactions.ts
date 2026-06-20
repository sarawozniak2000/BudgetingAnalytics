import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function serverSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).end()

  const supabase = serverSupabase()

  if (req.method === 'PATCH') {
    const { transaction_id, category } = req.body
    const { error } = await supabase
      .from('transactions')
      .update({ category })
      .eq('transaction_id', transaction_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  const { search, category, accounts, limit = '100', offset = '0' } = req.query as Record<string, string>

  let query = supabase
    .from('transactions')
    .select('transaction_id,date,name,merchant_name,amount,category,pending,account_id', { count: 'exact' })
    .order('date', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (search) query = query.ilike('name', `%${search}%`)
  if (category) query = query.eq('category', category)
  if (accounts) query = query.in('account_id', accounts.split(','))

  const { data, count, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  res.json({ transactions: data ?? [], total: count ?? 0 })
}
