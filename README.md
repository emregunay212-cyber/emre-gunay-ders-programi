# Emre Günay – Ders Programı

Bilnet Balıkesir Bilişim Teknolojileri ekibi için haftalık ders programı + lab müsaitlik + admin paneli.

## Özellikler

- 4 öğretmen için canlı program sayfası
- Laboratuvar boş saatleri (İ / O / L)
- Dark tema, mobil öncelikli
- Vercel'de statik + serverless API
- **Admin paneli** (geliştirilme aşamasında): öğretmen/ders CRUD, gelmeyen öğretmen yerine atama

## Kurulum (Vercel)

Site statik olarak çalışır; admin paneli için Redis (Upstash) ve env var'lar gerekli.

### 1. Redis ekle (ücretsiz)

Vercel dashboard → proje → **Storage** → **Create Database** → **Upstash Redis** (Marketplace) → Hobby tier seç. Kurulum sonrası `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN` otomatik inject olur.

### 2. Environment variables

Vercel dashboard → proje → **Settings** → **Environment Variables**:

| Ad | Değer | Nasıl |
|---|---|---|
| `ADMIN_PASSWORD` | Güçlü şifre | Seçeceğin şifre. 8+ karakter. |
| `JWT_SECRET` | Rastgele 32+ char | Terminalde: `openssl rand -hex 32` |

### 3. Deploy

```bash
git push
```

İlk istek otomatik olarak Redis'i seed'ler (`assets/data-*.js` dosyalarından).

### Local dev (opsiyonel)

```bash
npm install
cp .env.local.example .env.local   # içini doldur
npm run dev                        # vercel dev
```

## Yapı

```
/index.html           → ana sayfa (öğretmen listesi)
/emre.html            → öğretmen sayfaları
/halil.html
/imge.html
/yunus.html
/labs.html            → lab boş saatleri
/admin-login.html     → admin giriş
/admin.html           → admin paneli
/api/                 → serverless endpointler
  auth/login|logout|me
  schedules
  schedules/today
  teachers, teachers/[id]
  lessons, lessons/[id]
  absences, absences/[id]
  conflicts
/assets/              → CSS + JS (statik)
  data-*.js           → seed/fallback veri
  data-loader.js      → canlı API'den çeker, fallback vardır
  app.js, labs.js     → render
  admin.js, admin.css → admin UI
```

## Veri akışı

1. Public sayfalar `/api/schedules/today` çağırır → efektif ders listesi (yoklama devirleri uygulanmış)
2. API cache'i 60sn, admin edit'i ~1dk içinde yayına yansır
3. API erişilemezse `assets/data-*.js` fallback devreye girer → site yine çalışır
```
