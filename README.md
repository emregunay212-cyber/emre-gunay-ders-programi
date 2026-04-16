# Emre Günay – Ders Programı

Bilnet Balıkesir Bilişim Teknolojileri ekibi için haftalık ders programı + lab müsaitlik + admin paneli + bildirimli onay sistemi.

## Özellikler

- 4 öğretmen için canlı program sayfası
- Laboratuvar boş saatleri (İ / O / L)
- Admin paneli: öğretmen/ders CRUD, yoklama, analiz
- **Bildirimli ders devri** — yedek öğretmene push + email, onay mekanizması, 30 dk timeout ile admin eskalasyonu
- Dark tema, mobil öncelikli
- Vercel'de statik + serverless API

## Kurulum (Vercel)

### 1. Upstash Redis ekle (ücretsiz)

Vercel dashboard → proje → **Storage** → **Create Database** → **Upstash Redis** → Hobby.

### 2. Resend hesabı aç (mail için, ücretsiz)

- https://resend.com → Sign up (GitHub veya Google)
- **API Keys** sekmesi → **Create API Key** → kopyala
- Ücretsiz tier: 100 mail/gün, 3000/ay. Test için yeterli.

### 3. VAPID key çifti üret (push için)

Terminalde:

```bash
npx web-push generate-vapid-keys --json
```

Çıktı:
```json
{"publicKey":"BN...","privateKey":"..."}
```

### 4. Environment Variables

Vercel dashboard → proje → **Settings** → **Environment Variables**:

| Ad | Değer | Kaynak |
|---|---|---|
| `ADMIN_PASSWORD` | Belirleyeceğin şifre | Sen |
| `JWT_SECRET` | 32+ rastgele hex | `openssl rand -hex 32` |
| `RESEND_API_KEY` | `re_...` | Resend dashboard |
| `VAPID_PUBLIC_KEY` | `BN...` | Yukarıdaki komut |
| `VAPID_PRIVATE_KEY` | `...` | Yukarıdaki komut |
| `VAPID_SUBJECT` | `mailto:emregunay@balikesir.bilnet.k12.tr` | Senin mail'in |
| `FROM_EMAIL` | `BT Ders Programı <onboarding@resend.dev>` | Default Resend sender (kendi domain'in varsa değiştir) |
| `APP_URL` | `https://emre-gunay-ders-programi.vercel.app` | Deploy URL'in |
| `ADMIN_TEACHER_SLUG` | `emre` | Admin'in teacher slug'ı |
| `CRON_SECRET` | Rastgele string | Cron manuel test için (opsiyonel) |

KV env var'ları otomatik inject olur (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).

### 5. Deploy

```bash
git push
```

Vercel otomatik deploy eder. Cron jobs `vercel.json`'daki tanımla aktifleşir.

### 6. İlk kullanım

1. `/admin-login.html` → şifrenle gir
2. Öğretmenler sekmesi → her öğretmenin e-postasını ekle
3. Her öğretmen kendi sayfasını (örn. `/emre.html`) telefonundan açar → "🔔 Bildirim aç" → izin ver
4. İlk devir testi: Admin → Yoklama → bir öğretmeni "yok" yap → dersini başka hocaya devret → Kaydet
5. Yedek öğretmene push + email gider, `/onay.html` linki ile onaylar/reddeder

## Bildirim akışı

1. **Admin devir oluşturur** → yedek öğretmenin push+mail'ine onay linki gider
2. **Öğretmen onaylar** → ders yedek'in programına işler, orijinalde pasife düşer
3. **Öğretmen reddeder** → admin'e push+mail bildirilir, devir aktif olmaz
4. **30 dk içinde yanıt yoksa** → admin'e push+mail bildirilir, devir "bekleyen" olarak kalır, admin karar verir

## Local dev (opsiyonel)

```bash
npm install
cp .env.local.example .env.local   # içini doldur
npm run dev                        # vercel dev
```

## Yapı

```
/index.html           → ana sayfa (canlı lab + öğretmen kartları)
/emre.html            → öğretmen sayfaları (+ subscribe toggle + pending card)
/halil.html /imge.html /yunus.html
/labs.html            → lab boş saatleri
/sinif.html           → sınıf ara
/kiosk.html           → hol ekranı
/admin-login.html     → admin giriş
/admin.html           → admin paneli
/onay.html            → ders devri onay sayfası (mail/push linkinden açılır)
/sw.js                → service worker (push + notification click)
/manifest.webmanifest → PWA manifest

/api/
  auth/login|logout|me
  schedules, schedules/today
  teachers, teachers/[id]
  lessons, lessons/[id]
  absences (POST → bildirim gönderir), absences/[id]
  approve (GET → detay, POST → onayla/reddet)
  push/vapid-key, push/subscribe, push/unsubscribe
  cron/check-pending (her 5 dk çalışır, 30 dk timeout'u kontrol eder)
  _lib/
    kv, auth, util, seed, seedData, substitute
    notify (web-push + resend)
    approval (JWT token'ları)
```

## Güvenlik

- Admin endpoints `requireAdmin()` ile korunur (httpOnly cookie JWT)
- Cron endpoint `x-vercel-cron` header'ı veya `Authorization: Bearer $CRON_SECRET` ister
- Push/email onay token'ları JWT ile imzalı, 72 saat geçerli, tek amaçlı (`purpose: "approve"`)
- Herkes bir öğretmen adına subscribe olabilir (küçük güvenilir ekip için makul)
