# SPEC 05 — Vincular padre (modal)

> **Status:** Aprovado
> **Depends on:** SPEC 02 (perfil de niño, tipo `Kid.parents[]` con `Parent.status`), SPEC 04 (AddKidModal, precedente de modal vía portal + validación inline)
> **Date:** 2026-09-26
> **Objective:** Convertir el no-op "Vincular otro padre" de `/kids/[id]` en un modal real que replica `pantallas/vincular-padre.dc.html` con sus cuatro bloques (banner + nombre + email + parentesco + código), valida inline que nombre y email sean obligatorios y válidos, y al enviar añade el padre como `pendiente` al mock del niño.

## Why this spec exists

SPEC 02 implementó el perfil con "Vincular otro padre" como botón sin acción. Este spec lo hace real según la maqueta: un modal con scroll bloqueado, backdrop y cierre por X/Escape/click-fuera (mismo patrón que `AddKidModal`) que, al enviar, materializa un `Parent` con `status: "pendiente"` en el perfil. Es el primer spec que **muta** estado desde la maqueta (antes sólo eran no-ops o renderizados estáticos).

## Scope

**In:**

- Componente `LinkParentModal` (client, portal) que replica los cuatro bloques de la maqueta:
  - Header con título "Vincular padre", subtítulo "a {nombre del niño}", botón X.
  - Banner informativo azul: "Le enviaremos un correo con un código para que active su cuenta. Solo verá el feed de {niño}."
  - Input "NOMBRE DEL PADRE/MADRE" (placeholder "Ej. Diego Fernández").
  - Input "EMAIL" (placeholder "correo@ejemplo.com").
  - Selector "PARENTESCO" (3 botones pill: Mamá / Papá / Tutor/a; visual, no valida).
  - Caja del "CÓDIGO DE INVITACIÓN" (5 caracteres alfanuméricos mayúscula, generados al abrir, "Vence en 7 días").
  - CTA "Enviar invitación" full-width con gradiente y icono de enviar.
