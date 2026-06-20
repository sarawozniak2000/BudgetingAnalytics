import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function serverSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = serverSupabase()

  const [{ data: topExpenses }, { data: recurring }, { data: transactions }] = await Promise.all([
    supabase.from('top_expenses_current_month').select('*').limit(10),
    supabase.from('recurring_expenses').select('merchant,count,last_seen,typical_amount').order('typical_amount', { ascending: false }),
    supabase.from('transactions').select('date,amount,category,name,account_id').order('date', { ascending: true }),
  ])

  const txs = transactions ?? []

  // Category breakdown (expenses only — positive amounts)
  const catMap: Record<string, number> = {}
  txs.forEach((t) => {
    if (t.amount > 0) {
      const cat = t.category || 'OTHER'
      catMap[cat] = (catMap[cat] || 0) + t.amount
    }
  })
  const categoryBreakdown = Object.entries(catMap)
    .map(([category, total]) => ({ category: category.replace(/_/g, ' '), total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)

  // Month-over-month trend
  const monthMap: Record<string, { month: string; income: number; expenses: number }> = {}
  txs.forEach((t) => {
    const month = t.date.substring(0, 7)
    if (!monthMap[month]) monthMap[month] = { month, income: 0, expenses: 0 }
    if (t.amount > 0) monthMap[month].expenses = Math.round((monthMap[month].expenses + t.amount) * 100) / 100
    else monthMap[month].income = Math.round((monthMap[month].income + Math.abs(t.amount)) * 100) / 100
  })
  const monthlyTrend = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month))

  const totalSpent = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalIncome = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  res.json({
    summary: {
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      net: Math.round((totalIncome - totalSpent) * 100) / 100,
    },
    topExpenses: topExpenses ?? [],
    recurring: recurring ?? [],
    categoryBreakdown,
    monthlyTrend,
  })
}
