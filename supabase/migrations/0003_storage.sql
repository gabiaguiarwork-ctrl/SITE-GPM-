-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0003 · Storage: bucket privado "materiais" (PDF) e bucket público "capas"
--
-- Rodar no SQL Editor DEPOIS da 0002. Idempotente.
--
-- - materiais: PRIVADO, só PDF, até 20 MB. Aluno ativo só consegue gerar
--   URL assinada (60 s, no clique) de arquivo ligado a conteúdo que ele
--   pode ver. Upload, troca e exclusão só para admin (aal2).
-- - capas: PÚBLICO (só as imagens de capa dos encontros), JPG/PNG/WebP até
--   2 MB. Qualquer um com o endereço vê a imagem; só admin envia ou apaga.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- materiais (privado)
-- ---------------------------------------------------------------------
drop policy if exists materiais_select on storage.objects;
create policy materiais_select on storage.objects for select to authenticated
  using (bucket_id = 'materiais' and ((select privado.is_admin()) or (select privado.material_visivel(name))));

drop policy if exists materiais_insert on storage.objects;
create policy materiais_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais' and (select privado.is_admin()) and lower(name) like '%.pdf');

drop policy if exists materiais_update on storage.objects;
create policy materiais_update on storage.objects for update to authenticated
  using (bucket_id = 'materiais' and (select privado.is_admin()))
  with check (bucket_id = 'materiais' and (select privado.is_admin()) and lower(name) like '%.pdf');

drop policy if exists materiais_delete on storage.objects;
create policy materiais_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materiais' and (select privado.is_admin()));

-- ---------------------------------------------------------------------
-- capas (público para leitura pelo endereço; listagem e escrita só admin)
-- ---------------------------------------------------------------------
drop policy if exists capas_select on storage.objects;
create policy capas_select on storage.objects for select to authenticated
  using (bucket_id = 'capas' and (select privado.is_admin()));

drop policy if exists capas_insert on storage.objects;
create policy capas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'capas' and (select privado.is_admin()) and lower(name) ~ '\.(jpg|jpeg|png|webp)$');

drop policy if exists capas_update on storage.objects;
create policy capas_update on storage.objects for update to authenticated
  using (bucket_id = 'capas' and (select privado.is_admin()))
  with check (bucket_id = 'capas' and (select privado.is_admin()) and lower(name) ~ '\.(jpg|jpeg|png|webp)$');

drop policy if exists capas_delete on storage.objects;
create policy capas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'capas' and (select privado.is_admin()));
