# Informe de endurecimiento de seguridad — CORS, cabeceras y aislamiento por usuario

> Responde a tres pedidos del operador: (1) RLS por usuario en Supabase, (2) CORS restringido al dominio propio, (3) cabeceras de seguridad recomendadas.
> Resumen: **los tres ya estaban implementados** en la plataforma. Este informe muestra **qué hace cada control, dónde está aplicado y cómo cambiarlo**, más dos endurecimientos adicionales aplicados en esta entrega.
> Fecha: 2026-06-15.

---

## 1. "RLS por usuario" — equivalente en esta arquitectura (no hay Supabase)

**No existe Supabase ni ninguna base SQL en este proyecto**, por lo que no hay tablas a las que aplicarles políticas `CREATE POLICY ... ROW LEVEL SECURITY`. El stack de datos es:

- **MoonDB** (base REST estructurada) — `web/lib/server/moondb.ts`
- **Netlify Blobs** (almacén clave-valor JSON) — `web/lib/server/store.ts`
- **Upstash Redis** (rate limiting) — `web/lib/cache/redis.ts`

La garantía que pide RLS — *"cada usuario solo puede ver y editar sus propios registros"* — ya se cumple con tres capas, que son el **equivalente RLS** de esta plataforma:

| Capa | Qué hace | Dónde |
|---|---|---|
| **Auth fail-closed** | Toda ruta regulada llama a `enforce(req)` (`requireAuth` por defecto `true`). Un llamador anónimo recibe `401` salvo opt-in explícito. | `web/lib/server/enforce.ts` |
| **ACL a nivel de campo (MoonDB)** | El esquema declara reglas `read/create/update/delete` por rol en cada tabla (operadores, casos, screening, etc.). No es RLS SQL, pero acota el acceso por rol/propietario. | `web/lib/server/moondb.ts`, `scripts/moondb-setup.mjs` |
| **Aislamiento por tenant** | Las claves de Blobs se prefijan por tenant (`hs-compliance/<tenant>/...`) y todo escrito en el audit chain se ata a un `tenantId` vía `tenantIdFromGate(gate)`. Un tenant no puede leer las claves de otro. | `web/lib/server/audit-chain.ts`, helpers `tenantIdFromGate()` |

> **Si en el futuro se adopta Supabase**, ese sí requeriría `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` y políticas `USING (auth.uid() = user_id)` por tabla — habría que planificarlo aparte. Hoy no aplica.

---

## 2. CORS — restringido al dominio propio (fail-closed)

El backend **solo acepta requests del dominio propio**; cualquier otro origen queda bloqueado por el navegador. Está aplicado en dos superficies coordinadas:

### Dónde está aplicado

- **Preflight + respuestas API** (autoritativo en runtime): `web/middleware.ts`
  - `resolveAllowedOrigin()` resuelve el origen permitido **sin comodín en producción**: usa `NEXT_PUBLIC_APP_URL`; si no está, cae al canónico `https://hawkeye-sterling.netlify.app` (nunca `*`). Solo en dev/preview local usa `*`, y aun así toda ruta exige auth.
  - `CORS_HEADERS` + el handler `OPTIONS /api/*` responden el preflight (`204`) con esos encabezados para todas las rutas.
- **Encabezados por respuesta de ruta**: `web/lib/api/cors.ts`
  - `corsHeaders(origin)` refleja el origen **solo si está en la allowlist**; si no, devuelve el origen canónico (y el navegador bloquea la lectura cruzada, que es lo buscado). Siempre agrega `Vary: Origin`.
  - Allowlist: `https://hawkeye-sterling.netlify.app` + `NEXT_PUBLIC_APP_URL` + `URL` (inyectado por Netlify) + `CORS_ALLOWED_ORIGINS` (CSV) + opcional `CORS_ALLOWED_PATTERN` (regex, p. ej. para preview deploys).
- **Defensa adicional**: `netlify.toml` fija `Cross-Origin-Resource-Policy: same-origin` y `Cache-Control: no-store` en `/api/*`.

### Cómo apuntarlo a *tu* dominio

> El pedido decía *"poné acá tu dominio"*. **No se hardcodea en el código** — se configura por variable de entorno, que es la forma correcta y reversible:

