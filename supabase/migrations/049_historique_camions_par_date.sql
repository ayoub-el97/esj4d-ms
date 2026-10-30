-- =============================================================================
-- 049 — Historique des rapports camions par date
--
--  Lecture seule : une ligne par date ayant au moins une ligne camion (du plus récent au plus
--  ancien), avec le nombre de camions, de lignes et le tonnage. Aucune donnée n'est modifiée.
-- =============================================================================

create or replace function public.truck_report_dates(p_from date default null, p_to date default null, p_truck uuid default null)
returns table (activity_date date, trucks integer, lines integer, tonnage numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view('rapport_camions') then
    raise exception 'ACCES_REFUSE: consultation des rapports camions non autorisée.';
  end if;
  return query
  select t.activity_date, count(distinct t.truck_id)::int, count(*)::int, coalesce(sum(t.tonnage_total), 0)
    from public.truck_daily_reports t
   where (p_from is null or t.activity_date >= p_from)
     and (p_to is null or t.activity_date <= p_to)
     and (p_truck is null or t.truck_id = p_truck)
   group by t.activity_date
   order by t.activity_date desc;
end;
$$;
grant execute on function public.truck_report_dates(date, date, uuid) to authenticated;
