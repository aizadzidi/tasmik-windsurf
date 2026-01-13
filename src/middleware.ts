import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl

  // Check if this is an auth-related redirect from Supabase
  const hasAuthCode = searchParams.has('code')
  const hasTokenHash = searchParams.has('token_hash')
  const hasAccessToken = searchParams.has('access_token')
  const authType = searchParams.get('type')
  const isRecovery = authType === 'recovery'

  // If we have auth parameters and we're not already on reset-password
  if (isRecovery && (hasAuthCode || hasTokenHash || hasAccessToken) && pathname !== '/reset-password') {
    console.log('Middleware: Detected auth redirect, redirecting to reset-password')
    console.log('Auth params found:', { hasAuthCode, hasTokenHash, hasAccessToken, authType })
    
    // Build the reset-password URL with all parameters
    const resetUrl = new URL('/reset-password', request.url)
    
    // Copy all search parameters to the reset URL
    searchParams.forEach((value, key) => {
      resetUrl.searchParams.set(key, value)
    })
    
    // Also copy hash parameters if they exist
    if (request.nextUrl.hash) {
      resetUrl.hash = request.nextUrl.hash
    }
    
    return NextResponse.redirect(resetUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Exclude API routes, Next internal assets, and any files with extensions
  matcher: [
    '/((?!api|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|avif|css|js|map)$).*)',
  ],
}