1. En Netlify → Site settings → Environment variables, definir **`NEXT_PUBLIC_APP_URL = https://tu-dominio.com`**.
2. (Opcional) Para socios/integraciones externas: **`CORS_ALLOWED_ORIGINS = https://socio1.com,https://socio2.com`**.
3. (Opcional) Para preview deploys: **`CORS_ALLOWED_PATTERN = ^https://deploy-preview-\d+--tu-sitio\.netlify\.app$`**.

Hoy el dominio efectivo es `https://hawkeye-sterling.netlify.app` (default canónico). Mientras no se migre a dominio propio, ese es el único origen aceptado en producción.

---

## 3. Cabeceras de seguridad — qué hace cada una y dónde

Todas se aplican en **dos superficies**: `web/middleware.ts` (`applySecurityHeaders()` + `buildCspHeader()`) para respuestas dinámicas/SSR/API, y `netlify.toml` (`[[headers]]`) para assets estáticos. El middleware es autoritativo porque `@netlify/plugin-nextjs` ignora `headers()` de Next.js en respuestas Lambda.

| Cabecera | Valor | Qué hace | Dónde |
|---|---|---|---|
| **X-Frame-Options** | `SAMEORIGIN` | Impide que sitios externos embeban la app en `<iframe>` (anti-clickjacking). `SAMEORIGIN` y no `DENY` porque el Intelligence Hub usa iframes del mismo origen. | `applySecurityHeaders()` en `web/middleware.ts` + `netlify.toml [[headers]] /*` |
| **Content-Security-Policy** | `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+`'unsafe-eval'` solo en dev); `object-src 'none'`; `frame-ancestors 'self'`; `base-uri 'self'`; `form-action 'self'`; `upgrade-insecure-requests`; … | Restringe de dónde se cargan scripts, estilos, imágenes, fuentes y conexiones; bloquea plugins y framing cruzado; fuerza HTTPS. Es la defensa principal contra XSS e inyección. | `buildCspHeader()` en `web/middleware.ts` (por request, rutas HTML) |
| **Strict-Transport-Security** | `max-age=63072000; includeSubDomains; preload` | Obliga al navegador a usar HTTPS por 2 años (incluye subdominios) y habilita preload. Previene downgrade a HTTP y SSL-stripping. | `applySecurityHeaders()` + `netlify.toml` |
| **X-Content-Type-Options** | `nosniff` | Impide que el navegador "adivine" (MIME-sniff) el tipo de contenido; frena ataques que disfrazan scripts de otro tipo. | `applySecurityHeaders()` + `netlify.toml` (incluye `/api/*`) |

**Extras ya presentes:** `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (ver abajo), `Cross-Origin-Opener-Policy: same-origin`, `X-DNS-Prefetch-Control: off`, y `poweredByHeader: false` (quita `x-powered-by`).

### Endurecimientos aplicados en esta entrega

1. **`object-src 'none'`** agregado a la CSP (`buildCspHeader()` en `web/middleware.ts`): bloquea `<object>`/`<embed>`/`<applet>` — vectores de plugins/Flash/PDF que la app no usa.
2. **`Permissions-Policy` ampliada** en `web/middleware.ts` **y** `netlify.toml` (mantenidas en sync): de `camera=(), microphone=(), geolocation=(), payment=()` a además `usb=(), serial=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=(), browsing-topics=()` — niega más APIs sensibles y opta por salir del tracking publicitario FLoC/Topics.

---

## 4. Excepciones intencionales (documentadas, no cambiadas)

- **`script-src 'unsafe-inline'`**: requerido por los scripts de hidratación de Next.js App Router. El enfoque con nonce/`strict-dynamic` se probó y se descartó porque rompe la navegación cliente. Se deja como está.
- **COEP `require-corp`**: omitido a propósito — rompería la carga de `fonts.bunny.net` (no envían `CORP: cross-origin`).
- **HSTS preload submission (CG-8)**: `*.netlify.app` ya está en la lista de preload de Chromium; no requiere acción salvo migración a dominio propio.

---

## Referencias de archivos

| Propósito | Archivo |
|---|---|
| CORS centralizado (respuestas de ruta) | `web/lib/api/cors.ts` |
| CORS preflight + cabeceras (middleware edge) | `web/middleware.ts` |
| Cabeceras estáticas | `netlify.toml` (`[[headers]]`) |
| Auth fail-closed | `web/lib/server/enforce.ts` |
| ACL de datos (MoonDB) | `web/lib/server/moondb.ts`, `scripts/moondb-setup.mjs` |
| Audit chain por tenant | `web/lib/server/audit-chain.ts` |
