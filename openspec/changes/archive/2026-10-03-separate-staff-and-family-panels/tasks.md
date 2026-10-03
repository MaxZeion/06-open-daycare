# Tasks

## 1. Setup de route groups

- [x] 1.1 Crear las carpetas `app/(staff)/`, `app/(staff)/_components/`, `app/(family)/`, `app/(staff)/kids/`, `app/(staff)/_components/feed/`, `app/(staff)/_components/kids/` y verificar con `ls app/` que existen antes de seguir
- [x] 1.2 Renombrar `components/shared/AppShell.tsx` → `components/shared/StaffShell.tsx`, `AppShellClient.tsx` → `StaffShellClient.tsx`, `Sidebar.tsx` → `StaffSidebar.tsx`, ajustar imports en sus archivos y verificar `npm run build` sigue verde

## 2. Mover rutas y componentes al grupo staff

- [x] 2.1 Mover `app/page.tsx` → `app/(staff)/page.tsx` y `app/feed/FeedPageClient.tsx` → `app/(staff)/_components/feed/FeedPageClient.tsx`, ajustar los imports relativos y verificar `npm run build` sigue verde
- [x] 2.2 Mover `app/kids/page.tsx`, `app/kids/KidsPageClient.tsx`, `app/kids/actions.ts`, `app/kids/[id]/page.tsx`, `app/kids/[id]/ProfileClient.tsx` → `app/(staff)/kids/`, ajustar imports y verificar `npm run build` sigue verde
- [x] 2.3 Mover `components/feed/PostCard.tsx`, `FeedContext.tsx`, `NewPostModal.tsx`, `mockPosts.ts` → `app/(staff)/_components/feed/`, ajustar imports y verificar `npm run build` sigue verde
- [x] 2.4 Mover `components/kids/AddKidModal.tsx`, `AllergyBox.tsx`, `InfoRow.tsx`, `KidCard.tsx`, `LinkParentModal.tsx`, `ParentRow.tsx`, `RoomTabs.tsx`, `dateMask.ts`, `mapKid.ts`, `mockKids.ts` → `app/(staff)/_components/kids/`, ajustar imports y verificar `npm run build` sigue verde
- [x] 2.5 Crear `app/(staff)/layout.tsx` (passthrough de children; cada page sigue montando su propio `<StaffShell>` para mantener `kids` por page) y verificar `npm run build` sigue verde

## 3. Helper `requireRole` y guards en rutas de staff

- [x] 3.1 Añadir `requireRole(role, next?)` a `utils/supabase/auth.ts` reusando `getCurrentUser`, exportar también `DEFAULT_STAFF_NEXT` y `DEFAULT_FAMILY_NEXT`, y verificar `npx tsc --noEmit` (o `npm run build`) compila sin errores
- [x] 3.2 Reemplazar la primera línea de `app/(staff)/page.tsx` por `await requireRole('staff', DEFAULT_FAMILY_NEXT)` y verificar `npm run build` sigue verde
- [x] 3.3 Aplicar `await requireRole('staff', DEFAULT_FAMILY_NEXT)` en `app/(staff)/kids/page.tsx` y `app/(staff)/kids/[id]/page.tsx`, y verificar `npm run build` sigue verde

## 4. Shell de familia

- [x] 4.1 Crear `components/shared/FamilyShell.tsx` (Server Component que monta `<FamilyShellClient>`) y `components/shared/FamilyShellClient.tsx` (Client Component con `<aside>{children}</aside>`), y verificar `npm run build` sigue verde
- [x] 4.2 Crear `components/shared/FamilySidebar.tsx` con nav `Feed / Resumen del día (disabled) / Mi cuenta (disabled)`, subtítulo "Familia", avatar de iniciales en color lavanda, bloque inferior con etiqueta de parentesco y botón de cerrar sesión; verificar visualmente con Playwright que el sidebar renderiza como en `pantallas/familia-feed.dc.html`
- [x] 4.3 Crear `app/(family)/layout.tsx` (passthrough; cada page monta su `<FamilyShell>`) y verificar `npm run build` sigue verde
- [x] 4.4 Crear `app/(family)/familiar/page.tsx` (necesario segmento `familiar/` para resolver a `/familiar`, no a `/`) con `await requireRole('parent', DEFAULT_STAFF_NEXT)`, importa y monta `<FeedPageClient />` dentro de `<FamilyShell>`, y verificar `npm run build` sigue verde

## 5. Login redirige por rol

- [x] 5.1 Modificar `app/login/actions.ts` para que tras `signInWithPassword` correcto consulte `getClaims()` y resuelva el destino: si `?next=` empieza por una ruta coherente con el rol, respeta `next`; en otro caso, redirige al destino por defecto (`/` para staff, `/familiar` para parent), y verificar `npm run build` sigue verde
- [x] 5.2 Verificar con Playwright que login con `staff@opendaycare.com` lleva a `/`, login con credenciales de familia lleva a `/familiar`, y login con `?next=` cruzado se ignora

## 6. Verificación final

- [x] 6.1 Ejecutar `npm run lint` y `npm run build`, ambos en verde
- [x] 6.2 Verificar con Playwright (sesión staff): navegar a `/`, `/kids`, `/kids/<uuid>` → render correcto; a `/familiar` → redirect a `/`
- [x] 6.3 Verificar con Playwright (sesión familia): navegar a `/familiar` → render correcto; a `/`, `/kids`, `/kids/<uuid>` → redirect a `/familiar`; el sidebar no muestra "Crear publicación" ni "Niños"
- [x] 6.4 Verificar visualmente con Playwright + visión que el sidebar de familia coincide con `pantallas/familia-feed.dc.html` (subtítulo "Familia", avatar lavanda, tres ítems de nav sin NewPostButton)
- [x] 6.5 Verificar consola del navegador sin errores durante los flujos anteriores