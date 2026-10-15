# Cahier des charges — Système de gestion d’une société de collecte et de nettoiement

## 1. Objectif général
Créer une application web responsive de gestion quotidienne d’une société qui réalise deux activités distinctes : **Collecte** et **Nettoiement**. L’interface doit être entièrement en français et fonctionner sur ordinateur et téléphone.

La première version est expérimentale : elle doit permettre de tester les fonctionnalités avec un compte de démonstration et des données de test. Préparer néanmoins une authentification réelle et des permissions configurables pour la mise en production.

Utiliser une vraie base de données et un stockage sécurisé des photos. Ne pas utiliser `localStorage` comme stockage principal.

## 2. Connexion, rôles et permissions
- Première page : connexion avec nom d’utilisateur et mot de passe.
- Après connexion réussie : ouvrir le tableau de bord.
- Prévoir une déconnexion.
- Préparer des rôles configurables :
  - **Directeur / Administrateur** : accès complet, paramètres, comptes, clôture et réouverture des journées.
  - **Secrétaire** : saisie et modification des données autorisées, rapports et exports.
  - **Contrôleur / Superviseur** : pointage, équipes, interventions et photos selon les permissions.
  - **Lecture seule** : consultation sans modification.
- Pour la version expérimentale, fournir un mode démo ou un compte de test sécurisé. Ne pas intégrer de mots de passe secrets en dur dans le code côté navigateur.
- Les comptes réels et permissions devront pouvoir être configurés avant la mise en production.

## 3. Tableau de bord
Après connexion, afficher les modules :
1. **Pointage**
2. **Rapport journalier**
3. **Rapport mensuel**
4. **Rapport camions**
5. **Congés**
6. **Avertissements**
7. **Programme de travail**
8. **Déchet vert**
9. **Rapports travailleurs**
10. **Clôturer la journée / Close System**

Chaque module doit proposer un accès **Accueil** pour revenir au tableau de bord.

## 4. Journée de travail et clôture manuelle
La clôture doit être une action manuelle et ne doit pas se produire automatiquement à minuit. Les équipes peuvent commencer à travailler un jour et les informations finales peuvent être saisies le lendemain, notamment lorsqu’un camion travaille de nuit.

- Distinguer la **date de l’activité** de la **date/heure de saisie**.
- Autoriser la saisie et la modification d’informations pour une date précédente tant que la journée n’est pas clôturée.
- Avant clôture, afficher un résumé et demander une confirmation.
- Après clôture, conserver toutes les données dans l’historique.
- Autoriser la réouverture uniquement aux rôles habilités, avec justification et journal d’audit.
- La clôture ne doit jamais supprimer de données.

## 5. Pointage et gestion des employés

### 5.1 Deux catégories d’équipes

**Équipe de collecte**
- Postes : **Chauffeur** et **Rippeur**.
- Les chauffeurs sont associés à un camion identifié par son matricule.
- Les rippeurs sont rattachés au chauffeur/à l’équipe avec lesquels ils travaillent.
- Prévoir l’affectation d’un remplaçant lorsqu’un agent est en repos.
- La liste doit présenter les chauffeurs avec les rippeurs de leur équipe.

**Équipe de nettoiement**
- Poste principal : **Balayeur**.
- Liste distincte des agents de nettoiement.

Pour chaque employé, enregistrer au minimum : numéro d’ordre, matricule/identifiant, nom et prénom, poste, équipe, statut actif/inactif et affectation éventuelle. Permettre d’ajouter, modifier, désactiver et consulter un employé. Numéroter les employés de 1 jusqu’au dernier employé.

### 5.2 Page Pointage
Afficher la date d’activité et trois actions :
- **Feuille de présence des équipes de nettoiement**
- **Feuille de présence des équipes de collecte**
- **Nouvel équipier**

Chaque feuille comporte le logo, l’agence, le chef d’équipe et la date, puis un tableau avec :
- NB / numéro d’ordre
- Poste
- Nom et prénom
- Repos / jour habituel de repos
- Heure d’entrée
- Heure de sortie
- Heures supplémentaires
- Statut ou motif : présent, repos, jour férié, absent, absent maladie
- Observation

