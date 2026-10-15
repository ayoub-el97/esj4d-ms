# ESJ-4D — Système de gestion Collecte & Nettoiement

Application web responsive (ordinateur et téléphone), entièrement en français, pour la gestion quotidienne d'une société de collecte et de nettoiement : pointage, rapports journaliers, rapport camions, congés, avertissements, programme de travail, déchet vert, rapports travailleurs, clôture de journée.

**Pile technique (gratuite)** : Next.js 16 (React, TypeScript, Tailwind, shadcn/ui) hébergé sur Vercel · Supabase (PostgreSQL, authentification, stockage privé des photos) · GitHub.

---

## 1. Mise en place (une seule fois)

### 1.1 Prérequis sur l'ordinateur (WSL Ubuntu)

```bash
# Node.js via nvm (déjà fait si vous suivez ce guide depuis le début)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
cd ~/ESJ-4D/ms
npm install
```

### 1.2 Projet Supabase

1. Sur https://supabase.com, créez un compte (connexion avec GitHub), puis **New project** : nom `esj4d-ms`, mot de passe de base de données fort (à conserver), région Europe de l'Ouest.
2. **Project Settings → API** : notez `Project URL`, `anon public key` et `service_role key` (secrète).
3. **Authentication → Providers → Email** : désactivez *Confirm email* pendant la phase de test.
4. **SQL Editor → New query** : collez le contenu de `supabase/schema_complete.sql` et exécutez (**Run**). Cela crée toutes les tables, règles de sécurité, fonctions et le bucket de photos.
5. **Authentication → Users → Add user → Create new user** : votre e-mail + mot de passe (cochez *Auto Confirm User*).
6. **SQL Editor** : donnez-vous le rôle administrateur, puis chargez les données de démonstration :
   ```sql
   update public.profiles set role = 'admin' where email = 'votre@email.com';
   ```
   puis collez/exécutez `supabase/seed.sql` (employés, camions et jours fériés fictifs).

### 1.3 Variables d'environnement

Copiez `.env.example` vers `.env.local` et remplissez avec les valeurs de l'étape 1.2 :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # serveur uniquement, jamais dans le navigateur
RESEND_API_KEY=                    # facultatif (envoi d'e-mails)
EMAIL_FROM=                        # facultatif, ex. "ESJ-4D <rapports@votre-domaine.com>"
```

### 1.4 Lancer en local

```bash
npm run dev
```
Ouvrez http://localhost:3000 et connectez-vous avec le compte créé à l'étape 1.2.5.

### 1.5 Déployer sur Vercel

1. Créez un dépôt GitHub privé `esj4d-ms` et poussez le code :
   ```bash
   git remote add origin https://github.com/VOTRE_COMPTE/esj4d-ms.git
   git push -u origin main
   ```
2. Sur https://vercel.com → **Add New Project** → importez `esj4d-ms`.
3. **Environment Variables** : ajoutez les mêmes variables que `.env.local` (au minimum les trois `SUPABASE`).
4. **Deploy**. L'URL `https://esj4d-ms.vercel.app` est utilisable sur téléphone. Chaque `git push` sur `main` redéploie automatiquement.
5. Dans Supabase, **Authentication → URL Configuration** : *Site URL* = votre URL Vercel.

---

## 2. Utilisation

| Module | Ce qu'il fait |
|---|---|
| Pointage | Feuilles de présence nettoiement / collecte par date (chauffeurs avec leurs rippeurs, remplaçants, 2e service), historique filtrable, rapport mensuel, export PDF |
| Rapport journalier | Nettoiement (lieux + photos avant/après par agent, PDF une page par agent), Collecte (camion, équipe, secteurs, tonnages, photos), Global (tableau camions + récapitulatif nettoiement) |
| Rapport camions | Suivi journalier des véhicules, alimenté automatiquement par les rapports de collecte, historique, mensuel, PDF |
| Congés | Demandes (en attente / acceptée / refusée), soldes acquis / pris / restant (1,5 j/mois paramétrable), ajustements tracés |
| Avertissements | Incidents par employé avec photos justificatives, compteur par période |
| Programme de travail | Tâches planifiées, agents affectés, photos avant / après, marquage réalisé |
| Déchet vert | Interventions avec photos avant / après |
| Rapports travailleurs | Dossier complet d'un employé sur une période |
| Clôturer la journée | Clôture manuelle avec résumé et confirmation ; réouverture par un administrateur avec justification (journal d'audit) |
| Paramètres | Comptes et rôles, permissions par module, réglages (société, e-mail du directeur, règles), jours fériés, journal d'audit |

**Rôles** : Directeur/Administrateur (tout), Secrétaire (saisie + rapports), Contrôleur/Superviseur (pointage, équipes, interventions, photos), Lecture seule. Les droits sont modifiables dans *Paramètres → Permissions*.

**Export PDF** : aperçu → vérification → confirmation → téléchargement → copie à l'e-mail du directeur. Tant que Resend n'est pas configuré, l'application indique clairement que l'e-mail n'a pas été envoyé.

---

## 3. Développement

```bash
npm run dev      # serveur de développement
npm run build    # vérification de compilation (à lancer avant de pousser)
npm run lint     # analyse statique
```

- `app/` pages (App Router), `components/` interface, `lib/actions/` Server Actions (écritures), `lib/data/` lectures, `lib/pdf/` modèles PDF, `supabase/migrations/` schéma SQL versionné.
- Pour modifier le schéma : ajouter un fichier `supabase/migrations/00N_xxx.sql`, l'exécuter dans l'éditeur SQL de Supabase (ou `npx supabase db push` après `npx supabase link`), puis régénérer `schema_complete.sql` avec `cat supabase/migrations/*.sql > supabase/schema_complete.sql`.

## 4. Sauvegardes

Supabase conserve des sauvegardes quotidiennes (plan gratuit : 7 jours). Pour une sauvegarde manuelle : **Database → Backups**, ou `pg_dump` avec la chaîne de connexion de *Project Settings → Database*. Les photos sont dans le bucket `photos` (Storage).

## 5. Limites du plan gratuit

- Le projet Supabase se met en pause après 7 jours sans activité : un clic sur *Restore* dans le tableau de bord le relance (aucune perte de données).
- 500 Mo de base, 1 Go de photos (compressées à ~300 Ko chacune, soit ~3 000 photos).
- Vercel Hobby est réservé à un usage non commercial : prévoir le plan Pro avant la mise en production.

## 6. Points à confirmer avant la production

- Adresse e-mail du directeur et service d'envoi (Resend : clé API + domaine vérifié).
- Règle de calcul du « jour doublé » (par défaut : jour de repos travaillé OU deux services le même jour, modifiable dans Réglages).
- Champs définitifs du rapport camions.
- Personnes autorisées à clôturer / rouvrir une journée (par défaut : rôles avec droit « Clôturer » / administrateurs).
