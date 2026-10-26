-- =============================================================================
-- 029 — Matricule des employés facultatif
--
--  * employees.matricule peut rester vide (null). S'il est renseigné, il reste unique
--    (la contrainte unique existante accepte plusieurs valeurs nulles).
--  * Les enregistrements sont identifiés par leur identifiant interne (id), jamais par le matricule.
--  * Les doublons sans matricule sont empêchés par l'application (même nom et prénom).
--  * Suppression définitive : confirmation par le matricule, ou par le mot SUPPRIMER si l'employé
--    n'en a pas. Aucune donnée existante n'est modifiée.
-- =============================================================================

alter table public.employees alter column matricule drop not null;
-- Un matricule vide est enregistré comme absent (jamais une chaîne vide)
alter table public.employees drop constraint if exists employees_matricule_not_blank;
alter table public.employees add constraint employees_matricule_not_blank check (matricule is null or length(trim(matricule)) > 0) not valid;

create or replace function public.delete_employee(p_employee uuid, p_confirm_matricule text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  deps text;
begin
  if not public.is_admin() then
    raise exception 'SUPPRESSION_REFUSEE: seul un administrateur peut supprimer définitivement un employé.';
  end if;
  select * into e from public.employees where id = p_employee for update;
  if not found then
    raise exception 'EMPLOYE_INTROUVABLE';
  end if;
  if coalesce(trim(p_confirm_matricule), '') is distinct from coalesce(e.matricule, 'SUPPRIMER') then
    raise exception 'CONFIRMATION_INVALIDE: saisissez le matricule exact (ou SUPPRIMER si l''employé n''a pas de matricule).';
  end if;
  select string_agg(d.label || ' (' || d.records || ')', ', ') into deps from public.employee_dependencies(p_employee) d;
  if deps is not null then
    raise exception 'EMPLOYE_HISTORIQUE|%', deps;
  end if;
  update public.employees set substitute_id = null where substitute_id = p_employee;
  update public.employees set chauffeur_id = null where chauffeur_id = p_employee;
  update public.team_leads set employee_id = null where employee_id = p_employee;
  delete from public.employees where id = p_employee;
end;
$$;
