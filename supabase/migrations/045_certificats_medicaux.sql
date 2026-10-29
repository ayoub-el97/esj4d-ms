-- =============================================================================
-- 045 — Certificats médicaux : PDF, entrée créée depuis le pointage « Absent maladie »
--
--  Réutilise le module existant (migration 036) : table medical_certificates (employé, période
--  de maladie, date de remise, statut, vérification) et documents dans le bucket privé « photos »
--  (entity_type = 'medical_certificate', accès réservé : pointage en modification, liens signés
--  temporaires, jamais d'URL publique). Aucune donnée existante n'est modifiée ou supprimée.
--
--  1. Le stockage accepte aussi les PDF (certificat scanné), 10 Mo maximum par fichier.
--  2. Pointage « Absent maladie » → entrée « En attente de certificat » créée automatiquement pour
--     la période de maladie (jours consécutifs, jours de repos / non pointés entre deux compris),
--     ou prolongée ; jamais de doublon (un jour déjà couvert par un certificat ne crée rien).
--     Pointage corrigé (plus « Absent maladie ») : l'entrée automatique encore vide (aucun document,
--     toujours « En attente ») est réduite ou retirée. Une entrée avec document n'est jamais touchée.
--  3. Reprise : les jours « Absent maladie » déjà pointés sans certificat reçoivent leur entrée.
-- =============================================================================

-- ---------- 1. PDF acceptés dans le bucket privé ----------------------------------------------
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}'::text[]) || array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) m),
       file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760)
 where id = 'photos';

-- ---------- 2. Entrée créée automatiquement depuis le pointage ------------------------------
alter table public.medical_certificates add column if not exists auto_created boolean not null default false;

-- Jour de maladie : au moins une ligne « Absent maladie » et aucune ligne travaillée ce jour
create or replace function public.is_sick_day(p_employee uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select bool_or(a.status::text = 'absent_maladie') and not bool_or(a.status::text in ('present', 'repos_travaille'))
    from public.attendance a
   where a.employee_id = p_employee and a.activity_date = p_date;
$$;

-- Aucun jour travaillé entre deux dates (exclues) : même épisode de maladie
create or replace function public.no_work_between(p_employee uuid, p_after date, p_before date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.attendance a
     where a.employee_id = p_employee and a.activity_date > p_after and a.activity_date < p_before
       and a.status::text in ('present', 'repos_travaille', 'absent'));
$$;

-- Entrée « En attente de certificat » encore vide (créée automatiquement, aucun document)
create or replace function public.certificate_is_empty_auto(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.medical_certificates c
     where c.id = p_id and c.auto_created and c.status = 'en_attente' and c.verification = 'non_verifiee'
       and not exists (select 1 from public.photos p where p.entity_type = 'medical_certificate' and p.entity_id = c.id));
$$;

create or replace function public.sync_sick_certificate(p_employee uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_start date;
  v_end date;
  v_min date;
  v_max date;
begin
  if p_employee is null or p_date is null then
    return;
  end if;
  if coalesce(public.is_sick_day(p_employee, p_date), false) then
    -- Déjà couvert par un certificat (automatique ou saisi) : rien à créer
    if exists (select 1 from public.medical_certificates c where c.employee_id = p_employee and p_date between c.start_date and c.end_date) then
      return;
    end if;
    -- Même épisode : entrée automatique vide juste avant (prolongée) ou juste après (avancée)
    select c.id into v_id from public.medical_certificates c
     where c.employee_id = p_employee and c.end_date < p_date and p_date - c.end_date <= 7
       and public.certificate_is_empty_auto(c.id) and public.no_work_between(p_employee, c.end_date, p_date)
     order by c.end_date desc limit 1;
    if v_id is not null then
      update public.medical_certificates set end_date = p_date where id = v_id;
      return;
    end if;
    select c.id into v_id from public.medical_certificates c
     where c.employee_id = p_employee and c.start_date > p_date and c.start_date - p_date <= 7
       and public.certificate_is_empty_auto(c.id) and public.no_work_between(p_employee, p_date, c.start_date)
     order by c.start_date limit 1;
    if v_id is not null then
      update public.medical_certificates set start_date = p_date where id = v_id;
      return;
    end if;
    insert into public.medical_certificates (employee_id, start_date, end_date, status, verification, auto_created, comment)
    values (p_employee, p_date, p_date, 'en_attente', 'non_verifiee', true, '');
  else
    -- Plus « Absent maladie » ce jour : l'entrée automatique encore vide suit le pointage
    for v_id, v_start, v_end in
      select c.id, c.start_date, c.end_date from public.medical_certificates c
       where c.employee_id = p_employee and p_date between c.start_date and c.end_date and public.certificate_is_empty_auto(c.id)
    loop
      select min(g.d::date), max(g.d::date) into v_min, v_max
        from generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') g(d)
       where g.d::date <> p_date and coalesce(public.is_sick_day(p_employee, g.d::date), false);
      if v_min is null then
        delete from public.medical_certificates where id = v_id;
      elsif v_min <> v_start or v_max <> v_end then
        update public.medical_certificates set start_date = v_min, end_date = v_max where id = v_id;
      end if;
    end loop;
  end if;
end;
$$;
revoke all on function public.sync_sick_certificate(uuid, date) from public;

create or replace function public.attendance_sick_certificate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_sick_certificate(old.employee_id, old.activity_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id or new.activity_date is distinct from old.activity_date or new.status is distinct from old.status) then
    perform public.sync_sick_certificate(new.employee_id, new.activity_date);
  end if;
  return null;
end;
$$;
drop trigger if exists attendance_sick_certificate on public.attendance;
create trigger attendance_sick_certificate after insert or update of status, employee_id, activity_date or delete on public.attendance
  for each row execute function public.attendance_sick_certificate();

-- Certificat saisi à la main (ou dates corrigées) : il remplace les entrées automatiques encore vides
-- qui le chevauchent (pas de doublon) ; les jours de maladie hors de sa période gardent leur entrée.
create or replace function public.medical_certificate_absorb_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  d date;
begin
  if new.auto_created and tg_op = 'INSERT' then
    return null;
  end if;
  for a in
    select c.id, c.start_date, c.end_date from public.medical_certificates c
     where c.employee_id = new.employee_id and c.id <> new.id
       and c.start_date <= new.end_date and c.end_date >= new.start_date
       and public.certificate_is_empty_auto(c.id)
  loop
    delete from public.medical_certificates where id = a.id;
    for d in select g::date from generate_series(a.start_date::timestamp, a.end_date::timestamp, interval '1 day') g loop
      if d < new.start_date or d > new.end_date then
        perform public.sync_sick_certificate(new.employee_id, d);
      end if;
    end loop;
  end loop;
  return null;
end;
$$;
drop trigger if exists medical_certificates_absorb_auto on public.medical_certificates;
create trigger medical_certificates_absorb_auto after insert or update of start_date, end_date, employee_id on public.medical_certificates
  for each row execute function public.medical_certificate_absorb_auto();

-- ---------- 3. Reprise des jours « Absent maladie » déjà pointés ------------------------------
do $$
declare r record;
begin
  for r in
    select distinct a.employee_id, a.activity_date
      from public.attendance a
     where a.status::text = 'absent_maladie'
     order by a.employee_id, a.activity_date
  loop
    perform public.sync_sick_certificate(r.employee_id, r.activity_date);
  end loop;
end $$;
