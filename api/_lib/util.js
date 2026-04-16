// Small helpers for API handlers.

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Fallback: read stream
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

export function methodNotAllowed(res, allowed = "GET") {
  res.setHeader("Allow", allowed);
  res.status(405).json({ error: "Method not allowed" });
}

export function badRequest(res, msg = "Bad request") {
  res.status(400).json({ error: msg });
}

export function serverError(res, err) {
  const code = err && err.code;
  if (code === "KV_NOT_CONFIGURED") {
    return res.status(503).json({ error: "KV yapılandırılmamış. Vercel dashboard → Storage → KV ekleyin." });
  }
  if (code === "JWT_SECRET_MISSING") {
    return res.status(503).json({ error: "JWT_SECRET env var tanımlı değil." });
  }
  if (code === "ADMIN_PASSWORD_MISSING") {
    return res.status(503).json({ error: "ADMIN_PASSWORD env var tanımlı değil." });
  }
  console.error("API error:", err);
  return res.status(500).json({ error: "Sunucu hatası" });
}

// Validate incoming lesson payload and normalize
export function validateLesson(input) {
  const errs = [];
  const out = {};

  if (!input || typeof input !== "object") return { errs: ["Invalid payload"] };

  if (!input.teacherId || typeof input.teacherId !== "string") errs.push("teacherId gerekli");
  else out.teacherId = input.teacherId;

  const gun = Number(input.gun);
  if (!Number.isInteger(gun) || gun < 1 || gun > 5) errs.push("gun 1-5 olmalı");
  else out.gun = gun;

  const TIME_RE = /^\d{2}:\d{2}$/;
  if (!TIME_RE.test(input.bas)) errs.push("bas HH:MM formatında olmalı");
  else out.bas = input.bas;
  if (!TIME_RE.test(input.bit)) errs.push("bit HH:MM formatında olmalı");
  else out.bit = input.bit;

  if (out.bas && out.bit) {
    const toMin = s => { const [h,m] = s.split(":").map(Number); return h*60+m; };
    if (toMin(out.bit) <= toMin(out.bas)) errs.push("bit, bas'tan sonra olmalı");
  }

  if (typeof input.ad !== "string" || !input.ad.trim()) errs.push("ad gerekli");
  else out.ad = input.ad.trim();

  const KADEME = new Set(["anaokulu","ilkokul","ortaokul","lise","toplanti","amazing"]);
  if (!KADEME.has(input.kademe)) errs.push("kademe geçersiz");
  else out.kademe = input.kademe;

  const LAB = new Set(["", "i", "O", "L"]);
  const lab = input.lab == null ? "" : String(input.lab);
  if (!LAB.has(lab)) errs.push("lab geçersiz (i/O/L/boş)");
  else out.lab = lab;

  return { errs, out };
}

export function validateTeacher(input, existing = []) {
  const errs = [];
  const out = {};
  if (!input || typeof input !== "object") return { errs: ["Invalid payload"] };

  if (typeof input.name !== "string" || !input.name.trim()) errs.push("İsim gerekli");
  else out.name = input.name.trim();

  if (typeof input.slug !== "string" || !/^[a-z0-9-]+$/.test(input.slug)) errs.push("slug a-z, 0-9, - içerebilir");
  else out.slug = input.slug;

  if (existing.some(t => t.slug === out.slug && t.id !== input.id)) errs.push("Bu slug zaten kullanılıyor");

  if (typeof input.meta === "string") out.meta = input.meta.trim();

  if (input.email != null) {
    const email = String(input.email).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.push("Geçersiz e-posta adresi");
    } else {
      out.email = email;
    }
  }

  return { errs, out };
}
