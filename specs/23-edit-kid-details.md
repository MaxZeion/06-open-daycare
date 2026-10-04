# SPEC 23 — Editar datos de un niño desde su ficha

> **Status:** Aprobado
> **Depends on:** SPEC 02 (listado y perfil), SPEC 04 (modal agregar niño), SPEC 11 (niños desde Supabase)
> **Date:** 2026-10-04
> **Objective:** Permitir que el staff edite los datos existentes de un niño desde `/kids/[id]` mediante un modal precargado, guardando los cambios en `children` y manteniendo coherentes la ficha y el listado.

## Why this spec exists

SPEC 02 introdujo la ficha del niño y dejó el botón **Editar** como no-op visual. SPEC 11 sustituyó los mocks por datos reales desde `public.children`, pero dejó explícitamente fuera de scope la edición, el archivado y la baja de niños. El hueco actual es claro: el staff puede dar de alta niños nuevos, pero no corregir nombre, fecha, sala o notas de uno existente sin tocar la base de datos manualmente.

Este spec cierra ese hueco sin abrir todavía los problemas de ciclo de vida (`active`/`archived`), borrado ni vinculación real de padres. La meta es una primera edición útil, pequeña y verificable.

## Scope

**In:**

- Activar el botón **Editar** en la ficha `/kids/[id]` para abrir un modal de edición desde `app/(staff)/kids/[id]/ProfileClient.tsx`.
- Reutilizar el patrón visual, de accesibilidad y de validación base del modal existente `app/(staff)/_components/kids/AddKidModal.tsx`, pero con los datos del niño ya precargados.
- Permitir editar solo estos campos existentes de `public.children`:
  - `full_name`
  - `birth_date`
  - `room_id`
  - `allergy_tags`
  - `medical_notes`
- Mantener `full_name`, `birth_date` y `room_id` como obligatorios también en edición.
- Permitir limpiar `allergy_tags` y `medical_notes` dejando ambos campos vacíos.
- Mantener para alergias el mismo comportamiento que en el alta actual: input de texto libre que se convierte a tags reconocidas (`maní` → `peanut`, `lactosa` → `lactose`) mediante la lógica existente.
- Añadir una Server Action de actualización en `app/(staff)/kids/actions.ts` con validaciones equivalentes a `addKid`, update real en Supabase y mensajes de error en español.
- Revalidar la ficha del niño y el listado `/kids` tras guardar, para que al cerrar el modal se vea el nuevo dato en `/kids/[id]` y al volver a la lista se mantenga coherencia en nombre, sala y badges.
- Mantener el comportamiento actual de la ficha fuera del flujo de edición: botón “Volver a Niños”, tarjeta de datos, columna de padres y modal de vinculación siguen funcionando igual.

**Out of scope (for future specs):**

- Archivar un niño (`status='archived'`) o recuperarlo.
- Borrar niños de la base de datos.
- Exponer o editar `photo_consent` en la UI.
- Crear, quitar o modificar vínculos reales de padres (`parent_children`) o invitaciones (`invitations`).
- Cambiar el modelo de datos de `children`, añadir columnas nuevas o crear una migración nueva.
- Convertir el flujo de edición en una ruta dedicada `/kids/[id]/edit`.
- Añadir historial de cambios, confirmaciones de auditoría o control de concurrencia.

## Data model

No se introducen nuevas tablas, columnas, enums ni migraciones. Este spec reutiliza la tabla `public.children` creada en SPEC 11 y actualiza únicamente campos ya existentes.

```ts
// public.children (campos afectados por este spec)
type EditableChildFields = {
  full_name: string;
  birth_date: string; // ISO date
  room_id: string; // uuid
  allergy_tags: string[]; // p.ej. ["peanut"] | ["lactose"] | []
  medical_notes: string | null;
};
```

Convenciones:

- `birth_date` se sigue persistiendo como `date` ISO y se edita desde la misma máscara `dd/mm/aaaa` ya usada en el alta.
- `room_id` sigue apuntando a `rooms.id`; la UI muestra el nombre de la sala y persiste el UUID.
- `allergy_tags` sigue siendo la fuente de verdad; la UI no introduce un modelo alternativo con checkboxes ni catálogos nuevos.
- `medical_notes` puede pasar de texto a `null` cuando el campo se limpia.

## Implementation plan

Estructura de archivos prevista (nuevos en negrita, modificados marcados):

```
app/
  (staff)/
    _components/
      kids/
        AddKidModal.tsx        # (mod) extraer o compartir piezas reutilizables si compensa
        **EditKidModal.tsx**   # (nuevo) modal precargado para edición
        mapKid.ts              # (mod) reutilizar validaciones y conversión de alergias/fechas
    kids/
      actions.ts               # (mod) nueva Server Action de update
      [id]/
        page.tsx               # (mod) pasar datos iniciales del niño y salas al modal
        ProfileClient.tsx      # (mod) activar botón Editar y ciclo abrir/cerrar
```

1. Crear el contrato de edición en la ficha: `ProfileClient` deja de renderizar un botón no-op y pasa a controlar la apertura de un modal con los datos actuales del niño. *Funcional: la ficha sigue renderizando aunque todavía no guarde cambios.*
2. Implementar `EditKidModal` con el mismo patrón de overlay, focus trap, submit pending, validación cliente y cierre por éxito que `AddKidModal`. *Funcional: el modal abre, precarga y valida sin persistir aún.*
3. Añadir en `app/(staff)/kids/actions.ts` una acción `updateKid` (o nombre equivalente) que:
   - valide `child_id`, `full_name`, `birth_date` y `room_id`;
   - convierta alergias con `textToTags`;
   - normalice notas médicas vacías a `null`;
   - haga `update` en `public.children`;
   - revalide `/kids` y `/kids/[id]`.
   *Funcional: el update persiste aunque el wiring visual todavía sea mínimo.*
