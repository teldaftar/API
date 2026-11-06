import type { Response } from 'express';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

interface LoginPage {
  signedRequest: string;
  redirectUri: string;
  error?: string;
}

/** The page never echoes the client's self-declared name: it is unverified. */
export function sendLoginPage(res: Response, page: LoginPage): void {
  const redirect = new URL(page.redirectUri);
  const isLoopback = redirect.protocol === 'http:';
  // Browsers apply `form-action` to the redirect after submit too.
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirect.origin}; frame-ancestors 'none'; base-uri 'none'`,
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teldaftar bazasiga kirish</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #f4f4f5; color: #18181b; margin: 0; }
  main { max-width: 26rem; margin: 3rem auto; padding: 1.5rem; background: #fff; border-radius: .75rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .75rem; }
  p { margin: 0 0 1rem; }
  label { display: block; font-weight: 600; margin-bottom: .25rem; }
  input { box-sizing: border-box; width: 100%; padding: .6rem; font: inherit; border: 1px solid #a1a1aa; border-radius: .5rem; }
  button { width: 100%; margin-top: 1rem; padding: .7rem; font: inherit; font-weight: 600; color: #fff; background: #18181b; border: 0; border-radius: .5rem; cursor: pointer; }
  .warning { padding: .75rem; background: #fef3c7; border-radius: .5rem; }
  .error { padding: .75rem; color: #991b1b; background: #fee2e2; border-radius: .5rem; }
</style>
</head>
<body>
<main>
  <h1>Teldaftar bazasiga kirish</h1>
  <p>Ruxsat bersangiz, <strong>${escapeHtml(redirect.hostname)}</strong> <strong>barcha do'konlar</strong> ma'lumotini o'qiy oladi.</p>
  ${isLoopback ? `<p class="warning">Bu so'rov shu kompyuterdagi dastur uchun. Uni Claude Code'dan o'zingiz boshlamagan bo'lsangiz, parolni kiritmang.</p>` : ''}
  ${page.error ? `<p class="error" role="alert">${escapeHtml(page.error)}</p>` : ''}
  <form method="post" action="/mcp-login">
    <input type="hidden" name="request" value="${escapeHtml(page.signedRequest)}">
    <label for="password">Admin paroli</label>
    <input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
    <button type="submit">Ruxsat berish</button>
  </form>
</main>
</body>
</html>`);
}
