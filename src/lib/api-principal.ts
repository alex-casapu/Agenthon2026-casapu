import { principalFromCookieHeader, type Principal } from "./policy";

/** The acting principal, from the role switcher's cookie. null = god mode (debug tools). */
export const principalFromRequest = (req: Request): Principal | null => principalFromCookieHeader(req.headers.get("cookie"));
