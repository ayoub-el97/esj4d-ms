-- =============================================================================
-- 043 — Historique du pointage : journal des modifications d'une feuille
--
--  Le pointage est déjà conservé ligne par ligne et par date (table attendance, jamais écrasée
--  par une autre date) et chaque création / modification / suppression est journalisée
--  (audit_log : utilisateur, date, anciennes et nouvelles valeurs). Cette fonction lit ce journal
--  pour une date et une équipe, pour l'afficher sous la feuille de présence.
-- =============================================================================

create or replace function public.attendance_day_audit(p_date date, p_team text)
returns table (at timestamptz, action text, user_email text, employee_id uuid, old_data jsonb, new_data jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('pointage') then
    raise exception 'ACCES_REFUSE: consultation du pointage non autorisée.';
  end if;
  return query
  select l.created_at, l.action, l.user_email,
         (coalesce(l.new_data, l.old_data) ->> 'employee_id')::uuid, l.old_data, l.new_data
    from public.audit_log l
   where l.table_name = 'attendance'
     and coalesce(l.new_data, l.old_data) ->> 'activity_date' = p_date::text
     and (coalesce(l.new_data ->> 'team_type', '') = p_team or coalesce(l.old_data ->> 'team_type', '') = p_team)
   order by l.created_at desc
   limit 500;
end;
$$;
grant execute on function public.attendance_day_audit(date, text) to authenticated;
