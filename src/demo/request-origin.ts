import { requireCondition as check } from '../errors.js';

/** Next can normalise request.url to localhost even when the browser uses 127.0.0.1.
 * Only the local demo uses the validated Host header; production retains its pinned origin.
 */
export function resolveDemoOrigin(request: Request, configured?: string): string {
  const url = new URL(request.url);
  let origin: URL;
  try {
    origin = configured ? new URL(configured) : new URL(url.protocol + '//' + (request.headers.get('Host') || url.host));
  } catch { check(false, 'Demo address refused', 403); }
  check(['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password
    && origin.pathname === '/' && !origin.search && !origin.hash, 'Demo address refused', 403);
  if (!configured) {
    check(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      && origin.port === url.port, 'Demo address must be local and use this server port', 403);
  }
  return origin.origin;
}
