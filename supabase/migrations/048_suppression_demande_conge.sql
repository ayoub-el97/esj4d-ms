-- =============================================================================
-- 048 — Suppression d'une demande de congé (archivage)
--
--  Les demandes n'ont jamais été effacées physiquement (aucun droit DELETE) : une demande
--  « supprimée » est archivée (deleted_at, deleted_by, deletion_reason) et passe « Annulée », ce qui
--  la retire du solde et des calculs. Elle disparaît des écrans, reste dans la base et dans le journal
--  d'audit (qui, quand, motif, valeurs). L'employé et les autres demandes ne sont pas touchés.
--   * Demande saisie, acceptée : le congé est retiré du pointage (comme une annulation : statut
--     d'origine restauré, lignes créées par la demande retirées) ; solde recalculé.
--   * En attente, refusée, annulée : aucun effet sur le solde ni le pointage.
--   * Demande automatique (depuis le pointage) : l'utilisateur choisit le sort de la ligne de pointage :
--     garder « Congé » (le jour reste déduit, car le pointage fait foi) ou un autre statut (jour rendu).
--     La ligne n'est jamais supprimée, et la demande n'est pas recréée tant que l'employé n'est pas
--     de nouveau mis en « Congé » au pointage (dans ce cas, c'est une nouvelle demande).
--   * Journée clôturée : pointage non modifié, signalé à l'utilisateur.
-- =============================================================================

alter table public.leave_requests add column if not exists deleted_at timestamptz;
alter table public.leave_requests add column if not exists deleted_by uuid references auth.users (id);
alter table public.leave_requests add column if not exists deletion_reason text not null default '';

-- Une demande automatique archivée n'est jamais réactivée par le pointage
create or replace function public.attendance_auto_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Suppression définitive d'un contrat : pas de suivi des demandes
  if coalesce(current_setting('esj.suppression_contrat', true), '') = 'on' then
    return null;
  end if;
  -- Le statut quitte « Congé », ou la ligne est retirée : demande automatique annulée (jamais une demande manuelle)
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.status::text = 'conge' and new.status::text <> 'conge') then
    if not exists (select 1 from public.attendance a where a.employee_id = old.employee_id and a.activity_date = old.activity_date and a.status::text = 'conge') then
      perform set_config('esj.conge_depuis_pointage', 'on', true);
      update public.leave_requests lr
         set status = 'annulee', decision_note = 'Statut du pointage modifié', decided_at = now(), decided_by = auth.uid()
       where lr.source = 'pointage' and lr.status::text = 'acceptee' and lr.employee_id = old.employee_id
         and lr.start_date = old.activity_date and lr.end_date = old.activity_date;
      perform set_config('esj.conge_depuis_pointage', '', true);
    end if;
    return null;
  end if;

  if new.status::text <> 'conge' or (tg_op = 'UPDATE' and old.status::text = 'conge') then
    return null;
  end if;
  -- Une demande acceptée ou en attente couvre déjà cette date : pas de doublon
  if exists (select 1 from public.leave_requests lr
              where lr.employee_id = new.employee_id and new.activity_date between lr.start_date and lr.end_date
                and lr.status::text in ('acceptee', 'en_attente')) then
    return null;
  end if;
  perform set_config('esj.conge_depuis_pointage', 'on', true);
  -- Déjà créée puis annulée pour cette date (non supprimée) : la même demande est réactivée
  select lr.id into v_id from public.leave_requests lr
   where lr.source = 'pointage' and lr.deleted_at is null and lr.employee_id = new.employee_id
     and lr.start_date = new.activity_date and lr.end_date = new.activity_date
   order by lr.created_at limit 1;
  if v_id is not null then
    update public.leave_requests
       set status = 'acceptee', decision_note = '', decided_at = now(), decided_by = auth.uid(), source_attendance_id = new.id
     where id = v_id;
  else
    insert into public.leave_requests (employee_id, request_date, start_date, end_date, requested_days, reason, status, source, source_attendance_id, decided_by, decided_at)
    values (new.employee_id, new.activity_date, new.activity_date, new.activity_date, 1, '', 'acceptee', 'pointage', new.id, auth.uid(), now());
  end if;
  perform set_config('esj.conge_depuis_pointage', '', true);
  return null;
end;
$$;

-- p_attendance_status (demande automatique) : null = garder « Congé » au pointage ; sinon nouveau statut
create or replace function public.delete_leave_request(p_id uuid, p_reason text default '', p_attendance_status text default null)
returns table (kept_conge integer, changed integer, closed integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.leave_requests;
  a record;
  v_kept int := 0;
  v_changed int := 0;
  v_closed int := 0;
begin
  if not public.can_edit('conges') then
    raise exception 'ACCES_REFUSE: suppression non autorisée.';
  end if;
  select * into r from public.leave_requests where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'DEMANDE_INTROUVABLE: demande introuvable ou déjà supprimée.';
  end if;
  if p_attendance_status is not null and p_attendance_status not in ('present', 'absent', 'repos') then
    raise exception 'STATUT_INVALIDE: %', p_attendance_status;
  end if;

  if r.source = 'pointage' then
    -- Le pointage ne suit pas automatiquement : c'est le choix de l'utilisateur qui s'applique
    perform set_config('esj.conge_depuis_pointage', 'on', true);
    update public.leave_requests
       set status = 'annulee', deleted_at = now(), deleted_by = auth.uid(), deletion_reason = left(coalesce(p_reason, ''), 500), decision_note = 'Demande supprimée'
     where id = p_id;
    perform set_config('esj.conge_depuis_pointage', '', true);
    for a in
      select at.id, at.activity_date from public.attendance at
       where at.employee_id = r.employee_id and at.activity_date between r.start_date and r.end_date and at.status::text = 'conge'
    loop
      if public.is_day_closed(a.activity_date) then
        v_closed := v_closed + 1;
      elsif p_attendance_status is null then
        update public.attendance set leave_request_id = null where id = a.id;
        v_kept := v_kept + 1;
      else
        update public.attendance
           set status = p_attendance_status::public.attendance_status, leave_request_id = null, pre_leave_status = null
         where id = a.id;
        v_changed := v_changed + 1;
      end if;
    end loop;
  else
    -- Même effet qu'une annulation (déclencheur leave_requests_sync) ; sans effet si elle n'était pas acceptée
    update public.leave_requests
       set status = 'annulee', deleted_at = now(), deleted_by = auth.uid(), deletion_reason = left(coalesce(p_reason, ''), 500), decision_note = 'Demande supprimée'
     where id = p_id;
    select count(*)::int into v_closed from public.attendance at where at.leave_request_id = p_id and public.is_day_closed(at.activity_date);
  end if;
  return query select v_kept, v_changed, v_closed;
end;
$$;
revoke all on function public.delete_leave_request(uuid, text, text) from public;
grant execute on function public.delete_leave_request(uuid, text, text) to authenticated;
