---
inclusion: manual
---

# ⚡ Performance Guideline (Steering)

Dokumen ini adalah **standar performa WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Fokus utama:

* Core Web Vitals (LCP, INP, CLS)
* TTFB & server latency
* bundle size & client cost
* data fetching & caching
* rendering strategy (RSC/SSR/CSR/ISR)

Tujuan:

* halaman cepat dirender
* interaksi responsif
* penggunaan resource efisien
* siap skala production

---

# 🎯 Target & KPI (WAJIB)

* LCP < **2.5s** (good)
* INP < **200ms** (good)
* CLS < **0.1**
* TTFB < **500ms** (target ideal, tergantung infra)
* JS bundle (initial) seminimal mungkin (hindari > 200–300KB gzipped per route jika bisa)

---

# ⚖️ Prinsip Utama

## 1. Server-first Rendering

Gunakan **React Server Components (RSC)** sebagai default untuk mengurangi JS di client.

## 2. Minimize Client Work

Hanya tandai `use client` jika benar-benar perlu (interaksi).

## 3. Data Efficient

Ambil data **sekali**, cache dengan benar, dan hindari over-fetching.

## 4. Progressive Enhancement

Render konten utama cepat, interaksi menyusul (streaming/suspense).

## 5. Measure Everything

Performa harus **diukur**, bukan diasumsikan.

---

# 🧱 Rendering Strategy (Next.js App Router)

## Default

* Gunakan **RSC** untuk data-heavy / content-heavy

## Gunakan SSR (dynamic)

Jika:

* data sangat dinamis
* butuh per-request personalization

## Gunakan SSG/ISR

Jika:

* data relatif statis
* cocok untuk caching (catalog, landing)

## Gunakan CSR

Jika:

* interaksi kompleks di client
* data sangat user-specific setelah mount

## Rule

* Jangan default ke CSR tanpa alasan
* Kombinasikan RSC + Client Component secara selektif

---

# 🧠 Data Fetching & Caching

## Rule 1 — Gunakan Fetch Caching

```ts
fetch(url, { cache: 'force-cache' })
fetch(url, { next: { revalidate: 60 } })
```

## Rule 2 — Hindari Duplicate Fetch

* gunakan satu source of truth
* manfaatkan React cache / Next cache

## Rule 3 — React Query (Client)

* gunakan untuk state server di client
* atur `staleTime`, `cacheTime`, `retry` dengan bijak

## Rule 4 — Debounce/Throttle

* input search / filter harus di-debounce

---

# 📦 Bundle Optimization

## Rule 1 — Minimalkan JS Client

* kurangi `use client`
* pindahkan logic ke server bila memungkinkan

## Rule 2 — Code Splitting

* gunakan dynamic import untuk komponen berat

```ts
const HeavyComponent = dynamic(() => import('./HeavyComponent'))
```

## Rule 3 — Tree Shaking

* import spesifik, hindari import seluruh library

❌

```ts
import _ from 'lodash'
```

✅

```ts
import debounce from 'lodash/debounce'
```

## Rule 4 — Image Optimization

* gunakan `next/image`
* set `width`, `height`
* gunakan lazy loading default

---

# ⚡ Rendering Performance

## Rule 1 — Hindari Re-render Tidak Perlu

* gunakan memoization (`useMemo`, `useCallback`) bila relevan
* pecah komponen besar

## Rule 2 — Key List Stabil

* gunakan key unik dan stabil

## Rule 3 — Suspense & Streaming

* gunakan `Suspense` untuk loading state
* manfaatkan streaming UI untuk RSC

---

# 🧮 Computation Efficiency

## Rule

* hindari perhitungan berat di render
* pindahkan ke:

  * server
  * memoized function

---

# 🌐 Network Optimization

## Rule 1 — Kurangi Request

* batch request jika memungkinkan
* hindari waterfall

## Rule 2 — Compression

* gunakan gzip/brotli (handled by platform/infra)

## Rule 3 — CDN

* asset statis via CDN

---

# 🧱 API & BFF Performance

## Rule 1 — Timeout

* semua external call harus punya timeout

## Rule 2 — Parallel Request

* gunakan `Promise.all` jika tidak ada dependency antar call

## Rule 3 — Idempotency & Retry

* retry hanya untuk operasi aman

---

# 📊 Measurement & Tooling

## Tools

* Vercel Analytics / Speed Insights
* Lighthouse
* Web Vitals
* Grafana (via metrics)

## Rule

* ukur sebelum dan sesudah perubahan
* catat baseline

---

# 🧪 Performance Testing

## Wajib untuk fitur kritikal:

* simulasi load ringan
* uji response time
* uji bottleneck

---

# 📱 Mobile First

## Rule

* optimasi untuk device low-end
* hindari bundle besar
* minimalisasi blocking script

---

# 🚫 Anti-Pattern

❌ terlalu banyak `use client`
❌ fetch berulang tanpa cache
❌ bundle besar tanpa splitting
❌ render blocking component berat
❌ tidak menggunakan image optimization
❌ waterfall API call
❌ perhitungan berat di render

---

# ✅ Best Practice

* gunakan RSC sebagai default
* minimalkan client JS
* gunakan caching dengan benar
* gunakan dynamic import
* optimalkan image
* ukur performa secara kontinu

---

# ⚠️ Enforcement (Kiro)

* WAJIB mempertimbangkan performa di setiap fitur
* WAJIB menghindari anti-pattern
* WAJIB menggunakan caching strategy
* WAJIB menjaga bundle tetap kecil

Jika ada konflik antara kecepatan development vs performa:
👉 pilih solusi yang **scalable & efisien**

---

# 🏁 Kesimpulan

Performa adalah faktor utama user experience.

Dengan mengikuti guideline ini:

* aplikasi lebih cepat
* UX lebih baik
* biaya infrastruktur lebih efisien
* sistem siap skala besar
