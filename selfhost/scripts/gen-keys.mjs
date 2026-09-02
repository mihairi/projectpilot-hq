// Generates the signing secret and the two API keys the app needs.
//   bun run selfhost/scripts/gen-keys.mjs            (new random secret)
//   bun run selfhost/scripts/gen-keys.mjs <secret>   (keys for an existing secret)
import { createHmac, randomBytes } from "node:crypto";

const secret = process.argv[2] ?? randomBytes(32).toString("base64url");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function sign(role) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    role,
    iss: "supabase",
    iat: now,
    exp: now + 60 * 60 * 24 * 365 * 10,
  })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${sign("anon")}`);
console.log(`SERVICE_ROLE_KEY=${sign("service_role")}`);
