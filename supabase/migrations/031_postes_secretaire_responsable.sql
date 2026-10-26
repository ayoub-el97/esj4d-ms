-- =============================================================================
-- 031 — Postes : ajout de « Secrétaire » et « Responsable », retrait de « Agent de sécurité »
--
--  * Nouveaux postes secretaire et responsable (équipe administrative rattachée à la collecte,
--    comme mécanicien, gardien, directeur : pointés sur la feuille Collecte, groupes dédiés).
--  * « Agent de sécurité » n'est plus proposé (l'application le retire des listes et refuse de
--    l'attribuer à une fiche). La valeur reste dans la base : les employés qui l'ont et tout leur
--    historique (pointage, rapports) sont conservés tels quels ; leur poste est à mettre à jour
--    lors de la prochaine modification de leur fiche. Aucune donnée n'est modifiée ici.
-- =============================================================================

alter type public.employee_position add value if not exists 'secretaire';
alter type public.employee_position add value if not exists 'responsable';

alter table public.employees drop constraint if exists employees_team_position_chk;
alter table public.employees add constraint employees_team_position_chk check (
  (position::text in ('chauffeur', 'rippeur', 'chauffeur_remplacant', 'rippeur_remplacant', 'superviseur', 'chef_equipe', 'agent_securite',
                      'mecanicien', 'gardien', 'directeur', 'autre', 'secretaire', 'responsable') and team_type = 'collecte') or
  (position::text = 'balayeur' and team_type = 'nettoiement')
);
