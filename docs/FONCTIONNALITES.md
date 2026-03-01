# 📘 Documentation des Fonctionnalités — Co-Caisse

> **Version :** 2.0  
> **Date :** Février 2026  
> **Périmètre :** Application client (`client/src/renderer/app.js`) — hors co-caisse-admin

---

## 📋 Table des Matières

1. [Architecture Générale](#1-architecture-générale)
2. [Système de Licence](#2-système-de-licence)
3. [Authentification & Gestion de Session](#3-authentification--gestion-de-session)
4. [Gestion des Rôles & Accès aux Modules](#4-gestion-des-rôles--accès-aux-modules)
5. [Module Caisse (POS)](#5-module-caisse-pos)
6. [Module Commandes](#6-module-commandes)
7. [Module Cuisine](#7-module-cuisine)
8. [Module Historique](#8-module-historique)
9. [Module Statistiques / Dashboard](#9-module-statistiques--dashboard)
10. [Module Gestion](#10-module-gestion)
11. [Système d'Alertes & Notifications](#11-système-dalertes--notifications)
12. [Paramètres Généraux](#12-paramètres-généraux)
13. [Panel Admin (Licences)](#13-panel-admin-licences)
14. [Relations entre Modules](#14-relations-entre-modules)
15. [Récapitulatif des Accès par Rôle](#15-récapitulatif-des-accès-par-rôle)

---

## 1. Architecture Générale

Co-Caisse est une application **Electron + Vanilla JS** avec un backend **Node.js/Express** et une base **SQLite** (ou MariaDB selon la configuration).

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (Electron)                │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐            │
│  │  Caisse  │ │Commandes │ │  Cuisine  │  ...        │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘            │
│       └────────────┴─────────────┘                   │
│                  apiFetch() ← JWT Auth               │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP / REST
┌──────────────────────▼──────────────────────────────┐
│              BACKEND Express (port 5000)             │
│  /api/transactions  /api/orders  /api/products ...   │
│            Middleware JWT (authMiddleware)            │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │  Base de données│
              │  SQLite / MariaDB│
              └─────────────────┘
```

### Flux de démarrage
1. Vérification de la **licence** (`/api/licences/status`)
2. Restauration de la **session JWT** depuis `localStorage`
3. Vérification de l'utilisateur sur `/api/users/me`
4. Filtrage du menu selon le **rôle** et les **modules de la licence**
5. Affichage de la section par **défaut selon le rôle**
6. Démarrage du **polling des alertes**

---

## 2. Système de Licence

### 2.1 Modes de licence

| Type | Description | Durée |
|------|-------------|-------|
| `trial` | Essai gratuit | 7 jours |
| `perpetual` | Licence à vie | Illimitée |
| `subscription` | Abonnement | Selon contrat |

### 2.2 États possibles

| État | Comportement |
|------|--------------|
| Aucune licence | Écran d'activation obligatoire |
| Trial actif | Bandeau ⏳ discret + app fonctionnelle |
| Trial expiré | Écran bloquant — demande d'activation |
| Licence expirée / suspendue | Écran bloquant — contact support |
| Licence active | Badge dans le header + accès complet |

### 2.3 Modules contrôlés par la licence

Chaque licence définit une liste de **modules autorisés**. Le module `caisse` est toujours inclus.

| Module | Description |
|--------|-------------|
| `caisse` | Encaissement — **toujours inclus** |
| `cuisine` | Interface cuisine & gestion des statuts |
| `commandes` | Prise de commandes en salle |
| `historique` | Historique des transactions & exports |
| `statistiques` | Rapports de ventes & analytics |
| `gestion` | Produits, catégories, utilisateurs, paramètres |

### 2.4 Onglet 🔒 "Plus de fonctionnalités"

Visible si au moins un module n'est **pas inclus** dans la licence.  
Affiche tous les modules non activés avec un bouton de contact par email pour en demander l'activation.

### 2.5 Activation

L'utilisateur peut :
- **Démarrer un essai** (bouton "🚀 Démarrer l'essai gratuit")
- **Activer une clé** au format `CCZ-XXXX-XXXX-XXXX` avec sélection des modules

---

## 3. Authentification & Gestion de Session

### 3.1 Connexion

- Formulaire login/password envoyé en `POST /api/users/login`
- En cas de succès : **token JWT** stocké en mémoire (`_jwtToken`) ET en `localStorage` (`jwt_token`)
- L'utilisateur courant est sauvegardé dans `localStorage` (`currentUser`)

### 3.2 Restauration de session

Au démarrage, si un token JWT est présent dans `localStorage` :
- Vérification sur `/api/users/me` pour valider que le token est encore valide
- Si valide → session restaurée silencieusement
- Si 401 → déconnexion silencieuse (voir §3.4)
- Si serveur inaccessible → session locale conservée (mode offline)

### 3.3 Déconnexion manuelle

- Bouton "Se déconnecter" → popin de confirmation ("Se déconnecter / Rester connecté")
- Si confirmé :
  1. Arrêt du polling des alertes (`stopAlertPolling()`)
  2. Vidage de `alertsRaw` et `alerts`
  3. Suppression de toutes les notifications visibles (`clearAllToasts()`)
  4. Nettoyage du token et de l'utilisateur dans `localStorage`
  5. Retour à l'écran de login

### 3.4 Expiration automatique du token (401)

Mécanisme centralisé via `_handleTokenExpired()` :

- **Un seul déclenchement** garanti par le flag global `_isRedirecting`
- Arrêt immédiat du polling des alertes
- Vidage des données d'alertes résiduelles
- Suppression de toutes les notifications visibles
- Nettoyage du `localStorage`
- Redirection **silencieuse** vers l'écran de login (sans toast, sans popin)

> ⚙️ Durée d'expiration du token : configurée via `JWT_EXPIRES_IN` dans `server/.env` (défaut : `8h`)

---

## 4. Gestion des Rôles & Accès aux Modules

### 4.1 Rôles disponibles

| Rôle | Description |
|------|-------------|
| `admin` | Accès total — pas de restriction de module ni de rôle |
| `manager` | Accès dashboard, historique, statistiques |
| `cashier` | Caisse, commandes, historique |
| `cook` | Interface cuisine uniquement |

### 4.2 Section par défaut selon le rôle

| Rôle | Section affichée au login |
|------|--------------------------|
| `admin` | Caisse (pos) |
| `manager` | Dashboard |
| `cashier` | Caisse (pos) |
| `cook` | Cuisine (kitchen) |

### 4.3 Filtrage du menu (`filterMenuByRole`)

À chaque connexion, les onglets de navigation sont filtrés selon :

1. **Le rôle** (`data-role` sur chaque onglet) — si absent, visible par tous
2. **Le module de licence** (`data-module` sur chaque onglet) — sauf pour `admin` qui voit tout

Les modules non activés sur la licence sont listés dans l'onglet 🔒.

### 4.4 Restrictions spécifiques

| Fonctionnalité | Restriction |
|----------------|-------------|
| Boutons Export/Import | Admin uniquement |
| Bouton Statistiques commandes | Admin & Manager |
| Bouton Alertes (🔔) | Admin, Cashier, Cook |
| Créateur de commande visible | Admin uniquement |
| Prise en charge cuisine | Cook & Admin |
| Commentaire cuisine | Cook & Admin |
| Marquage "Commande prête" | Cook & Admin |
| Suppression commande | Admin uniquement (via détail) |

---

## 5. Module Caisse (POS)

> 🔑 **Accès** : Tous les rôles (admin, cashier, manager)  
> 📦 **Licence** : `caisse` — toujours inclus

### 5.1 Affichage des produits

- Grille de produits cliquables avec image, nom et prix
- **Filtrage par catégorie** : boutons de filtre en haut
- **Recherche** : par nom, code-barres ou description
- Seuls les produits avec `active = true` sont affichés

### 5.2 Panier

| Action | Description |
|--------|-------------|
| Ajouter | Clic sur une carte produit |
| Modifier quantité | Boutons `+` / `−` ou saisie directe |
| Supprimer un article | Bouton ✕ à droite de l'article |
| Vider le panier | Bouton poubelle + confirmation |
| Mettre en attente | Bouton ⏸ — sauvegarde le panier localement |
| Récupérer un panier | Bouton badge nombre de paniers en attente |

### 5.3 Calcul des totaux

```
Sous-total HT = Σ (prix × quantité)
TVA           = Sous-total HT × 20 %
Total TTC     = Sous-total HT + TVA − Remise
```

### 5.4 Remises

- **Montant fixe** (ex : 5 €)
- **Pourcentage** (ex : 10 %)
- Motif optionnel (champ texte)
- Suppression de la remise en cours possible

### 5.5 Moyens de paiement

| Mode | Comportement |
|------|-------------|
| 💵 Espèces | Affiche le champ "Montant remis" + calcul rendu de monnaie |
| 💳 Carte | Pas de champ supplémentaire |

### 5.6 Traitement du paiement

1. Vérification que le panier n'est pas vide
2. Vérification du montant suffisant (espèces)
3. Envoi en `POST /api/transactions`
4. Affichage du **ticket de caisse**
5. Vidage automatique du panier
6. Rechargement du dashboard

### 5.7 Ticket de caisse

- Format texte monospace (compatible imprimante thermique)
- Contient : en-tête, date/heure, N° reçu, articles, totaux, rendu de monnaie, pied de page
- **Impression** : via Electron (`window.electron.printTicket`) ou fenêtre navigateur

### 5.8 Calculatrice

- Calculatrice intégrée accessible depuis le POS
- Opérations : `+`, `−`, `×`, `÷`
- Virgule décimale supportée

### 5.9 Envoi en commande

Depuis la caisse, le contenu du panier peut être transformé en **commande** (voir Module Commandes §6).

---

## 6. Module Commandes

> 🔑 **Accès** : Admin, Cashier  
> 📦 **Licence** : `commandes`

### 6.1 Création d'une commande

Déclenchée depuis le POS avec un panier non vide.

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Type | Oui | `dine_in` (sur place), `takeaway` (à emporter), `delivery` (livraison) |
| Table/Référence | Non | Numéro de table ou référence de livraison |
| Nom client | Non | Nom du client |
| Téléphone | Non | Téléphone du client |
| Notes | Non | Instructions spéciales |

### 6.2 Cycle de vie d'une commande

```
[draft] → [in_kitchen] → [ready] → [served] → [paid]
  ⏳          🔥             ✨        🍽️        💰
```

| Statut | Label | Actions disponibles |
|--------|-------|---------------------|
| `draft` | En attente de validation | Valider → cuisine, Modifier, Supprimer |
| `in_kitchen` | En cuisine | Marquer prête |
| `ready` | Prête | Marquer servie, Encaisser |
| `served` | Servie | Encaisser |
| `paid` | Payée | Voir reçu |

### 6.3 Filtres d'affichage

Boutons de filtre : Toutes / En attente / En cuisine / Prêtes / Servies / Payées

### 6.4 Visibilité selon le rôle

- **Admin** : voit toutes les commandes de tous les utilisateurs + nom du créateur
- **Cashier / Manager** : voit uniquement ses propres commandes

### 6.5 Détail d'une commande

Modal avec :
- Informations de la commande (type, table, client, créateur, date)
- Notes éventuelles
- Informations cuisine (cuisiniers en charge, commentaire cuisine)
- Liste des articles avec totaux
- Boutons d'action selon le statut courant

### 6.6 Encaissement d'une commande

- Sélection du mode de paiement (Espèces / Carte)
- `POST /api/orders/:id/pay`
- Affichage du ticket de caisse via `viewReceipt()`

### 6.7 Statistiques des commandes

Accessible aux **admin & manager** via le bouton 📊 :
- Répartition par statut (nombre + montant)
- Temps moyen par étape de transition

---

## 7. Module Cuisine

> 🔑 **Accès** : Cook, Admin  
> 📦 **Licence** : `cuisine`

### 7.1 Affichage

Toutes les commandes avec statut `in_kitchen` sont affichées.  
Chaque carte indique :
- Numéro de commande, type et table
- ⏱ Temps écoulé depuis l'entrée en cuisine (mis à jour à chaque chargement)
- Liste des articles
- Notes client éventuelles
- Cuisiniers en charge
- Commentaire cuisine

### 7.2 Code couleur urgence

| Temps en cuisine | Couleur de la carte |
|-----------------|---------------------|
| < 15 min | 🟢 Vert (normal) |
| 15–30 min | 🟠 Orange (attention) |
| > 30 min | 🔴 Rouge (urgent) |

### 7.3 Prise en charge

Un cuisinier peut **cliquer "✋ Je prends en charge"** pour s'associer à la commande.  
Son nom apparaît dans la liste des cuisiniers en charge.  
Un seul clic suffit — son profil est ajouté automatiquement via `POST /api/orders/:id/kitchen-handle`.

### 7.4 Commentaire cuisine

- Les cuisiniers (cook & admin) peuvent ajouter/modifier un commentaire (ex: retard, ingrédient manquant)
- Le commentaire est visible dans le détail de la commande côté salle
- `POST /api/orders/:id/kitchen-comment`

### 7.5 Marquer "Prête"

- Confirmation requise ("Oui, c'est prêt !")
- `POST /api/orders/:id/mark-ready` → statut passe à `ready`
- Réinitialisation de l'alerte de retard pour cette commande
- Rechargement automatique

### 7.6 Auto-refresh

La vue cuisine se rafraîchit automatiquement toutes les **30 secondes** si l'onglet cuisine est actif.

---

## 8. Module Historique

> 🔑 **Accès** : Admin, Manager, Cashier  
> 📦 **Licence** : `historique`

### 8.1 Liste des transactions

Tableau avec :
- Date & heure
- Numéro de reçu
- Caissier (avec avatar initiale)
- Total TTC
- Mode de paiement (💵 Espèces / 💳 Carte)
- Bouton ticket 🧾

### 8.2 Filtres disponibles

| Filtre | Description |
|--------|-------------|
| Date de début | `start_date` |
| Date de fin | `end_date` |
| Caissier | Liste déroulante avec tous les utilisateurs |

### 8.3 Détail d'une transaction

Modal avec :
- N° reçu, date/heure
- Caissier avec avatar
- Mode de paiement
- Liste des articles avec quantités et prix
- Sous-total HT, TVA, remise, total TTC, rendu de monnaie
- Bouton d'impression du reçu

### 8.4 Statistiques par caissier

Quand un caissier est sélectionné dans le filtre :
- Total des ventes, nombre de transactions, TVA, remises
- Détail **par jour** avec mini-tableau récapitulatif

### 8.5 Statistiques par période

Affichées en permanence sur l'onglet :
- Aujourd'hui
- Cette semaine (lundi → aujourd'hui)
- Ce mois
- Cette année

### 8.6 Export de rapport

3 boutons d'export disponibles (admin uniquement) :

| Période | Fichier généré |
|---------|----------------|
| Semaine | `rapport-week-YYYY-MM-DD.json` |
| Mois | `rapport-month-YYYY-MM-DD.json` |
| Année | `rapport-year-YYYY-MM-DD.json` |

Contenu du rapport : résumé (ventes, TVA, remises, répartition espèces/carte) + liste complète des transactions.

---

## 9. Module Statistiques / Dashboard

> 🔑 **Accès** : Admin, Manager  
> 📦 **Licence** : `statistiques` (pour le graphique) + `historique` (pour les chiffres)

### 9.1 Indicateurs du jour

| Indicateur | Source |
|------------|--------|
| Ventes du jour | `GET /api/transactions/summary/daily?date=...` |
| Nombre de transactions | Idem |
| TVA collectée | Idem |
| Remises accordées | Idem |

### 9.2 Graphique des moyens de paiement

- Barres horizontales Espèces vs Carte
- Affiche montant total, nombre de transactions, pourcentage
- Source : `GET /api/reports/payments?start_date=...&end_date=...`

### 9.3 Transactions récentes

5 dernières transactions avec numéro de reçu, date, montant et mode de paiement.

---

## 10. Module Gestion

> 🔑 **Accès** : Admin uniquement  
> 📦 **Licence** : `gestion`

### 10.1 Gestion des Produits

| Action | Description |
|--------|-------------|
| Créer | Formulaire complet avec image |
| Modifier | Pré-remplissage du formulaire |
| Supprimer | Confirmation requise |
| Rechercher | Filtre par nom en temps réel |

**Champs d'un produit :**
- Nom *(obligatoire)*
- Description
- Catégorie *(sélecteur)*
- Prix TTC *(obligatoire)*
- Prix d'achat (coût)
- Taux de TVA (défaut 20 %)
- Code-barres
- Stock
- Image (upload base64, max 2 Mo)

**Affichage en tableau** avec : image miniature, catégorie, prix, stock (badge vert/jaune/rouge), actions.

### 10.2 Gestion des Catégories

| Action | Description |
|--------|-------------|
| Créer | Nom, description, couleur |
| Modifier | Idem |
| Supprimer | Confirmation requise |

Chaque catégorie affiche le **nombre de produits** associés.

### 10.3 Gestion des Utilisateurs

| Action | Description |
|--------|-------------|
| Créer | Username, email, mot de passe, rôle |
| Supprimer | Confirmation requise |

Les utilisateurs sont affichés avec :
- Avatar (initiale du nom sur fond dégradé)
- Username, email
- Badge de rôle (`admin` / `manager` / `cashier` / `cook`)

> ⚠️ La modification d'un utilisateur existant n'est pas disponible depuis cette interface (pas de bouton Modifier dans la liste).

### 10.4 Export / Import de données

- **Export** (admin uniquement) : catégories + produits + paramètres → fichier JSON horodaté
- Compatible Electron (`window.electron.exportData`) et navigateur (téléchargement direct)

---

## 11. Système d'Alertes & Notifications

### 11.1 Principe

Le système détecte les commandes **en retard** selon des seuils configurables par statut.

### 11.2 Double timer

| Timer | Fréquence | Rôle |
|-------|-----------|------|
| Polling serveur | 60 secondes | Synchronise les nouvelles commandes depuis `GET /api/orders/alerts/pending` |
| Vérification locale | 5 secondes | Recalcule les délais en temps réel et déclenche les notifications |

### 11.3 Niveaux d'alerte

| Niveau | Déclenchement | Icône |
|--------|--------------|-------|
| `warning` | elapsed ≥ seuil | ⚠️ |
| `critical` | elapsed ≥ seuil × 2 | 🚨 |

### 11.4 Logique de notification

1. **1ère fois** que le seuil est dépassé → notification envoyée
2. **Escalade** warning → critical → nouvelle notification
3. **Après dismiss** : si la commande est toujours en retard après le délai de relance → re-notification

### 11.5 Seuils configurables (Paramètres)

| Statut | Paramètre | Défaut |
|--------|-----------|--------|
| En attente (`draft`) | `alert_draft_minutes` | 15 min |
| En cuisine (`in_kitchen`) | `alert_kitchen_minutes` | 20 min |
| Prête (`ready`) | `alert_ready_minutes` | 5 min |
| Servie (`served`) | `alert_served_minutes` | 30 min |
| Relance après dismiss | `alert_remind_after_dismiss` | 10 min |

### 11.6 Affichage des alertes

- **Toast** (durée 10 s) : message texte avec icône et numéro de commande
- **Badge 🔔** dans le header : nombre d'alertes non vues (clignotant)
- **Panneau d'alertes** : liste détaillée avec temps écoulé, retard, statut, boutons "Voir détails" et "Valider"
- **Carte commande** : bordure rouge/orange sur la carte dans la liste des commandes

### 11.7 Gestion du son

- Beep sonore (oscillateur Web Audio API, 800 Hz, 0.5 s)
- Maximum 1 fois par minute (anti-spam)
- Activable/désactivable dans les paramètres

### 11.8 Dismiss & Reset

- **"Tout marquer comme vu"** : masque toutes les alertes, relance après le délai configuré
- **Changement de statut** : réinitialise automatiquement l'alerte de la commande concernée

### 11.9 Sécurité

- Aucune alerte si l'utilisateur est déconnecté (`currentUser` nul ou `_jwtToken` absent)
- Arrêt immédiat du polling à la déconnexion (manuelle ou expiration du token)
- Toutes les notifications visibles sont supprimées immédiatement à la déconnexion

---

## 12. Paramètres Généraux

> 🔑 **Accès** : Admin uniquement (section Settings)

### 12.1 Informations de l'entreprise

| Champ | Usage |
|-------|-------|
| Nom | En-tête du ticket de caisse |
| Adresse | En-tête du ticket |
| Téléphone | En-tête du ticket |
| Email | En-tête du ticket |
| Numéro de TVA | Informations légales |
| Taux de TVA par défaut | Appliqué aux nouveaux produits |

### 12.2 Ticket de caisse

| Champ | Description |
|-------|-------------|
| En-tête personnalisé | Texte affiché en haut du ticket |
| Pied de page | Ex : "Merci de votre visite !" |

### 12.3 Alertes de retard

Tous les seuils décrits en §11.5 + activation/désactivation du son.

### 12.4 Sauvegarde

- `POST /api/settings` → persistance en base de données
- Copie locale dans `localStorage` (`cocaisse_settings`)

---

## 13. Panel Admin (Licences)

> 🔑 **Accès** : Admin uniquement  
> 📦 Section dédiée dans la navigation

### 13.1 Informations de la licence courante

Affiche en temps réel : nom du client, statut, type, modules actifs.

### 13.2 Liste des licences (multi-tenant)

Tableau avec :
- Nom du client
- Clé de licence (format monospace)
- Type (Perpétuelle / Abonnement / Essai)
- Statut (Active / Expirée / Suspendue)
- Modules activés
- Date d'expiration

### 13.3 Actions sur une licence

| Action | Conditions | Endpoint |
|--------|-----------|----------|
| Suspendre | Licence active uniquement | `PUT /api/admin/licences/:id/suspend` |
| Réactiver | Licence suspendue uniquement | `PUT /api/admin/licences/:id/reactivate` |
| Voir l'historique | Toujours disponible | `GET /api/admin/licences/:id/events` |

### 13.4 Historique des événements

Modal avec la liste chronologique de tous les événements d'une licence :

| Événement | Icône |
|-----------|-------|
| `activated` | ✅ |
| `trial_started` | 🚀 |
| `expired` | ❌ |
| `suspended` | ⏸ |
| `reactivated` | ▶️ |
| `generated` | 🔑 |
| `renewed` | 🔄 |

---

## 14. Relations entre Modules

```
┌─────────────┐      crée une commande       ┌──────────────────┐
│   CAISSE    │ ─────────────────────────────▶│   COMMANDES      │
│   (POS)     │                               │  draft → kitchen │
└─────────────┘                               └────────┬─────────┘
       │                                               │ validate
       │ encaisse                                      ▼
       │ une commande                        ┌──────────────────┐
       │                                     │    CUISINE       │
       ▼                                     │  in_kitchen      │
┌─────────────┐                              └────────┬─────────┘
│  HISTORIQUE │ ◀──────────────────────────────────── │ mark ready
│ transactions│                                       ▼
└──────┬──────┘                              ┌──────────────────┐
       │                                     │  COMMANDES       │
       │ alimente                            │  ready → served  │
       ▼                                     │         → paid   │
┌─────────────┐                              └──────────────────┘
│STATISTIQUES │                                       │
│  dashboard  │                                       │ alerte retard
└─────────────┘                                       ▼
                                             ┌──────────────────┐
                                             │    ALERTES 🔔    │
                                             │  polling 60s     │
                                             │  calcul 5s       │
                                             └──────────────────┘
```

### 14.1 Caisse → Commandes
Le contenu du **panier POS** est converti en commande avec les informations de table et client. Le panier est vidé après la création.

### 14.2 Commandes → Cuisine
La validation d'une commande (`draft → in_kitchen`) la fait apparaître dans **l'interface cuisine**.

### 14.3 Cuisine → Commandes
Marquer une commande "prête" dans la cuisine la fait passer au statut `ready`, visible côté salle.

### 14.4 Commandes → Historique
Encaisser une commande (`paid`) génère une **transaction** enregistrée dans l'historique.

### 14.5 Commandes → Alertes
Le système d'alertes surveille toutes les commandes aux statuts `draft`, `in_kitchen`, `ready`, `served` et notifie si les seuils de temps sont dépassés.

### 14.6 Produits → Caisse
Les produits actifs définis dans **Gestion** sont affichés dans la grille du **POS** et peuvent être ajoutés au panier.

### 14.7 Paramètres → Alertes
Les seuils de temps définis dans **Paramètres** sont lus en temps réel par le moteur d'alertes.

### 14.8 Paramètres → Ticket de caisse
Le nom, l'adresse, le pied de page définis dans **Paramètres** apparaissent sur chaque ticket généré.

---

## 15. Récapitulatif des Accès par Rôle

| Fonctionnalité | Admin | Manager | Cashier | Cook |
|----------------|:-----:|:-------:|:-------:|:----:|
| **Caisse (POS)** | ✅ | ✅ | ✅ | ❌ |
| Traitement paiement | ✅ | ✅ | ✅ | ❌ |
| Paniers en attente | ✅ | ✅ | ✅ | ❌ |
| Calculatrice | ✅ | ✅ | ✅ | ❌ |
| **Dashboard** | ✅ | ✅ | ❌ | ❌ |
| **Commandes (liste)** | ✅ (toutes) | ❌ | ✅ (siennes) | ❌ |
| Créer commande | ✅ | ❌ | ✅ | ❌ |
| Valider → cuisine | ✅ | ❌ | ✅ | ❌ |
| Modifier commande draft | ✅ | ❌ | ✅ | ❌ |
| Supprimer commande | ✅ | ❌ | ❌ | ❌ |
| Encaisser commande | ✅ | ❌ | ✅ | ❌ |
| Voir créateur commande | ✅ | ❌ | ❌ | ❌ |
| Stats commandes (📊) | ✅ | ✅ | ❌ | ❌ |
| **Cuisine (interface)** | ✅ | ❌ | ❌ | ✅ |
| Prendre en charge | ✅ | ❌ | ❌ | ✅ |
| Commenter cuisine | ✅ | ❌ | ❌ | ✅ |
| Marquer prête | ✅ | ❌ | ❌ | ✅ |
| **Historique** | ✅ | ✅ | ✅ | ❌ |
| Filtrer par caissier | ✅ | ✅ | ✅ | ❌ |
| Voir stats caissier | ✅ | ✅ | ✅ | ❌ |
| Export rapport (JSON) | ✅ | ❌ | ❌ | ❌ |
| **Gestion produits** | ✅ | ❌ | ❌ | ❌ |
| **Gestion catégories** | ✅ | ❌ | ❌ | ❌ |
| **Gestion utilisateurs** | ✅ | ❌ | ❌ | ❌ |
| **Paramètres** | ✅ | ❌ | ❌ | ❌ |
| **Alertes (🔔)** | ✅ | ❌ | ✅ | ✅ |
| **Panel Admin Licences** | ✅ | ❌ | ❌ | ❌ |

---

*Documentation générée depuis l'analyse du code source — `client/src/renderer/app.js`*

