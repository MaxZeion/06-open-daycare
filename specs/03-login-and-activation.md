# SPEC 03 — Login y activación de cuenta

> **Status:** Implementado
> **Depends on:** SPEC 01 (tokens + fuentes), SPEC 02 (convención `components/<feature>/`, rutas en inglés)
> **Date:** 2026-09-25
> **Objective:** Implementar las maquetas `pantallas/login.dc.html` y `pantallas/activar-cuenta.dc.html` como las rutas `/login` y `/activate`, fieles a su estilo, sin backend (los submits navegan a `/` y los campos son state local).

## Why this spec exists

SPEC 01 y 02 portaron pantallas del área de gestión (feed, niños) dentro del `AppShell`. Este spec agrega las **páginas públicas de acceso**: login y activación de cuenta por invitación. Son las primeras páginas que no usan `AppShell`/`Sidebar` (layout propio de cada una) y establecen el patrón de páginas de auth para los specs futuros.

## Scope

**In:**

- La ruta `/login` replicando `login.dc.html` **sin la sección "INGRESO COMO"** (etiqueta + botones Personal/Familia quedan eliminados; el formulario comienza directamente en EMAIL): panel izquierdo terracota en gradiente (logo, headline, footer "Guardería Sala Soles") + formulario (email, contraseña, "¿Olvidaste tu contraseña?", botón "Iniciar sesión", link "Activa tu cuenta").
- La ruta `/activate` replicando `activar-cuenta.dc.html` completa: logo, "Bienvenida a OpenDayCare", caja de invitación (Mateo · Sala Soles), campos código/email/contraseña, checkbox de autorización de fotos (marcado), botón "Activar mi cuenta", link "Iniciar sesión".
- Navegación real entre ambas páginas: "Activa tu cuenta" → `/activate`; "¿Ya tienes cuenta?" → `/login`.
- Submits sin backend: "Iniciar sesión" y "Activar mi cuenta" navegan a `/` (feed) cuando email y contraseña no están vacíos.
- Tokens de diseño nuevos (gradiente del panel, fondo `#FBF4EC`, bordes de input, caja de consentimiento) en `app/globals.css`.
- Responsive: en mobile (< 768px) el panel izquierdo del login se oculta y el formulario queda centrado a ancho completo; `/activate` ya es de una columna y no cambia.

**Out of scope (para specs futuros):**

- Autenticación real: sin sesión, sin cookies, sin guards de ruta, sin logout.
- Backend / API / base de datos: sin validación de credenciales, sin verificación de código de invitación.
- La pantalla `familia-feed.dc.html` (el feed de familia al que apuntan las maquetas).
- Recuperación real de contraseña ("¿Olvidaste tu contraseña?" es no-op visual).
- Persistencia de formularios entre sesiones.

## Data model

No introduce datos nuevos: la caja de invitación de `/activate` es contenido estático de la maqueta y los campos de ambos formularios son **state local de componente** (`useState` de email/password/code/checkbox). No hay mock ni persistencia.

## Design tokens (nuevos en `app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg-auth` | `#FBF4EC` | fondo de ambas páginas (el mockup lo usa; difiere del `--bg` `#F6ECDF` del resto de la app) |
| `--login-grad-1/2/3` | `#F6A98E` / `#F2937A` / `#EC7E62` | gradiente 155deg del panel izquierdo |
| `--input-border` | `#EADFD0` | borde de inputs de las páginas auth |
| `--consent-bg` / `--consent-fg` | `#FBF1D6` / `#8A7234` | caja del checkbox de autorización |
| `--check-bg` | `#5FB97E` | fondo del checkbox marcado |

Los valores que ya existen se reutilizan tal cual: gradiente del botón CTA (`--brand-deep-soft` → `--brand-deep` = `#F4977E→#EE8164`), link "¿Olvidaste tu contraseña?" (`--accent-deep` = `#C5503A`), borde de focus del password (`--kid-card-hover` = `#F2A78E`), avatar M (`--avatar-mateo-*`), gradiente del logo de activación (`--brand-soft` → `--brand`). Fuentes Fredoka + Nunito ya están en el layout global.

## Implementation plan

Estructura de archivos (nuevos en negrita, modificados marcados):

