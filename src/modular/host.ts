import { Problem } from '../errors.js';
import type { Principal } from '../v3-rules.js';
import { handleModularRequest, response } from './http.js';
import type { StateStore } from './model.js';
import { PaystackProvider } from './paystack.js';
import type { FxProvider } from './fx.js';
import type { MediaStore } from './media.js';
import type { MarketplaceTransport } from './marketplace.js';
import { ModularSaasService } from './service.js';

export interface HostBindings {
  store: StateStore; origin: string;
  resolvePrincipal(request: Request): Promise<Principal | null>;
  verifyCsrf(request: Request, actor: Principal): Promise<boolean>;
  getCsrfToken(request: Request, actor: Principal): Promise<string>;
  verifyStaffSubject(subjectId: string): boolean | Promise<boolean>;
  payments?: PaystackProvider;
  mediaStore?: MediaStore;
  fxProvider?: FxProvider;
  marketplaceTransport?: MarketplaceTransport;
}
/** Instantiate once per process and export GET/POST from a Next.js Node route. */
export function mountGreenRevSaas(bindings: HostBindings) {
  const service = new ModularSaasService(bindings.store, { verifyStaffSubject: bindings.verifyStaffSubject,
    fxProvider: bindings.fxProvider, mediaStore: bindings.mediaStore, marketplaceTransport: bindings.marketplaceTransport, paymentProvider: bindings.payments });
  const handler = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/webhooks/paystack')) return bindings.payments
      ? bindings.payments.webhook(request, service) : response(503, { error: 'Payment provider unavailable' });
    if (path.endsWith('/session') && request.method === 'GET') {
      try {
        const actor = await bindings.resolvePrincipal(request);
        if (!actor) throw new Problem('Authentication required', 401);
        return response(200, { csrf: await bindings.getCsrfToken(request, actor), demo: false, profile: '', profiles: [] });
      } catch { return response(401, { error: 'Authentication required' }); }
    }
    return handleModularRequest(request, { ...bindings, service });
  };
  return { GET: handler, POST: handler, service };
}
