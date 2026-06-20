import type { NextApiRequest, NextApiResponse } from 'next'
import { plaidClient } from '@/lib/plaid'
import { CountryCode, Products } from 'plaid'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    // Plaid production requires HTTPS for redirect_uri — omit it on localhost
    const redirectUri = baseUrl?.startsWith('https://') ? `${baseUrl}/onboarding` : undefined
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'user-1' },
      client_name: 'Budget Analytics',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(redirectUri && { redirect_uri: redirectUri }),
    })
    res.json({ link_token: response.data.link_token })
  } catch (err: any) {
    console.error('create-link-token error:', err?.response?.data ?? err)
    res.status(500).json({ error: 'Failed to create link token', detail: err?.response?.data ?? err?.message })
  }
}
