import type { NextRequest } from 'next/server'

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    const expectedHost = request.headers.get('host') ?? request.nextUrl.host
    return new URL(origin).host === expectedHost
  } catch {
    return false
  }
}
