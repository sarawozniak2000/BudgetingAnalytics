import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import type { PlaidLinkOnSuccess } from 'react-plaid-link'
import { useRouter } from 'next/router'

type Account = { name: string; mask: string | null; type: string }
type Status = 'idle' | 'fetching-token' | 'ready' | 'oauth-redirect' | 'exchanging' | 'success' | 'error'

const LINK_TOKEN_KEY = 'plaid_link_token'

export default function Onboarding() {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // On mount: check if we're returning from an OAuth redirect
  useEffect(() => {
    const oauthStateId = new URLSearchParams(window.location.search).get('oauth_state_id')
    if (oauthStateId) {
      const stored = sessionStorage.getItem(LINK_TOKEN_KEY)
      if (stored) {
        setLinkToken(stored)
        setStatus('oauth-redirect')
      }
    }
  }, [])

  const fetchLinkToken = async () => {
    setStatus('fetching-token')
    try {
      const res = await fetch('/api/create-link-token', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      sessionStorage.setItem(LINK_TOKEN_KEY, data.link_token)
      setLinkToken(data.link_token)
      setStatus('ready')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    sessionStorage.removeItem(LINK_TOKEN_KEY)
    // Clear oauth_state_id from URL
    router.replace('/onboarding', undefined, { shallow: true })
    setStatus('exchanging')
    try {
      const res = await fetch('/api/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? data.error)
      setAccounts(data.accounts)
      setStatus('success')
    } catch (e: any) {
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [router])

  const receivedRedirectUri =
    status === 'oauth-redirect' ? window.location.href : undefined

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess,
    receivedRedirectUri,
  })

  // Auto-open when returning from OAuth redirect
  useEffect(() => {
    if (status === 'oauth-redirect' && ready) open()
  }, [status, ready, open])

  const isLoading = status === 'fetching-token' || status === 'exchanging'

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Budget Analytics</h1>
        <p style={styles.subtitle}>Connect your bank to start syncing transactions.</p>

        {status === 'success' ? (
          <div>
            <p style={styles.success}>✓ Connected successfully!</p>
            <ul style={styles.accountList}>
              {accounts.map((a) => (
                <li key={a.name + a.mask} style={styles.accountItem}>
                  <span>{a.name}</span>
                  {a.mask && <span style={styles.mask}>••{a.mask}</span>}
                </li>
              ))}
            </ul>
            <p style={styles.note}>
              Nightly sync is scheduled — your transactions will appear on the dashboard after the first run.
            </p>
            <a href="/dashboard" style={styles.dashLink}>Go to dashboard →</a>
          </div>
        ) : (
          <>
            <button
              onClick={status === 'ready' ? () => open() : fetchLinkToken}
              disabled={isLoading || status === 'oauth-redirect' || (status === 'ready' && !ready)}
              style={{ ...styles.button, opacity: isLoading || status === 'oauth-redirect' ? 0.6 : 1 }}
            >
              {status === 'fetching-token'
                ? 'Preparing...'
                : status === 'oauth-redirect'
                ? 'Resuming...'
                : status === 'exchanging'
                ? 'Connecting...'
                : status === 'ready'
                ? 'Open Plaid Link'
                : 'Connect bank account'}
            </button>
            {status === 'error' && (
              <p style={styles.error}>Error: {errorMsg || 'Something went wrong. Check the server logs.'}</p>
            )}
          </>
        )}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '48px 40px',
    maxWidth: 440,
    width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  title: { margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: '#111' },
  subtitle: { margin: '0 0 32px', color: '#666', fontSize: 15 },
  button: {
    width: '100%',
    padding: '14px 0',
    fontSize: 15,
    fontWeight: 600,
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  success: { color: '#16a34a', fontWeight: 600, marginBottom: 16 },
  accountList: { listStyle: 'none', padding: 0, margin: '0 0 16px' },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0',
    fontSize: 14,
  },
  mask: { color: '#999', fontFamily: 'monospace' },
  note: { fontSize: 13, color: '#888', marginTop: 16 },
  error: { color: '#dc2626', marginTop: 12, fontSize: 14 },
  dashLink: { display: 'inline-block', marginTop: 16, color: '#0070f3', fontWeight: 600, textDecoration: 'none', fontSize: 14 },
}
