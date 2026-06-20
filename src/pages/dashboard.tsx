import { useEffect, useState, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'

// ── types ────────────────────────────────────────────────────────────────────

type Account    = { account_id: string; name: string; mask: string | null; type: string; item_id: string }
type Summary    = { totalSpent: number; totalIncome: number; net: number }
type TopExpense = { transaction_id: string; date: string; merchant: string; amount: number; category: string }
type Recurring  = { merchant: string; count: number; last_seen: string; typical_amount: number }
type CatItem    = { category: string; total: number }
type MonthItem  = { month: string; income: number; expenses: number }
type Tx         = {
  transaction_id: string; date: string; name: string; merchant_name: string | null
  amount: number; category: string | null; pending: boolean; account_id: string
}
type DashData = {
  summary: Summary; topExpenses: TopExpense[]; recurring: Recurring[]
  categoryBreakdown: CatItem[]; monthlyTrend: MonthItem[]; accounts: Account[]
}

// ── constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16']

const ALL_CATEGORIES = [
  'FOOD_AND_DRINK','TRANSPORTATION','SHOPPING','ENTERTAINMENT','LOAN_PAYMENTS',
  'INCOME','TRANSFER_IN','TRANSFER_OUT','GENERAL_MERCHANDISE','GENERAL_SERVICES',
  'RENT_AND_UTILITIES','HOME_IMPROVEMENT','MEDICAL','PERSONAL_CARE','TRAVEL','OTHER',
]

// ── helpers ──────────────────────────────────────────────────────────────────

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

const fmtMonth = (m: string) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

const labelCat = (c: string) => c.replace(/_/g, ' ')

// ── sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <div style={c.card}>
      <p style={c.cardLabel}>{label}</p>
      <p style={{ ...c.cardValue, color: positive === undefined ? '#111827' : positive ? '#059669' : '#ef4444' }}>
        {value}
      </p>
      {sub && <p style={c.cardSub}>{sub}</p>}
    </div>
  )
}

