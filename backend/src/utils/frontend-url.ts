import { Request } from 'express';
import { env } from '../config/env';

function normalizarBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function obterBasePathDaUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname || '/';
    return pathname === '/' ? '' : pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function construirBasePathDoReferer(req: Request): string {
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';

  if (!referer) {
    return '';
  }

  try {
    const url = new URL(referer);
    const pathname = url.pathname || '/';
    const ultimoSlash = pathname.lastIndexOf('/');
    const basePath = ultimoSlash >= 0 ? pathname.slice(0, ultimoSlash + 1) : '/';
    return basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function construirRedirectReset(req: Request): string {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const fallbackUrl = env.FRONTEND_URL || env.FRONTEND_ORIGINS[0];
  const baseUrl = normalizarBaseUrl(origin || fallbackUrl);
  const basePath = construirBasePathDoReferer(req) || obterBasePathDaUrl(fallbackUrl);
  return `${baseUrl}${basePath}/reset-password.html`;
}
