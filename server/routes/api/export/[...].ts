import { proxyRequest } from 'h3'

export default defineEventHandler(async (event) => {
  const base = process.env.EXPORT_URL ?? 'http://localhost:18005'
  const path = event.path.replace('/api/export', '')
  return proxyRequest(event, `${base}${path}`)
})
