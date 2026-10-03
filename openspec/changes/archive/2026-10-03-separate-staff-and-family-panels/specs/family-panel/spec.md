# Spec Delta

## Purpose

Define el comportamiento del panel de familia de OpenDayCare: la ruta dedicada, el shell y los guards que aplican a las familias autenticadas, y cómo se redirige al personal que llega a estas rutas por URL directa.

## ADDED Requirements

### Requirement: Familia autenticada accede a su panel
Una familia autenticada (rol `parent`) DEBE poder acceder a la ruta `/familiar` y verá el feed de publicaciones con el shell de familia (MUST).

#### Scenario: Familia en sesión navega a su panel
- **WHEN** un usuario con `claims.app_metadata.role = 'parent'` navega a `/familiar`
- **THEN** el servidor renderiza el feed dentro del shell de familia

#### Scenario: Familia sin sesión intenta acceder al panel
- **WHEN** un visitante sin sesión navega a `/familiar`
- **THEN** el servidor redirige a `/login?next=/familiar`

### Requirement: Sidebar de familia muestra navegación reducida
El shell de familia DEBE mostrar en su sidebar: Feed, Resumen del día (deshabilitado), Mi cuenta (deshabilitado). No incluirá el botón "Crear publicación". El bloque inferior tendrá avatar de iniciales en color lavanda, nombre, etiqueta de parentesco y botón de cerrar sesión (MUST).

#### Scenario: Render del sidebar de familia
- **WHEN** una familia ve el shell
- **THEN** la barra lateral contiene los tres elementos de navegación sin el botón "Crear publicación"

### Requirement: Personal es redirigido desde la ruta de familia
Un usuario con rol `staff` que llegue a `/familiar` por URL directa o enlace compartido DEBE ser redirigido a `/` (MUST).

#### Scenario: Personal llega al panel de familia
- **WHEN** un usuario con `role = 'staff'` navega a `/familiar`
- **THEN** el servidor redirige a `/`

### Requirement: Login redirige a la familia a su panel
Tras un inicio de sesión correcto con credenciales de familia, el sistema DEBE redirigir a `/familiar` (o al `?next=` si la URL solicitada es coherente con el rol) (MUST).

#### Scenario: Login de familia sin next
- **WHEN** un usuario con credenciales válidas de familia inicia sesión desde `/login`
- **THEN** el sistema redirige a `/familiar`

#### Scenario: Login de familia con next coherente
- **WHEN** un usuario familia inicia sesión desde `/login?next=/familiar`
- **THEN** el sistema redirige a `/familiar`

#### Scenario: Login de familia con next incoherente
- **WHEN** un usuario familia inicia sesión desde `/login?next=/`
- **THEN** el sistema ignora `next` y redirige a `/familiar`