function Badge({ text, color = '#6366f1' }: { text: string; color?: string }) {
  return (
    <span style={{ background: color + '18', color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
      {text}
    </span>
  )
}

function AccountMultiSelect({
  accounts, selected, onChange,
}: { accounts: Account[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const label = selected.length === 0 ? 'All accounts' : selected.length === accounts.length ? 'All accounts' : `${selected.length} account${selected.length > 1 ? 's' : ''}`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={c.filterBtn}>
        <span>🏦 {label}</span>
        <span style={{ marginLeft: 6, opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={c.dropdown}>
          {accounts.length === 0 && <p style={{ padding: '12px 16px', color: '#999', fontSize: 13, margin: 0 }}>No accounts</p>}
          {accounts.map((a) => (
            <label key={a.account_id} style={c.dropdownItem}>
              <input
                type="checkbox"
                checked={selected.includes(a.account_id)}
                onChange={() => toggle(a.account_id)}
                style={{ marginRight: 10, accentColor: '#6366f1' }}
              />
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{a.name}</span>
                {a.mask && <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 6 }}>••{a.mask}</span>}
              </span>
              <Badge text={a.type} color="#6366f1" />
            </label>
          ))}
          {selected.length > 0 && (
            <button onClick={() => onChange([])} style={c.clearAllBtn}>Clear selection</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]             = useState<DashData | null>(null)
  const [txs, setTxs]               = useState<Tx[]>([])
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [acctFilter, setAcctFilter] = useState<string[]>([])
  const [drillCat, setDrillCat]     = useState<string | null>(null)
  const [editId, setEditId]         = useState<string | null>(null)
  const [editCat, setEditCat]       = useState('')
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/dashboard').then((r) => r.json()).then((d) => { setData(d); setLoading(false) })
  }, [])

  const loadTxs = useCallback(() => {
    const p = new URLSearchParams()
    if (search) p.set('search', search)
    const cat = drillCat ?? catFilter
    if (cat) p.set('category', cat)
    if (acctFilter.length > 0) p.set('accounts', acctFilter.join(','))
    fetch(`/api/transactions?${p}`).then((r) => r.json()).then((d) => { setTxs(d.transactions); setTotal(d.total) })
  }, [search, catFilter, acctFilter, drillCat])

  useEffect(() => { loadTxs() }, [loadTxs])

  const saveCategory = async (transaction_id: string) => {
    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id, category: editCat }),
    })
    setEditId(null)
    loadTxs()
    fetch('/api/dashboard').then((r) => r.json()).then(setData)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc', fontFamily: 'system-ui,sans-serif', color: '#6b7280' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
        <p style={{ margin: 0 }}>Loading your finances…</p>
      </div>
    </div>
  )

  if (!data) return null
  const { summary, topExpenses, recurring, categoryBreakdown, monthlyTrend, accounts } = data

  const activeCat = drillCat ?? catFilter

  return (
    <div style={c.page}>
      {/* ── header ── */}
      <header style={c.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={c.logo}>💰</div>
          <div>
            <h1 style={c.headerTitle}>Budget Analytics</h1>
            <p style={c.headerSub}>Personal finance dashboard</p>
          </div>
        </div>
        <a href="/onboarding" style={c.addBankBtn}>+ Add bank account</a>
      </header>

      {/* ── summary cards ── */}
      <div style={c.cardGrid}>
        <SummaryCard label="Total spent" value={usd(summary.totalSpent)} positive={false} />
        <SummaryCard label="Total income" value={usd(summary.totalIncome)} positive={true} />
        <SummaryCard label="Net balance" value={(summary.net >= 0 ? '+' : '') + usd(summary.net)} positive={summary.net >= 0} />
        <SummaryCard label="Transactions" value={String(txs.length)} sub="synced" />
      </div>

      {/* ── charts row ── */}
      <div style={c.chartRow}>
        <div style={c.panel}>
          <div style={c.panelHeader}>
            <h2 style={c.panelTitle}>Spending by category</h2>
            <p style={c.panelHint}>Click a bar to filter transactions</p>
          </div>
          {categoryBreakdown.length === 0
            ? <Empty text="No expense data yet." />
            : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#6b7280' }} width={140} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [usd(Number(v)), 'Spent']}
                    contentStyle={c.tooltipStyle}
                    cursor={{ fill: '#f3f4f6' }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} onClick={(e: any) => setDrillCat((e as CatItem).category.replace(/ /g, '_'))} style={{ cursor: 'pointer' }}>
                    {categoryBreakdown.map((_, i) => (
                      <rect key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>

        <div style={c.panel}>
          <div style={c.panelHeader}>
            <h2 style={c.panelTitle}>Month-over-month</h2>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>▲ Income</span>
              <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>▼ Expenses</span>
            </div>
          </div>
          {monthlyTrend.length === 0
            ? <Empty text="No trend data yet." />
            : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyTrend.map((m) => ({ ...m, month: fmtMonth(m.month) }))} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v) => usd(Number(v))} contentStyle={c.tooltipStyle} />
                  <Line type="monotone" dataKey="income" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} />
                  <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: '#ef4444' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* ── top expenses + recurring ── */}
      <div style={c.chartRow}>
        <div style={c.panel}>
          <div style={c.panelHeader}>
            <h2 style={c.panelTitle}>Top expenses this month</h2>
          </div>
          {topExpenses.length === 0
            ? <Empty text="No expenses this month." />
            : (
              <table style={c.table}>
                <thead>
                  <tr>{['Merchant', 'Category', 'Amount'].map((h) => <th key={h} style={c.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {topExpenses.map((e) => (
                    <tr key={e.transaction_id} style={c.tbRow} onClick={() => setDrillCat(e.category)}>
                      <td style={c.td}><span style={{ fontWeight: 500 }}>{e.merchant}</span><br /><span style={{ fontSize: 12, color: '#9ca3af' }}>{e.date}</span></td>
                      <td style={c.td}><Badge text={labelCat(e.category)} color="#6366f1" /></td>
                      <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{usd(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        <div style={c.panel}>
          <div style={c.panelHeader}>
            <h2 style={c.panelTitle}>Recurring expenses</h2>
          </div>
          {recurring.length === 0
            ? <Empty text="Patterns appear after a few months of data." icon="🔄" />
            : (
              <table style={c.table}>
                <thead>
                  <tr>{['Merchant', 'Typical', 'Times', 'Last seen'].map((h) => <th key={h} style={c.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {recurring.map((r) => (
                    <tr key={r.merchant} style={c.tbRow}>
                      <td style={{ ...c.td, fontWeight: 500 }}>{r.merchant}</td>
                      <td style={{ ...c.td, color: '#ef4444', fontWeight: 600 }}>{usd(r.typical_amount)}</td>
                      <td style={c.td}><Badge text={`×${r.count}`} color="#f59e0b" /></td>
                      <td style={{ ...c.td, color: '#9ca3af', fontSize: 13 }}>{r.last_seen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* ── transaction table ── */}
      <div style={{ ...c.panel, marginTop: 0 }}>
        <div style={c.panelHeader}>
          <div>
            <h2 style={c.panelTitle}>
              Transactions
              {activeCat && <span style={{ color: '#6366f1', marginLeft: 8 }}>· {labelCat(activeCat)}</span>}
            </h2>
            <p style={c.panelHint}>{total} transaction{total !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {activeCat && (
              <button onClick={() => { setDrillCat(null); setCatFilter('') }} style={c.clearBtn}>✕ Clear filter</button>
            )}
            <input placeholder="🔍  Search transactions…" value={search} onChange={(e) => setSearch(e.target.value)} style={c.searchInput} />
            {!drillCat && (
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={c.filterBtn}>
                <option value="">All categories</option>
                {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{labelCat(cat)}</option>)}
              </select>
            )}
            <AccountMultiSelect accounts={accounts} selected={acctFilter} onChange={setAcctFilter} />
          </div>
        </div>

        <table style={c.table}>
          <thead>
            <tr>
              {['Date', 'Description', 'Account', 'Category', 'Amount'].map((h) => (
                <th key={h} style={{ ...c.th, textAlign: h === 'Amount' ? 'right' : 'left' as any }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: 14 }}>No transactions match your filters</td></tr>
            )}
            {txs.map((t) => {
              const acct = accounts.find((a) => a.account_id === t.account_id)
              const isExpense = t.amount > 0
              return (
                <tr key={t.transaction_id} style={c.tbRow}>
                  <td style={{ ...c.td, color: '#9ca3af', fontSize: 13, whiteSpace: 'nowrap' as const }}>{t.date}</td>
                  <td style={c.td}>
                    <span style={{ fontWeight: 500 }}>{t.merchant_name ?? t.name}</span>
                    {t.pending && <span style={{ marginLeft: 6, fontSize: 11, color: '#f59e0b', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>pending</span>}
                  </td>
                  <td style={{ ...c.td, fontSize: 13 }}>
                    {acct ? <><span style={{ fontWeight: 500 }}>{acct.name}</span><span style={{ color: '#9ca3af', marginLeft: 4 }}>••{acct.mask}</span></> : '—'}
                  </td>
                  <td style={c.td}>
                    {editId === t.transaction_id ? (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <select value={editCat} onChange={(e) => setEditCat(e.target.value)} style={{ ...c.filterBtn, padding: '3px 6px', fontSize: 12 }}>
                          {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{labelCat(cat)}</option>)}
                        </select>
                        <button onClick={() => saveCategory(t.transaction_id)} style={c.saveBtn}>Save</button>
                        <button onClick={() => setEditId(null)} style={c.clearBtn}>✕</button>
                      </span>
                    ) : (
                      <span onClick={() => { setEditId(t.transaction_id); setEditCat(t.category ?? '') }} title="Click to recategorize" style={{ cursor: 'pointer' }}>
                        <Badge text={t.category ? labelCat(t.category) : '—'} color={isExpense ? '#6366f1' : '#059669'} />
                      </span>
                    )}
                  </td>
                  <td style={{ ...c.td, textAlign: 'right', fontWeight: 700, color: isExpense ? '#ef4444' : '#059669', whiteSpace: 'nowrap' as const }}>
                    {isExpense ? '−' : '+'}{usd(t.amount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Empty({ text, icon = '📭' }: { text: string; icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 14 }}>{text}</p>
    </div>
  )
}

// ── styles ───────────────────────────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", sans-serif'

const c: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f8fafc', fontFamily: FONT, padding: '0 0 48px' },

  header: {
    background: '#fff', borderBottom: '1px solid #e5e7eb',
    padding: '16px 32px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
  },
  logo: { width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' },
  headerSub: { margin: 0, fontSize: 12, color: '#9ca3af' },
  addBankBtn: {
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
    textDecoration: 'none', borderRadius: 8, padding: '8px 16px',
    fontSize: 14, fontWeight: 600, border: 'none',
  },

  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, padding: '24px 32px 0' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  cardLabel: { margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  cardValue: { margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' },
  cardSub: { margin: '4px 0 0', fontSize: 12, color: '#9ca3af' },

  chartRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '16px 32px 0' },
  panel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  panelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  panelTitle: { margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' },
  panelHint: { margin: 0, fontSize: 12, color: '#9ca3af' },

  tooltipStyle: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px', borderBottom: '1px solid #f3f4f6' },
  td: { padding: '12px 12px', fontSize: 14, borderBottom: '1px solid #f9fafb', verticalAlign: 'middle' },
  tbRow: { transition: 'background 0.1s', cursor: 'pointer' },

  searchInput: {
    border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px',
    fontSize: 13, outline: 'none', background: '#f9fafb', minWidth: 220,
  },
  filterBtn: {
    border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px',
    fontSize: 13, background: '#fff', cursor: 'pointer', display: 'flex',
    alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  },
  clearBtn: { background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#374151', fontWeight: 500 },
  saveBtn: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },

  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 260, zIndex: 50, padding: '6px 0',
  },
  dropdownItem: {
    display: 'flex', alignItems: 'center', padding: '10px 16px',
    cursor: 'pointer', gap: 4, fontSize: 13,
  },
  clearAllBtn: {
    width: '100%', background: 'none', border: 'none', borderTop: '1px solid #f3f4f6',
    padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontSize: 13,
    color: '#ef4444', fontWeight: 600, marginTop: 4,
  },
}
