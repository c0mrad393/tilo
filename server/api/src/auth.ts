import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";

/* Who is asking. The app sends the Supabase session's access token as a bearer token; Auth
   signs it with the shared JWT secret, so checking the signature here is enough, with no call
   to Auth. Only signed-in members get through: the anon and service keys are refused. */

export interface Member {
  id: string;
  email: string;
}

export type AuthEnv = { Variables: { member: Member } };

export const signedIn = (secret: string) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    try {
      const claims = await verify(token, secret, { alg: "HS256", aud: "authenticated" });
      if (claims.role !== "authenticated" || typeof claims.sub !== "string") throw new Error("not a member");
      c.set("member", { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" });
    } catch {
      return c.json({ error: "Sign in first." }, 401);
    }
    await next();
  });
