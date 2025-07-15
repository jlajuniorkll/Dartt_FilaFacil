import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

const PUBLIC_PATHS = ['/login', '/request', '/display'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));

  // If it's a public path, let them through.
  if (isPublicPath) {
    return NextResponse.next();
  }
  
  // If it's a protected path and there's no session cookie, redirect to login.
  if (!sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If the user has a session cookie and is trying to access a protected route, let them through.
  // Finer-grained role-based access control will be handled by client-side logic in pages and server-side checks in actions.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - notification.mp3 (sound file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|notification.mp3).*)',
  ],
};
