import { NextRequest, NextResponse } from 'next/server';

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'pharmasaas.com';

/**
 * Resolves the tenant subdomain (alshifa.pharmasaas.com → "alshifa")
 * and forwards it to pages via the x-tenant-subdomain header so the
 * login page can show tenant branding.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0];

  let subdomain = '';
  if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    subdomain = hostname.slice(0, -(PLATFORM_DOMAIN.length + 1));
  } else if (hostname.endsWith('.localhost')) {
    subdomain = hostname.slice(0, -'.localhost'.length);
  }
  if (subdomain === 'www' || subdomain === 'app') {
    subdomain = '';
  }

  const requestHeaders = new Headers(request.headers);
  if (subdomain) {
    requestHeaders.set('x-tenant-subdomain', subdomain);
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (subdomain) {
    response.cookies.set('tenant-subdomain', subdomain, { path: '/' });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
