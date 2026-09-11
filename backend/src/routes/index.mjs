/** API 路由注册中心：按业务域拆分为多个路由模块 */
import { registerCatalogRoutes } from './catalog.mjs';
import { registerCartRoutes } from './cart.mjs';
import { registerOrderRoutes } from './order.mjs';
import { registerUserRoutes } from './user.mjs';
import { registerTraceRoutes } from './trace.mjs';
import { registerAiRoutes } from './ai.mjs';
import { registerAdminRoutes } from './admin.mjs';
import { registerDevRoutes } from './dev.mjs';

export function registerRoutes(route) {
  registerCatalogRoutes(route);
  registerCartRoutes(route);
  registerOrderRoutes(route);
  registerUserRoutes(route);
  registerTraceRoutes(route);
  registerAiRoutes(route);
  registerAdminRoutes(route);
  registerDevRoutes(route);
}

export default { registerRoutes };