4. Conectar el modal con la Server Action y cerrar solo en éxito. Error de validación o de Supabase mantiene el modal abierto y muestra feedback en español. *Funcional: edición end-to-end desde la ficha.*
5. Ajustar la recarga de datos de `/kids/[id]` y `/kids` para que nombre, sala, edad derivada, badge de alergia y notas queden consistentes al cerrar el modal o volver atrás. *Funcional: la edición deja ambas pantallas sincronizadas.*
6. Verificar que el flujo de padres vinculados no se rompe: la columna derecha y `LinkParentModal` siguen igual y no forman parte del submit de edición. *Funcional: coexistencia sin regresiones.*
7. `npm run lint` y `npm run build` en verde como validación final del spec implementado. *Funcional: sin regresiones de tipado o build.*

## Acceptance criteria

- [ ] En `/kids/[id]`, pulsar **Editar** abre un modal de edición en lugar de ser un no-op.
- [ ] El modal se abre con los datos actuales del niño ya precargados: nombre completo, fecha, sala, alergias y notas médicas.
- [ ] `full_name`, `birth_date` y `room_id` siguen siendo obligatorios en edición; si alguno es inválido, el submit no se envía y se muestra el mismo estilo de error inline que en el alta.
- [ ] El campo de alergias mantiene el mismo comportamiento actual: texto libre con conversión a tags reconocidas; valores no reconocidos no rompen el guardado.
- [ ] Limpiar alergias y notas médicas y guardar deja `allergy_tags = []` y `medical_notes = null` en la fila del niño.
- [ ] Guardar una edición válida actualiza la fila correcta en `public.children`, cierra el modal y refresca la ficha con los nuevos datos.
- [ ] Tras guardar, volver a `/kids` muestra el nombre y la sala ya actualizados en la tarjeta del niño, sin requerir recarga manual.
- [ ] Cambiar la fecha de nacimiento actualiza la edad derivada visible en la ficha.
- [ ] Cambiar las alergias actualiza el badge o la caja de alergias de la ficha de forma coherente con el modelo actual.
- [ ] Si Supabase devuelve error en el update, el modal permanece abierto y muestra un mensaje de error en español; no se pierden los valores escritos por el usuario.
- [ ] El flujo de “Vincular otro padre” sigue funcionando igual que antes y no queda mezclado con el submit de edición.
- [ ] `npm run lint` y `npm run build` pasan sin errores tras implementar la spec.

## Decisions

- **Sí:** modal desde la ficha en lugar de ruta `/kids/[id]/edit`. Razón: el botón ya existe en la ficha y el patrón modal ya está asentado en esta área con `AddKidModal` y `LinkParentModal`.
- **Sí:** misma familia de validaciones que en `addKid`. Razón: evita divergencias entre alta y edición para los mismos campos.
- **Sí:** mantener alergias como texto libre con la conversión existente a tags. Razón: no introduce un modelo visual o de persistencia nuevo solo para edición.
- **Sí:** permitir limpiar alergias y notas médicas. Razón: si un dato fue cargado por error, el staff necesita poder dejarlo vacío sin soluciones manuales.
- **Sí:** revalidar ficha y listado. Razón: editar y seguir viendo datos viejos haría parecer que el guardado falló.
- **No:** incluir `photo_consent`. Razón: hoy no forma parte de la ficha visible ni del flujo de alta; abrirlo aquí mezclaría un requisito nuevo con otro ya acotado.
- **No:** incluir `status='archived'` o borrado. Razón: son decisiones de ciclo de vida y seguridad distintas; merecen su propia spec.
- **No:** incluir vinculación real de padres o invitaciones. Razón: toca `parent_children`, `invitations`, permisos y estados que no pertenecen a la edición básica de `children`.
- **No:** añadir migración nueva. Razón: todos los datos necesarios ya existen en `public.children`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Duplicar lógica entre `AddKidModal` y el modal de edición | Extraer helpers compartidos solo si reduce duplicación real; si no, mantener el alcance pequeño y aceptar duplicación local controlada. |
| Revalidar solo la ficha deja `/kids` con datos viejos | La Server Action revalida tanto `/kids` como la ruta del niño editado. |
| Limpiar alergias/notas no persiste correctamente y deja residuos | Acceptance criterion específico para comprobar `[]` y `null` en BD. |
| Cambiar `birth_date` sin recalcular bien la edad crea incoherencia visual | La ficha debe seguir derivando la edad desde la fecha persistida tras el refresh. |
| El modal de edición interfiere con `LinkParentModal` o con la columna de padres | Mantener ambos flujos separados en `ProfileClient` y verificar explícitamente que vinculación sigue igual. |

## What is **not** in this spec

- Archivar, desarchivar o borrar niños.
- Editar `photo_consent`.
- Crear, quitar o modificar vínculos reales de padres o invitaciones.
- Añadir una página de edición separada.
- Cambiar el esquema de la base de datos o crear migraciones nuevas.

Cada una de esas, si llega, va en su propio spec.