Pour la collecte, présenter les chauffeurs et les rippeurs rattachés à chacun d’eux, ainsi que les remplaçants affectés pour une date donnée.

### 5.3 Historique du pointage
- Enregistrer chaque journée.
- Filtrer par date, employé, équipe, poste et statut.
- Consulter les pointages précédents et les modifier uniquement si les permissions le permettent.
- Conserver la trace des modifications.

### 5.4 Rapport mensuel de pointage
Pour chaque employé, calculer :
- Nombre de jours travaillés.
- Nombre d’absences.
- Nombre de jours de congé.
- Nombre de jours fériés travaillés.
- Nombre de jours doublés, selon la règle métier à confirmer.
- Total des heures supplémentaires.

### 5.5 Export PDF du pointage
L’export doit fonctionner en plusieurs étapes :
1. Générer un aperçu PDF.
2. Laisser l’utilisateur vérifier le document.
3. Demander confirmation.
4. Télécharger le PDF après confirmation.
5. Envoyer une copie à l’adresse e-mail du directeur, configurable dans les paramètres.

Si l’envoi d’e-mail n’est pas configuré en mode test, afficher clairement cette limite. Ne jamais annoncer qu’un e-mail a été envoyé si l’envoi a échoué.

Boutons selon la page : **Export PDF**, **Historique**, **Rapport mensuel**, **Accueil**.

## 6. Rapport journalier
La page Rapport journalier contient trois sous-modules :
- **Rapport journalier — Nettoiement**
- **Rapport journalier — Collecte**
- **Rapport journalier global**

### 6.1 Rapport journalier — Nettoiement
- Afficher la date d’activité.
- Préremplir la liste avec les agents présents dans le pointage de la même date.
- Autoriser l’ajout ou le retrait d’un agent dans le rapport sans modifier le pointage d’origine.
- Saisir manuellement le lieu de travail pour chaque agent.
- Ajouter plusieurs photos **AVANT** et plusieurs photos **APRÈS** le nettoyage, par téléchargement ou prise de photo depuis un téléphone.
- Ajouter des commentaires/observations.
- Enregistrer les informations.
- Générer un PDF avec **une page par agent**, contenant la date, le nom, le lieu et deux sections distinctes pour les photos AVANT et APRÈS.
- Prévoir **Historique**, **Export PDF** et **Accueil**.

### 6.2 Rapport journalier — Collecte
- Choisir le camion à partir de son matricule.
- Sélectionner le chauffeur et les rippeurs de son équipe.
- Préremplir l’équipe à partir des affectations, tout en permettant de modifier la composition pour cette date.
- Saisir les lieux/secteurs de travail.
- Ajouter plusieurs photos avant/après si nécessaire.
- Ajouter observations et commentaires.
- Enregistrer et exporter en PDF.
- Prévoir **Historique**, **Export PDF** et **Accueil**.

### 6.3 Rapport journalier global
Créer un récapitulatif de la journée, en s’inspirant du tableau fourni dans le PDF de référence.

**Partie Collecte — tableau des camions**
- Marque du camion.
- Matricule du camion.
- Nom du chauffeur.
- Numéro de ticket.
- Tonnage.
- Deuxième numéro de ticket/tonnage si plusieurs pesées sont enregistrées.
- Nombre de vidages.
- Nombre de rippeurs.

**Partie Nettoiement — tableau récapitulatif**
- Effectif prévu ou par zone.
- Durée de travail.
- Nombre d’agents actifs.
- Malades.
- Congés payés.
- Absents.
- Jours fériés.
- Repos.
- Total.

Afficher la date en haut et présenter les deux tableaux de façon claire. Prévoir **Historique**, **Export PDF**, **Rapport mensuel** et **Accueil**. Permettre d’ajouter une nouvelle ligne ou un nouvel élément lorsque nécessaire.

## 7. Rapport mensuel
Créer une vue mensuelle regroupant les données du pointage et des rapports journaliers. Filtres : mois, catégorie, employé, équipe et camion. Les totaux doivent être calculés depuis les données enregistrées et éviter les doublons.

