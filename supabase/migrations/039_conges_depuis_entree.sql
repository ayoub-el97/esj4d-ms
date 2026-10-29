-- =============================================================================
-- 039 — Congés calculés depuis la date d'entrée en service (méthode par défaut)
--
--  Règle de l'entreprise : Solde congé = 1,5 j par mois complet de service depuis la date
--  d'entrée en service réelle (jusqu'à aujourd'hui) ; Solde pris = congés pris avant le système
--  (saisis) + congés approuvés et déjà pris dans l'application ; Solde restant = Solde congé −
--  Solde pris. Date d'entrée inconnue : aucun calcul (à compléter).
--  * Méthode par défaut : « congés pris avant le système » (pris_avant), pour les nouveaux
--    employés et pour les employés existants SANS solde initial saisi (registres papier).
--  * Les employés dont un solde initial confirmé a été saisi gardent la méthode « solde initial »
--    (leurs chiffres confirmés ne sont pas remplacés) ; l'administrateur peut changer la méthode.
--  Aucune donnée n'est supprimée ; les demandes de congés et l'historique sont conservés.
-- =============================================================================

alter table public.employees alter column leave_start_method set default 'pris_avant';

update public.employees e
   set leave_start_method = 'pris_avant'
 where e.leave_start_method = 'solde_initial'
   and not exists (select 1 from public.leave_adjustments la where la.employee_id = e.id and la.kind = 'conge' and la.category = 'solde_initial');

-- Données de reprise : administrateur uniquement (création : méthode par défaut seulement)
create or replace function public.employees_leave_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and (new.leave_tracking_start is distinct from (case when tg_op = 'UPDATE' then old.leave_tracking_start end)
          or new.leave_taken_before is distinct from (case when tg_op = 'UPDATE' then old.leave_taken_before end)
          or (tg_op = 'UPDATE' and new.leave_start_method is distinct from old.leave_start_method)
          or (tg_op = 'INSERT' and new.leave_start_method <> 'pris_avant')) then
    raise exception 'REPRISE_CONGES_ADMIN: seul un administrateur peut modifier les données de reprise des congés.';
  end if;
  return new;
end;
$$;
