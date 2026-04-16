import { getVapidPublicKey } from "../_lib/notify.js";
import { methodNotAllowed } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: "VAPID_PUBLIC_KEY env var tanımlı değil" });
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  res.status(200).json({ publicKey: key });
}