- Apertura del modal desde "Vincular otro padre" en `/kids/[id]` (actualmente no-op).
- Cierre por X, Escape o click en el overlay; `body { overflow: hidden }` mientras esté abierto; `aria-modal`, `role="dialog"`, focus-trap mínimo.
  - Validación inline al pulsar "Enviar invitación":
    - Nombre: requerido, primer token con al menos 3 caracteres y al menos un segundo token (nombre + apellido). Espacios múltiples se colapsan; `trim()` antes de validar.
    - Email: requerido y formato básico (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`).
    - Sin alertas nativas; mensajes rojos bajo el campo, mismo estilo que `AddKidModal`.
- Al enviar válido: añade un nuevo `Parent` al state local del niño con `status: "pendiente"`, `name`, `email`, `role` según el botón de parentesco elegido, cierra el modal y permanece en `/kids/[id]` (que ya muestra al nuevo padre en la lista "Padres vinculados").
- Refactor de `app/kids/[id]/page.tsx`: el server component conserva la lectura de `params` y la búsqueda en `KIDS`; el render del perfil pasa a un wrapper client (`ProfileClient`) que mantiene `parents` como state.
- Tokens nuevos (en tabla) en `app/globals.css`.

**Out of scope (para specs futuros):**

- Backend real / API / envío de email / verificación del código.
- Persistencia del padre entre reloads (es state local en memoria).
- Edición o baja de padres ya vinculados.
- Perfil de familia (`familia-feed.dc.html`).
- `Resúmen del día`, `Editar`, `Agregar niño` (cada uno sigue siendo no-op; cada uno va en su propio spec).
- Página `/login` o `/activate` (pertenecen a SPEC 03).

## Data model

No introduce tipos nuevos. Reutiliza exactamente el tipo `Parent` de `components/kids/mockKids.ts` (SPEC 02):

```ts
interface Parent {
  name: string;
  initials: string;
  bg: string;        // token de avatar
  fg: string;
  role: string;      // "Mamá" | "Papá" | "Tutor/a"
  status: "activa" | "pendiente";
  note?: string;
}
```

Al enviar el modal se construye:

```ts
{
  name: name.trim(),
  initials: name.trim().charAt(0).toUpperCase(),
  // bg/fg: rota paleta (token --avatar-*)
  bg: AVATAR_PALETTE[(parents.length + offset) % AVATAR_PALETTE.length].bg,
  fg: AVATAR_PALETTE[(parents.length + offset) % AVATAR_PALETTE.length].fg,
  role: relacion,    // "Mamá" | "Papá" | "Tutor/a"
  status: "pendiente",
  note: "invitación enviada",
}
```

El mock `KIDS` no se muta: `ProfileClient` mantiene su propia copia `parents: Parent[]` inicializada con `kid.parents ?? []` y un `setParents(prev => [...prev, parent])` al recibir el `onSubmit`.

## Design tokens (nuevos en `app/globals.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--info-banner-bg` | `#E3ECFB` | fondo del banner azul |
| `--info-banner-fg` | `#3F5694` | texto del banner |
| `--info-banner-icon` | `#4E72C8` | icono `info` del banner |
| `--close-btn-bg` | `#F0E6D8` | fondo del botón X |
| `--close-btn-fg` | `#94887B` | icono de la X |
| `--kinship-on-bg` / `--kinship-on-fg` / `--kinship-on-border` | `#CCD8F4` / `#4E72C8` / `#9FB8EC` | botón de parentesco seleccionado (Mamá) |
| `--kinship-off-bg` / `--kinship-off-fg` / `--kinship-off-border` | `#FFFDF9` / `#6E6359` / `#ECE0D0` | botón de parentesco no seleccionado |
| `--code-box-bg` | `#FBF1D6` | caja del código (igual a `--consent-bg` ya existente) |
| `--code-box-border` | `#E6D08A` | borde discontinuo de la caja |
| `--code-title` / `--code-sub` | `#A88526` | "CÓDIGO DE INVITACIÓN" / "Vence en 7 días" |
| `--code-text` | `#8A7234` | el código grande Fredoka (igual a `--consent-fg`) |

Tokens ya existentes reutilizados: `--brand-deep-soft`→`--brand-deep` para el CTA, `--input-border`, `--surface`, `--ink`, `--muted-strong`, `--modal-bg`, `--shadow-modal`, `--field-bg`, `--field-error`, `--avatar-*` (paleta). Fuentes Fredoka + Nunito siguen en el layout global.

## Implementation plan

Estructura (nuevos en **negrita**, modificados con *ital*):

```
components/
  shared/
    icons.tsx          # (mod) añadir CloseIcon, InfoCircleIcon, SendIcon (trazos de la maqueta)
  kids/
    LinkParentModal.tsx # (nuevo) modal client
app/
  globals.css          # (mod) tokens de la tabla
  kids/
    [id]/
      page.tsx         # (mod) extraer ProfileClient
      ProfileClient.tsx # (nuevo) wrapper client con state de parents + estado del modal
```

1. `app/globals.css`: agrego los tokens nuevos de la tabla. *Funcional: compila.*
2. `components/shared/icons.tsx`: agrego `CloseIcon` (X), `InfoCircleIcon` (círculo con `i`), `SendIcon` (send/paper-plane de la maqueta), patrón `Svg` con `strokeWidth` 2-2.4. *Funcional: siguen renderizando los iconos existentes.*
3. `components/kids/LinkParentModal.tsx` (nuevo, client): props `open`, `onClose`, `onSubmit(parent)`, `kidName`. Estado local: `name`, `email`, `relacion` (`"Mamá"|"Papá"|"Tutor/a"`), `attempted`, `inviteCode` (generado una vez por apertura con `useState(() => generateInviteCode())`). `useEffect` para `body { overflow: hidden }` y listener `Escape` → `onClose` (mismo patrón que `AddKidModal`). Layout via `createPortal`: overlay `fixed inset-0 z-50 flex items-center justify-center ... bg-black/30` (o solo scrim si la maqueta lo pide — mantengo coherencia con `AddKidModal`, que no usa scrim explícito en la maqueta visible pero sí fixed overlay), diálogo `<dialog>` o `<div role="dialog" aria-modal="true" aria-label="Vincular padre">` con `max-w-[480px]` y `bg-modal-bg`, stopPropagation. Header (flex space-between, border-bottom), banner azul (bg-info-banner-bg + InfoCircleIcon), input nombre (label + input con `aria-invalid`), input email (idem), selector parentesco (3 botones pill con token on/off), caja código (dashed border + Fredoka 34px + letter-spacing 7px), CTA (`flex w-full gap-2 ... bg-gradient-to-b from-brand-deep-soft to-brand-deep` + `SendIcon`). Validación: `nameInvalid`, `emailInvalid` derivados; `showNameError = attempted && nameInvalid`; idem email; mensajes rojos inline. CTA: si inválido → `setAttempted(true)`; si válido → `onSubmit({...})`. *Funcional: el componente compila y se puede invocar; aún no está cableado al perfil.*
4. `app/kids/[id]/ProfileClient.tsx` (nuevo, client): recibe `kid: Kid`. `useState<Parent[]>(kid.parents ?? [])`, `useState<boolean>(linkOpen)`. Renderiza la UI del perfil (`Profile` actual reubicada), leyendo `parents` del state. `ParentsColumn` recibe `onVincularClick` que abre `setLinkOpen(true)`; al renderizar `ParentRow`, itera sobre `parents` (no `kid.parents`). Monta `<LinkParentModal open={linkOpen} kidName={kid.name} onClose={...} onSubmit={...} />`. El `onSubmit`: `setParents(prev => [...prev, parentFromForm]); setLinkOpen(false);`. *Funcional: el modal abre/cierra y al enviar el nuevo padre aparece en la lista.*
5. `app/kids/[id]/page.tsx` (mod): el server component ya sólo hace `const kid = KIDS.find(...)` y devuelve `<AppShell active="kids"><ProfileClient kid={kid ?? undefined} /></AppShell>` (o el `NotFound` server-side si no existe). *Funcional: regresión del perfil intacta, botón Vincular ahora abre el modal.*
6. Responsive: el modal ocupa el ancho disponible en mobile (mismo cálculo `max-w-[480px] w-full` que `AddKidModal`); el `body { overflow: hidden }` cubre mobile. Sin breakpoints nuevos. *Funcional: verificado a 390×844.*

No se toca `AppShell`/`Sidebar` ni las rutas `/login`, `/activate`, `/kids`, `/` (feed).

## Acceptance criteria

- [ ] `npm run lint` y `npm run build` pasan sin errores.
- [ ] `npm run dev` → `/kids/mateo-fernandez` carga sin errores en consola (regresión): siguen apareciendo Lucía ACTIVA + Diego PENDIENTE en "Padres vinculados".
- [ ] "Vincular otro padre" abre el modal: overlay full-screen + dialog de 480px centrado con título "Vincular padre", subtítulo "a Mateo Fernández", botón X, banner azul, input nombre, input email, selector parentesco (Mamá preseleccionado), caja código "XXXXX" (Fredoka, letter-spacing, "Vence en 7 días"), CTA "Enviar invitación". `role="dialog"` + `aria-modal="true"`.
- [ ] Click en X, Escape o click en el overlay (fuera del dialog) cierra el modal sin error en consola ni cambio de URL. Mientras está abierto, `document.body.style.overflow === "hidden"`.
- [ ] CTA con nombre inválido → "Ingresá nombre y apellido (mínimo 3 caracteres en el nombre)." inline bajo el campo; modal no se cierra, no se añade padre. Cubre los casos: vacío, sólo espacios, `"a"` (sin apellido y < 3), `"Ana"` (sin apellido), `"an b"` (nombre < 3), `"Ana B"` (boundary, válido).
- [ ] CTA con email vacío → "Ingresá un email válido" inline; modal no se cierra.
- [ ] CTA con email con formato inválido (ej. `foo`) → mismo error inline.
- [ ] CTA con nombre y email válidos → modal se cierra; el perfil muestra el nuevo padre con badge PENDIENTE, role elegido, avatar de la paleta, y aparece **debajo** de Lucía y Diego (no reemplaza nada, no duplica los existentes).
- [ ] El código se genera fresco en cada apertura (no se reusa entre aperturas consecutivas).
- [ ] Sin recarga, abrir/cerrar varias veces seguidas funciona; abrir → generar padre 1 → cerrar, volver a abrir → CTA sigue deshabilitado (sin nombre/email) → tras completar añade padre 2 sin tocar padre 1.
- [ ] Tokens correctos por estilo computado: banner bg `rgb(227,236,251)` fg `rgb(63,86,148)`; caja código bg `rgb(251,241,214)`; CTA gradiente `rgb(244,151,126)` → `rgb(238,129,100)`; título Fredoka, body Nunito.
- [ ] Mobile (<768px): modal ocupa el ancho disponible, scroll del body bloqueado, sin overflow horizontal, `aria-modal` correcto.
- [ ] Regresión: `/`, `/kids`, `/login`, `/activate`, `/kids/<otro-id>` siguen renderizando sin nuevos errores en consola.

## Decisions

- **Sí:** modal real vía portal (overlay + Escape + click-fuera), coherente con `AddKidModal` y con los tokens `--modal-bg`/`--shadow-modal` ya en `globals.css`.
- **Sí:** los cuatro bloques de la maqueta (banner, nombre, email, parentesco, código) renderizados, aunque sólo nombre/email validen.
- **Sí:** `relacion` (`"Mamá"|"Papá"|"Tutor/a"`) entra como `role` del nuevo `Parent`; el botón preseleccionado por defecto es Mamá (igual que la maqueta).
- **Sí:** el `Parent` añadido lleva siempre `status: "pendiente"` (consistente con Diego PENDIENTE del mock) y `note: "invitación enviada"`.
- **Sí:** código generado al abrir el modal (5 caracteres `[A-Z0-9]`), texto "Vence en 7 días" hardcodeado. Decorativo, no se valida.
- **No:** persistencia (localStorage/API). El state es del `ProfileClient`; al refrescar, el padre desaparece. Si esto se quiere persistente, va en otro spec.
- **Sí:** refactor a `ProfileClient` en vez de store global. El state local basta.
- **No:** nuevo componente `parents-store.tsx`. La página del perfil es el único consumidor.
- **No:** edición/baja de padres. Cada uno cuando le toque.
- **Sí:** regex email simple (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`), alineado con lo que usa HTML5 `type=email` pero controlado por nosotros para el mensaje inline.
- **Sí:** endurecimiento de la validación de nombre (≥ 3 chars en el primer token + segundo token requerido) en `LinkParentModal` y `AddKidModal`, alineado con el placeholder `Ej. Diego Fernández` / `Ej. Martina López` de las maquetas. Misma lógica en ambos para evitar la divergencia detectada al validar con un solo carácter.
- **No:** focus-trap completo con librería externa. Sólo focus inicial al abrir y Escape; suficiente para mantener coherencia con `AddKidModal`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Refactor a `ProfileClient` (mover render del perfil de server a client) podría romper el manejo de `params` y la búsqueda en `KIDS` | El server component se queda con la lectura de `params` y `KIDS.find()`. Si no hay kid, retorna `NotFound` server-side. Sólo el render pasa a client. |
| El mock `KIDS` no muta; añadir padre sin persistencia es engañoso si el usuario recarga | Aceptado: SPEC 02 ya establece que todo es mock en memoria; este spec no introduce la promesa de persistencia. Lo declara explícito en "Out of scope". |
| Body `overflow: hidden` puede romper scroll dentro del dialog en mobile con teclado virtual | El dialog no tiene scroll interno porque la maqueta entra en pantalla sin overflow. Se mantiene el mismo body overflow:hidden que `AddKidModal`. |
| El selector parentesco no valida pero el usuario podría esperar que sí | Decisión explícita del scope: parentesco y código son visuales. Doc. en "Decisions" y testeado con CTA vacío. |
| Errores inline en español manteniendo el resto del UX | Mensajes copiados al español exacto del patrón `AddKidModal`. |

## What is **not** in this spec

- Backend real / API / envío de email / verificación del código.
- Persistencia del padre añadido entre recargas o sesiones.
- Edición o baja de padres en `/kids/[id]`.
- Perfil de familia (`pantallas/familia-feed.dc.html`).
- `Resumen del día`, `Editar`, `Agregar niño` (cada uno mantiene su no-op; cada uno va en su propio spec).
- Login / activación (pertenecen a SPEC 03).

Cada una de esas, si llega, va en su propio spec.