```
components/
  shared/
    icons.tsx      # (mod) agregar CheckIcon (polylínea de la maqueta)
app/
  globals.css      # (mod) tokens nuevos de la tabla
  login/
    page.tsx       # (nuevo, client) panel + formulario
  activate/
    page.tsx       # (nuevo, client) contenido + formulario
```

1. `app/globals.css`: agrego los tokens nuevos de la tabla (+ sus alias `@theme inline` de color). *Funcional: compila.*
2. `components/shared/icons.tsx`: agrego `CheckIcon` (mismo trazo de la maqueta, patrón `Svg` con `strokeWidth` 3). *Funcional.*
3. `app/login/page.tsx` (client): grilla `1.05fr 1fr` — panel izquierdo (gradiente, círculos decorativos, logo `SunIcon`, headline 42px, footer "🌿 Guardería Sala Soles") + formulario centrado (max 392px): h2 "Iniciar sesión", estado `email`/`password` (email precargado `caro@opendaycare.com`, password con placeholder `••••••••`), "¿Olvidaste tu contraseña?" (no-op), botón que navega a `/` si ambos campos no están vacíos, link "Activa tu cuenta" → `/activate`. Sin sección INGRESO COMO. *Funcional: /login renderiza.*
4. `app/activate/page.tsx` (client): contenedor centrado (max 440px) sobre `--bg-auth`: logo, h1 "Bienvenida a OpenDayCare", caja de invitación (avatar M + "Mateo · Sala Soles"), campos (código `7K4P9`, email `lucia.fernandez@gmail.com`, contraseña `contraseña`), checkbox de consentimiento (marcado por defecto, toggeable), botón que navega a `/` si email y contraseña no están vacíos, link "Iniciar sesión" → `/login`. *Funcional: /activate renderiza.*
5. Responsive: en `/login` el panel izquierdo pasa a `hidden` < 768px y el formulario ocupa la grilla completa; `/activate` no requiere cambios. *Funcional: verificado a 390×844.*

No se toca `AppShell`/`Sidebar`/`page.tsx` del feed ni nada de SPEC 01/02.

## Acceptance criteria

- [x] `npm run lint` y `npm run build` pasan sin errores. — ok: lint exit 0; `next build` 16.3.6 ✓ con las 7 rutas (`/`, `/activate`, `/kids`, `/kids/[id]`, `/login`, `/_not-found`).
- [x] `/login` desktop igual a `login.dc.html` sin la sección "INGRESO COMO": panel terracota en gradiente 155deg (logo OpenDayCare, headline "El día de cada niño, compartido con su familia.", footer "🌿 Guardería Sala Soles") + formulario (EMAIL, CONTRASEÑA, "¿Olvidaste tu contraseña?", CTA en gradiente, "¿Te invitó la guardería? Activa tu cuenta"). — ok: `.mcp-playwright/spec-03-login-desktop.png` vs `spec-03-mockup-login-desktop.png` (1280×800): panel idéntico; el formulario comienza en EMAIL, sin INGRESO COMO.
- [x] `/activate` igual a `activar-cuenta.dc.html`: logo 58px, "Bienvenida a OpenDayCare", caja de invitación (M · "Mateo · Sala Soles"), CÓDIGO `7K4P9` (Fredoka, letter-spacing), EMAIL, CREAR CONTRASEÑA, checkbox de fotos marcado, CTA, "¿Ya tienes cuenta? Iniciar sesión". — ok: `.mcp-playwright/spec-03-activate-desktop.png` (+ `-full`) vs `spec-03-mockup-activate-desktop.png`: todos los elementos coinciden.
- [x] "Activa tu cuenta" (`/login`) navega a `/activate`; "Iniciar sesión" (`/activate`) navega a `/login`; sin 404 y sin errores en consola. — ok: clics reales vía Playwright en ambos sentidos; consola de la app sin errores (el único error de la sesión fue un favicon 404 del servidor estático de maquetas).
- [x] "Iniciar sesión" con email y contraseña no vacíos navega a `/` (feed); con algún campo vacío no navega. — ok: password vacío → se queda en `/login`; con password → llega a `/` (feed visible).
- [x] "Activar mi cuenta" con email y contraseña no vacíos navega a `/`; con algún campo vacío no navega. — ok: email vacío → se queda en `/activate`; completado → llega a `/` (feed).
- [x] El checkbox de autorización se puede marcar/desmarcar (state local, inicialmente marcado). — ok: inicial marcado (bg `#5FB97E`), clic → caja blanca sin check, 2º clic → marcado de nuevo (verificado por computed style).
- [x] Mobile (< 768px): `/login` muestra solo el formulario centrado a ancho completo (panel oculto, sin overflow horizontal); `/activate` se adapta sin overflow. — ok: 390×844 — panel `display:none`, `scrollWidth 390 = clientWidth` (login), sin overflow (activate); `spec-03-login-mobile.png`, `spec-03-activate-mobile.png`.
- [x] Colores y fuentes: fondo `#FBF4EC` en ambas páginas, gradiente del panel `#F6A98E→#F2937A→#EC7E62`, CTA `#F4977E→#EE8164`, Fredoka en títulos/logo, Nunito en cuerpo. — ok: tokens en `app/globals.css` (`--bg-auth`, `--login-grad-1/2/3`, `--input-border`, `--consent-*`, `--check-bg`) + estilos computados: fondo `rgb(251,244,236)`, gradiente 155deg exacto, CTA `#F4977E→#EE8164`, h1 Fredoka, cuerpo Nunito (vía `next/font/google` en layout, patrón canónico Next 16 `LayoutProps<"/">`).
- [x] `/` (feed), `/kids` y `/kids/[id]` de SPEC 01/02 siguen funcionando sin cambios (regresión). — ok: `spec-03-regression-feed.png`, `spec-03-regression-kids.png`, `spec-03-regression-profile.png` (`/kids/mateo-fernandez`); cero errores en consola en las tres.

