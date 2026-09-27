-- Fix del staff seed de SPEC 09: añadir los campos `provider` y `providers`
-- en `raw_app_meta_data` que Supabase Auth necesita para identificar el
-- provider (sin ellos, signInWithPassword devuelve 500 "Database error querying schema").
-- El trigger de SPEC 10 ya propaga estos campos a sign-ups futuros; este fix
-- solo aplica al row pre-existente.

update auth.users
   set raw_app_meta_data = raw_app_meta_data
                          || jsonb_build_object('provider', 'email')
                          || jsonb_build_object('providers', array['email'])
 where email = 'staff@opendaycare.com'
   and raw_app_meta_data -> 'provider' is null;
