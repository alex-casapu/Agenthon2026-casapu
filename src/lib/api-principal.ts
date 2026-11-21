import type { Principal } from "./policy";
import { principalFromCookieHeader } from "./policy-config";

/** The acting principal, from the role switcher's cookie. null = god mode (debug tools). */
export const principalFromRequest = (req: Request): Principal | null => principalFromCookieHeader(req.headers.get("cookie"));
