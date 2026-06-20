import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, Cell,
} from 'recharts'

const COLORS = ['#0070f3', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#9333ea', '#16a34a']

type Summary = { totalSpent: number; totalIncome: number; net: number }
type TopExpense = { transaction_id: string; date: string; merchant: string; amount: number; category: string }
type Recurring = { merchant: string; count: number; last_seen: string; typical_amount: number }
type CategoryItem = { category: string; total: number }
type MonthItem = { month: string; income: number; expenses: number }
type Transaction = {
  transaction_id: string; date: string; name: string; merchant_name: string | null
  amount: number; category: string | null; pending: boolean; account_id: string
}

type DashboardData = {
  summary: Summary
  topExpenses: TopExpense[]
  recurring: Recurring[]
  categoryBreakdown: CategoryItem[]
  monthlyTrend: MonthItem[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [drillCategory, setDrillCategory] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [loading, setLoading] = useState(true)

  const CATEGORIES = [
    'FOOD_AND_DRINK', 'TRANSPORTATION', 'SHOPPING', 'ENTERTAINMENT', 'LOAN_PAYMENTS',
    'INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'GENERAL_MERCHANDISE', 'GENERAL_SERVICES',
    'RENT_AND_UTILITIES', 'HOME_IMPROVEMENT', 'MEDICAL', 'PERSONAL_CARE', 'TRAVEL', 'OTHER',
  ]

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [])

  const loadTransactions = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const cat = drillCategory ?? filterCategory
    if (cat) params.set('category', cat)
    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((d) => { setTransactions(d.transactions); setTotal(d.total) })
  }, [search, filterCategory, drillCategory])

  useEffect(() => { loadTransactions() }, [loadTransactions])

  const saveCategory = async (transaction_id: string) => {
    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id, category: editCategory }),
    })
    setEditingId(null)
    loadTransactions()
    const r = await fetch('/api/dashboard')
    setData(await r.json())
  }

  if (loading) return <div style={s.loading}>Loading dashboard...</div>
  if (!data) return <div style={s.loading}>No data yet.</div>

  const { summary, topExpenses, recurring, categoryBreakdown, monthlyTrend } = data

  return (
    <div style={s.page}>
      <header style={s.header}>
        <h1 style={s.title}>Budget Analytics</h1>
        <a href="/onboarding" style={s.addBank}>+ Add bank</a>
      </header>

      {/* Summary cards */}
      <div style={s.cards}>
        <Card label="Spent (all time)" value={fmt(summary.totalSpent)} color="#dc2626" />
        <Card label="Income (all time)" value={fmt(summary.totalIncome)} color="#16a34a" />
        <Card label="Net" value={(summary.net >= 0 ? '+' : '') + fmt(summary.net)} color={summary.net >= 0 ? '#16a34a' : '#dc2626'} />
      </div>

      <div style={s.grid}>
        {/* Category breakdown */}
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Spending by category</h2>
          {categoryBreakdown.length === 0 ? (
            <p style={s.empty}>No expense data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]}
                  onClick={(e: any) => setDrillCategory((e as CategoryItem).category.replace(/ /g, '_'))}
                  style={{ cursor: 'pointer' }}>
                  {categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Month-over-month trend */}
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Month-over-month</h2>
          {monthlyTrend.length === 0 ? (
            <p style={s.empty}>No trend data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyTrend.map((m) => ({ ...m, month: fmtMonth(m.month) }))} margin={{ right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Top expenses */}
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Top expenses this month</h2>
          {topExpenses.length === 0 ? (
            <p style={s.empty}>No expenses this month.</p>
          ) : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Merchant</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                <th style={s.th}>Category</th>
              </tr></thead>
              <tbody>
                {topExpenses.map((e) => (
                  <tr key={e.transaction_id} style={s.tr}
                    onClick={() => setDrillCategory(e.category)}>
                    <td style={s.td}>{e.merchant}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{fmt(e.amount)}</td>
                    <td style={s.td}><span style={s.badge}>{e.category?.replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Recurring expenses */}
        <section style={s.panel}>
          <h2 style={s.panelTitle}>Recurring expenses</h2>
          {recurring.length === 0 ? (
            <p style={s.empty}>Not enough data yet — recurring patterns appear after a few months.</p>
          ) : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Merchant</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Typical</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Count</th>
                <th style={s.th}>Last seen</th>
              </tr></thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.merchant} style={s.tr}>
                    <td style={s.td}>{r.merchant}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{fmt(r.typical_amount)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{r.count}</td>
                    <td style={s.td}>{r.last_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Transaction table */}
      <section style={{ ...s.panel, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h2 style={{ ...s.panelTitle, margin: 0 }}>
            Transactions {drillCategory ? `— ${drillCategory.replace(/_/g, ' ')}` : ''}
          </h2>
          {drillCategory && (
            <button onClick={() => setDrillCategory(null)} style={s.clearBtn}>✕ Clear filter</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={s.input}
            />
            {!drillCategory && (
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={s.input}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            )}
          </div>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#888' }}>{total} transaction{total !== 1 ? 's' : ''}</p>

        <table style={s.table}>
          <thead><tr>
            <th style={s.th}>Date</th>
            <th style={s.th}>Name</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
            <th style={s.th}>Category</th>
          </tr></thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transaction_id} style={s.tr}>
                <td style={{ ...s.td, color: '#888', fontSize: 13 }}>{t.date}</td>
                <td style={s.td}>{t.merchant_name ?? t.name}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: t.amount > 0 ? '#dc2626' : '#16a34a' }}>
                  {t.amount > 0 ? '-' : '+'}{fmt(t.amount)}
                </td>
                <td style={s.td}>
                  {editingId === t.transaction_id ? (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ ...s.input, padding: '2px 4px' }}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                      </select>
                      <button onClick={() => saveCategory(t.transaction_id)} style={s.saveBtn}>Save</button>
                      <button onClick={() => setEditingId(null)} style={s.clearBtn}>✕</button>
                    </span>
                  ) : (
                    <span
                      onClick={() => { setEditingId(t.transaction_id); setEditCategory(t.category ?? '') }}
                      style={{ ...s.badge, cursor: 'pointer' }}
                      title="Click to recategorize"
                    >
                      {t.category?.replace(/_/g, ' ') ?? '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={4} style={{ ...s.td, textAlign: 'center', color: '#888' }}>No transactions found</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={s.card}>
      <p style={s.cardLabel}>{label}</p>
      <p style={{ ...s.cardValue, color }}>{value}</p>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1200, margin: '0 auto', padding: '24px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontFamily: 'sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 24, fontWeight: 700 },
  addBank: { fontSize: 14, color: '#0070f3', textDecoration: 'none', border: '1px solid #0070f3', borderRadius: 6, padding: '6px 12px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 },
  card: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '20px 24px' },
  cardLabel: { margin: '0 0 8px', fontSize: 13, color: '#888' },
  cardValue: { margin: 0, fontSize: 28, fontWeight: 700 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  panel: { background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 24 },
  panelTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600 },
  empty: { color: '#999', fontSize: 14, margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left' as const, fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase' as const, padding: '6px 8px', borderBottom: '1px solid #eee' },
  td: { padding: '10px 8px', fontSize: 14, borderBottom: '1px solid #f5f5f5', verticalAlign: 'middle' as const },
  tr: { cursor: 'pointer' },
  badge: { background: '#f0f4ff', color: '#0070f3', borderRadius: 4, padding: '2px 7px', fontSize: 12 },
  input: { border: '1px solid #ddd', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' },
  clearBtn: { background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, color: '#666' },
  saveBtn: { background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 },
}
