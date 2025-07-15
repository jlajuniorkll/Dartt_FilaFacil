import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

// Define quais caminhos são públicos e não exigem autenticação.
// A página inicial '/' agora é protegida por padrão.
const PUBLIC_PATHS = ['/login', '/request', '/display'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  // Verifica se o caminho solicitado é um dos caminhos públicos definidos.
  const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));

  // Se o caminho for público, permite o acesso sem verificar a autenticação.
  if (isPublicPath) {
    return NextResponse.next();
  }
  
  // Se o caminho for protegido (não público) E não houver cookie de sessão,
  // redireciona o usuário para a página de login.
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Se o usuário tiver um cookie de sessão e estiver acessando uma rota protegida,
  // permite que a solicitação prossiga. O controle de acesso mais granular (admin vs. operador)
  // é tratado no lado do cliente com o AuthProvider.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Faz a correspondência de todos os caminhos de solicitação, exceto aqueles que começam com:
     * - api (rotas de API)
     * - _next/static (arquivos estáticos)
     * - _next/image (arquivos de otimização de imagem)
     * - favicon.ico (arquivo favicon)
     * - notification.mp3 (arquivo de som)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|notification.mp3).*)',
  ],
};
