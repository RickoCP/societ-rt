---
inclusion: always
---

# 🧩 Code Patterns — Clean Architecture (Steering)

Dokumen ini adalah **standar implementasi WAJIB** untuk seluruh developer dan AI Agent (Kiro).

Semua kode HARUS mengikuti pola ini agar:

* konsisten
* scalable
* mudah di-maintain
* sesuai Clean Architecture

---

# ⚠️ Prinsip Penting

* Core = business logic ONLY
* Infrastructure = implementation ONLY
* Presentation = UI ONLY
* Tidak boleh ada cross-layer violation

---

# 1. Entity (Domain Model)

Entity adalah representasi domain.

## Rule:

* Pure TypeScript (no dependency)
* Tidak boleh ada logic kompleks
* Tidak boleh ada API format

```ts
export interface NamaEntity {
  id: string;
  name: string;
  status: boolean;
}
```

---

# 2. Repository Interface (CORE)

## Rule:

* HANYA interface
* Return type WAJIB `DomainResult<T>`

```ts
export interface NamaRepository {
  getData: (
    auth: string,
    body: NamaRequest
  ) => Promise<DomainResult<NamaEntity>>;
}
```

---

# 3. Repository Implementation (INFRASTRUCTURE)

🚨 PERUBAHAN PENTING:

❌ DILARANG di core:

```
core/domains/.../repositories/implementations
```

✅ WAJIB di:

```
infrastructure/repositories/[domain]/
```

## Rule:

* Semua API call di sini
* Tidak boleh ada business logic
* WAJIB pakai `handleApiRequest`

```ts
export const NamaRepositoryImpl = ({ apiRequest }: { apiRequest: HttpProtocol }): NamaRepository => {
  return {
    getData: (auth, body) =>
      handleApiRequest({
        apiRequest,
        endpoint: NamaEndpoint.getData,
        method: 'post',
        reqBody: body,
        headers: { Authorization: auth },
        mapper: mapNamaResponse,
        errorMessage: 'Get Data Failed',
      }),
  };
};
```

---

# 4. DTO (Request / Response)

DTO = format dari API (bukan domain)

## Rule:

* Nama mengikuti backend
* Tidak boleh dipakai langsung di UI

```ts
export interface NamaResponse {
  raw_field_1: string;
  raw_field_2: number;
}
```

---

# 5. Mapper (WAJIB)

Mapping:

```
DTO → Domain Entity
```

## Rule:

* 1 file = 1 mapper
* Tidak boleh mapping di UI

```ts
export function mapNamaResponse(res: NamaResponse): NamaEntity {
  return {
    id: res.raw_field_1,
    name: res.raw_field_2,
  };
}
```

---

# 6. API Endpoint Definition

## Rule:

* Boleh di core (contract)
* Tidak boleh dipanggil langsung di UI

```ts
export const NamaEndpoint = {
  getData: `${process.env.NEXT_PUBLIC_API_HOST}/endpoint`,
};
```

---

# 7. Use Case (CORE)

## Rule:

* Factory function (DI friendly)
* Tidak boleh tahu HTTP / storage
* Semua business logic di sini

🚨 FIX:

* ❌ Jangan pakai token global
* ✅ Token dari parameter / dependency

```ts
export const NamaUseCaseImpl = ({
  namaRepository,
}: {
  namaRepository: NamaRepository;
}): NamaUseCase => ({
  execute: async ({ token, params }) => {
    const result = await namaRepository.getData(`Bearer ${token}`, params);
    return handleDomainResult(result);
  },
});
```

---

# 8. DI Registration (WAJIB)

## Rule:

* Semua dependency HARUS lewat DI
* Tidak boleh `new` manual

```ts
container.register({
  namaRepository: asFunction(NamaRepositoryImpl).singleton(),
});

container.register({
  namaUseCase: asFunction(NamaUseCaseImpl).singleton(),
});

container.register({
  useNamaViewModel: asFunction(NamaViewModel),
});
```

---

# 9. ViewModel (PRESENTATION)

## Rule:

* Hanya orchestration
* Tidak boleh business logic
* Gunakan React Query

```ts
const NamaViewModel = ({ namaUseCase }: Props) => {
  const { mutate, isPending } = useMutation({
    mutationFn: (params) => namaUseCase.execute(params),
  });

  return { mutate, isPending };
};
```

🚫 DILARANG:

```ts
if (amount > 1000000) { ... }
```

---

# 10. Screen

## Rule:

* Tidak boleh logic
* Hanya render + call ViewModel

```ts
const vm = DI.resolve('useNamaViewModel');
```

---

# 11. App Router

## Rule:

* Thin wrapper ONLY

```ts
export default function Page() {
  return <NamaScreen />;
}
```

---

# 12. DomainResult Pattern

## Rule:

* Repository → return DomainResult
* UseCase → unwrap
* ViewModel → handle error

---

# 13. Zustand (Optional State)

## Rule:

* Untuk UI state / shared state
* Tidak untuk business logic

---

# 14. State Management Separation (WAJIB)

## Server State

* gunakan **React Query** untuk data dari API
* atur `staleTime`, `cacheTime`, `retry` dengan bijak

## UI State

* gunakan `useState` untuk state lokal komponen
* gunakan **Zustand** untuk shared UI state

## Rule:

* jangan campur server state dan UI state
* React Query = sumber kebenaran untuk data server
* Zustand = hanya untuk state UI (loading global, sidebar toggle, dsb)

---

# 15. Frontend Performance Rules

## Rule:

* minimalkan `use client` — default ke Server Component
* gunakan `dynamic(() => import(...))` untuk komponen berat
* gunakan `useMemo` / `useCallback` hanya jika ada bottleneck nyata
* jangan premature optimize

---

# 🔥 Anti-Pattern (STRICT)

❌ API di component
❌ Mapping di UI
❌ Business logic di ViewModel
❌ Import infra ke core
❌ DTO langsung ke UI

---

# ✅ Best Practice

* Logic → UseCase
* Data access → Repository
* Mapping → Mapper
* State server → React Query
* State UI → Zustand

---

# 🏁 Kesimpulan

Dengan mengikuti pattern ini:

* code akan clean
* dependency aman
* logic terisolasi
* siap scale enterprise
