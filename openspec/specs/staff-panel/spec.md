# staff-panel Specification

## Purpose

Define el comportamiento del panel de personal de OpenDayCare: las rutas, el shell y los guards que aplican al personal autenticado, y cómo se redirige a las familias que llegan a estas rutas por URL directa o sesión caducada.

## Requirements

### Requirement: Personal autenticado accede al feed
El personal autenticado (rol `staff`) DEBE poder acceder a la ruta `/` y verá el feed de publicaciones (MUST).

#### Scenario: Staff en sesión navega a la raíz
- **WHEN** un usuario con `claims.app_metadata.role = 'staff'` navega a `/`
- **THEN** el servidor renderiza el feed con el shell de personal

#### Scenario: Personal sin sesión intenta acceder al feed
- **WHEN** un visitante sin sesión navega a `/`
- **THEN** el servidor redirige a `/login?next=/`

### Requirement: Personal autenticado accede al listado y perfil de niños
El personal autenticado DEBE poder acceder a `/kids` y `/kids/[id]` (MUST).

#### Scenario: Staff navega al listado de niños
- **WHEN** un usuario con `role = 'staff'` navega a `/kids`
- **THEN** el servidor renderiza el listado de niños dentro del shell de personal

#### Scenario: Staff navega al perfil de un niño
- **WHEN** un usuario con `role = 'staff'` navega a `/kids/<uuid>`
- **THEN** el servidor renderiza el perfil del niño dentro del shell de personal

### Requirement: Sidebar de personal muestra navegación completa
El shell de personal DEBE mostrar en su sidebar: Feed, Niños, Avisos (deshabilitado), Mi cuenta (deshabilitado), el botón "Crear publicación" en la parte superior y un bloque inferior con avatar de iniciales en color terracota, nombre, etiqueta "Personal · Sala Soles" y botón de cerrar sesión (MUST).

#### Scenario: Render del sidebar de staff
- **WHEN** un usuario staff ve el shell
- **THEN** la barra lateral contiene los seis elementos descritos con el botón "Crear publicación" visible

### Requirement: Familias son redirigidas desde rutas de personal
Una familia autenticada que llegue a `/`, `/kids` o `/kids/[id]` por URL directa, enlace compartido o sesión caducada DEBE ser redirigida a `/familiar` sin ver contenido de personal (MUST).

#### Scenario: Familia llega al feed de personal
- **WHEN** un usuario con `role = 'parent'` navega a `/`
- **THEN** el servidor redirige a `/familiar`

#### Scenario: Familia llega al perfil de un niño
- **WHEN** un usuario con `role = 'parent'` navega a `/kids/<uuid>`
- **THEN** el servidor redirige a `/familiar`

### Requirement: Login redirige al personal a su feed
Tras un inicio de sesión correcto con credenciales de personal, el sistema DEBE redirigir a `/` (o al `?next=` si la URL solicitada es coherente con el rol) (MUST).

#### Scenario: Login de staff sin next
- **WHEN** un usuario con credenciales válidas de staff inicia sesión desde `/login`
- **THEN** el sistema redirige a `/`

#### Scenario: Login de staff con next coherente
- **WHEN** un usuario staff inicia sesión desde `/login?next=/kids`
- **THEN** el sistema redirige a `/kids`

#### Scenario: Login de staff con next incoherente
- **WHEN** un usuario staff inicia sesión desde `/login?next=/familiar`
- **THEN** el sistema ignora `next` y redirige a `/`