## 8. Rapport camions
Créer un module de suivi journalier des véhicules, avec :
- Marque.
- Matricule.
- Chauffeur.
- Numéro de ticket.
- Tonnage.
- Deuxième ticket et tonnage si nécessaire.
- Nombre de vidages.
- Nombre de rippeurs.
- Kilométrage et carburant si ces informations sont saisies.
- Observations.

Permettre de filtrer par date et matricule, consulter l’historique, afficher un rapport mensuel et exporter en PDF. Réutiliser les données du rapport Collecte pour limiter la double saisie.

## 9. Congés
La page Congés comprend :

### Nouvelle demande
- Choisir l’employé.
- Saisir les dates et un motif facultatif.
- Statut : en attente, acceptée ou refusée.
- Distinguer les demandes des congés effectivement approuvés et pris.

### Historique
Pour chaque employé, afficher :
- Congés acquis.
- Congés pris.
- Total cumulé.
- Solde restant.
- Dates des congés.

Filtres par jour, mois, période et employé. Prévoir **Historique**, **Export PDF**, **Rapport mensuel** et **Accueil**.

Règle initiale : acquisition de **1,5 jour par mois (3 jours tous les deux mois)**, configurable par un administrateur. Les ajustements doivent être traçables.

## 10. Avertissements
Afficher la date et une action **Nouvelle demande** pour créer un avertissement :
- Employé concerné.
- Date de l’incident.
- Description de la faute ou de l’incident.
- Possibilité de prendre ou télécharger plusieurs photos justificatives.
- Observations et statut de suivi si nécessaire.

L’historique doit permettre de rechercher un employé, de consulter tous ses avertissements et de compter le nombre d’avertissements sur une période. Prévoir filtres, **Export PDF**, **Rapport mensuel** et **Accueil**. Restreindre l’accès selon les permissions.

## 11. Déchet vert
Module simple consacré aux déchets verts (branches, feuilles et résidus végétaux) :
- Date.
- Lieu facultatif.
- Photos **AVANT** et **APRÈS**, avec possibilité de prendre ou importer plusieurs photos.
- Commentaire facultatif.
- Historique, Export PDF, Rapport mensuel et Accueil.

## 12. Programme de travail
- Créer une tâche avec date prévue, lieu saisi manuellement, description et agents affectés.
- Ajouter une photo de l’endroit avant l’intervention si disponible.
- Afficher les tâches pour la date sélectionnée.
- Après le travail, ajouter les photos après, les commentaires et marquer la tâche comme réalisée.

## 13. Rapports travailleurs
Permettre de consulter par employé et par période :
- Pointages, absences et congés.
- Lieux de travail.
- Interventions réalisées.
- Photos avant/après.
- Avertissements selon les permissions.
- Observations et historique.

Prévoir filtres et export PDF.

## 14. Photos, sécurité et journal d’audit
- Autoriser plusieurs photos par section.
- Afficher des miniatures et ouvrir les images en grand.
- Associer chaque image à la date, l’employé, le lieu et le rapport/intervention.
- Stocker les images en privé et contrôler les accès.
- Gérer les erreurs d’envoi et permettre de réessayer.
- Enregistrer qui a créé/modifié/supprimé des données et à quel moment.
- Prévoir sauvegardes régulières et restauration.
- Ne pas exposer de clés secrètes dans le navigateur.

## 15. Instructions pour Claude
1. Examiner le projet existant, son architecture, la base de données et les modules déjà présents.
2. Ne pas reconstruire depuis zéro si une application existe déjà.
3. Présenter un plan d’implémentation avant de modifier le code.
4. Préserver les fonctions déjà opérationnelles.
5. Implémenter progressivement et créer les migrations nécessaires.
6. Tester connexion, permissions, pointage, saisie rétroactive, clôture/réouverture, photos multiples, PDF, filtres, congés et avertissements.
7. Signaler les services externes à configurer, notamment l’envoi d’e-mails.
8. Garder toute l’interface en français.

## 16. Points à confirmer avant la production
- Adresse e-mail du directeur.
- Règle exacte de calcul d’un « jour doublé ».
- Champs définitifs des rapports camions et leur mode de calcul.
- Service d’envoi d’e-mails à utiliser.
- Politique de clôture et personnes autorisées à rouvrir une journée.