## Decisions

- **Sí:** rutas `/login` y `/activate` (inglés), coherente con SPEC 02; la UI sigue en español fiel a las maquetas.
- **Sí:** eliminar por completo la sección "INGRESO COMO" (etiqueta + botones) en el login; es la única diferencia con la maqueta que pidió el usuario.
- **Sí:** submits navegan a `/` (feed) con campos no vacíos. Sin backend, es la forma de dar flujo real sin inventar una sesión.
- **No:** guard de autenticación, cookies, `middleware`, sesión simulada. Fuera del scope "sólo las páginas".
- **Sí:** páginas de auth **sin** `AppShell`/`Sidebar`; cada una tiene su layout propio (así son en las maquetas).
- **No:** componentes compartidos `components/auth/*`; con dos páginas autocontenidas y sin lógica reutilizable, subcarpeta no se justifica (los campos son state local).
- **Sí:** precargar los valores de la maqueta (emails, código `7K4P9`, contraseña `contraseña`, checkbox marcado) para máxima fidelidad.
- **Sí:** mobile del login = ocultar panel, formulario a ancho completo (< 768px, convención de SPEC 01).
- **Sí:** `"¿Olvidaste tu contraseña?"` no-op visual (no existe recuperación sin backend).
- **Sí:** token `--bg-auth` `#FBF4EC` local a las páginas auth en vez de cambiar `--bg` global (no rompe SPEC 01/02).

## Risks

| Risk | Mitigation |
| --- | --- |
| Modificar `globals.css` e `icons.tsx` (compartidos) puede romper SPEC 01/02 | Los cambios son puramente aditivos (tokens e icono nuevos); criterio de regresión explícito para `/`, `/kids` y `/kids/[id]`. |
| El mockup usa `#FBF4EC` y el resto de la app `#F6ECDF` | Token `--bg-auth` aplicado solo al contenedor de las páginas auth. |
| La maqueta del login es desktop-only (grilla 2 columnas) | Mobile definido como extensión sensata (panel oculto); no es claim de fidelidad, igual que en SPEC 01/02. |

## What is **not** in this spec

- Autenticación real (sesión, guards, logout).
- Backend / API / base de datos / validación de credenciales o códigos.
- La pantalla `familia-feed.dc.html` y recuperación de contraseña.
- Las demás pantallas de `pantallas/` (agregar-niño, vincular-padre, resumen-día, editar, avisos, cuenta, familia).

Cada una de esas, si llega, va en su propio spec.
