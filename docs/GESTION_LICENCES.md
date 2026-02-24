# 🔑 Guide de gestion des licences — Co-Caisse

> **Usage interne** — Ce document explique comment créer, distribuer et gérer les licences pour vos clients restaurateurs.

---

## 📋 Sommaire

1. [Vue d'ensemble du système](#1-vue-densemble)
2. [Les types de licences](#2-les-types-de-licences)
3. [Les modules disponibles](#3-les-modules-disponibles)
4. [Créer une licence pour un client](#4-créer-une-licence-pour-un-client)
5. [Remettre la clé au client](#5-remettre-la-clé-au-client)
6. [Suivi et gestion des licences](#6-suivi-et-gestion-des-licences)
7. [Suspendre / Réactiver une licence](#7-suspendre--réactiver-une-licence)
8. [Cas pratiques](#8-cas-pratiques)
9. [Tarification suggérée](#9-tarification-suggérée)
10. [FAQ](#10-faq)

---

## 1. Vue d'ensemble

Le système de licences Co-Caisse fonctionne en **mode hybride** :

- ✅ **Vérification hors ligne** — la clé est signée HMAC-SHA256, vérifiable sans connexion internet
- ✅ **Vérification en base** — le statut (actif / suspendu / expiré) est contrôlé à chaque démarrage
- ✅ **Par module** — chaque module est activé individuellement sur la licence
- ✅ **Panel admin** — vous gérez tout depuis l'onglet `🔑 Licences` de votre instance admin

```
Flux client :
  Démarrage app → GET /api/licences/status
    ├─ Aucune licence    → Écran d'accueil (essai ou clé)
    ├─ Essai actif       → Bandeau amber "X jours restants"
    ├─ Essai expiré      → Écran de blocage avec champ clé
    └─ Licence active    → App normale (modules filtrés)
```

---

## 2. Les types de licences

| Type | Description | Expiration | Usage recommandé |
|---|---|---|---|
| `trial` | Essai gratuit 7 jours | Oui (7j) | Démonstration, découverte |
| `perpetual` | Achat unique | ❌ Jamais | Clients qui veulent payer une fois |
| `subscription` | Abonnement | Oui (date choisie) | Clients en mensuel / annuel |

---

## 3. Les modules disponibles

| Module | Onglet concerné | Description |
|---|---|---|
| `caisse` | 🛒 Caisse | **Toujours inclus** — encaissement, panier, ticket |
| `cuisine` | 👨‍🍳 Cuisine | Affichage commandes en cuisine, statuts |
| `commandes` | 📋 Commandes | Gestion commandes en salle |
| `historique` | 📜 Historique | Historique des transactions, filtres |
| `statistiques` | 📊 Tableau de bord | Rapports de ventes, analytics |
| `gestion` | 📦 Produits + ⚙️ Config | Produits, catégories, utilisateurs, paramètres |

> **Règle** : `caisse` est **automatiquement inclus** dans toutes les licences, même si non coché.

---

## 4. Créer une licence pour un client

### ⚠️ Important — Qui voit l'onglet 🔑 Licences ?

L'onglet **🔑 Licences** est visible uniquement par le compte de rôle **`admin`**.

> **Recommandation** : ne créez **pas** de compte admin pour votre client.
> Créez-lui uniquement des comptes `manager` ou `cashier`.
> Gardez le compte `admin` pour vous — c'est votre outil de gestion interne.

| Rôle | Voit l'onglet 🔑 Licences |
|---|---|
| `admin` (vous) | ✅ Oui |
| `manager` (client) | ❌ Non |
| `cashier` (client) | ❌ Non |
| `cook` (client) | ❌ Non |

### 4.1 Accéder au panel admin

1. Connectez-vous avec votre compte **admin**
2. Cliquez sur l'onglet **🔑 Licences** dans la barre de navigation
3. Cliquez sur **➕ Générer une licence**

### 4.2 Remplir le formulaire

```
Nom du client   →  "Le Bistrot du Coin"          (sera affiché dans la licence)
Type            →  perpetual / subscription / trial
Date expiration →  (uniquement pour subscription) ex: 2027-02-22
Modules         →  Cocher les modules achetés
```

### 4.3 Résultat

Une clé au format `CCZ-XXXX-XXXX-XXXX` est générée et affichée.

Exemple :
```
CCZ-L7K2-R4XP-A9F3
```

Cliquez sur **📋 Copier** pour la mettre dans le presse-papiers.

> ⚠️ **La clé n'est affichée qu'une seule fois dans la modal.** Copiez-la immédiatement ou retrouvez-la dans la liste des licences.

---

## 5. Remettre la clé au client

### Option A — Email (recommandé)

Envoyez un email au client avec la clé et les instructions :

```
Objet : Votre licence Co-Caisse — [Nom du client]

Bonjour,

Voici votre clé de licence Co-Caisse :

    CCZ-XXXX-XXXX-XXXX

Comment l'activer :
1. Démarrez l'application Co-Caisse
2. Sur l'écran d'accueil, cliquez sur "Entrer une clé de licence"
3. Saisissez la clé ci-dessus et cliquez sur "Activer"
4. L'application s'ouvre automatiquement

Modules activés : Caisse, Commandes, Cuisine
Type : Licence perpétuelle

Pour toute question : contact@co-caisse.fr
```

### Option B — Lors de l'installation sur site

1. Lancez l'application sur le matériel du client
2. Sur l'écran d'accueil, cliquez **"Entrer une clé de licence"**
3. Saisissez la clé générée depuis votre panel admin
4. Cliquez **"Activer"** → l'app démarre

---

## 6. Suivi et gestion des licences

### Voir toutes les licences

Dans l'onglet **🔑 Licences**, le tableau affiche :

| Colonne | Description |
|---|---|
| **Client** | Nom saisi lors de la génération |
| **Clé** | Format `CCZ-XXXX-XXXX-XXXX` |
| **Type** | perpetual / subscription / trial |
| **Statut** | ✅ Active / ❌ Expirée / ⏸ Suspendue |
| **Modules** | Tags des modules activés |
| **Expiration** | Date ou `—` si perpétuelle |
| **Actions** | 📋 Historique / ⏸ Suspendre / ▶️ Réactiver |

### Voir l'historique d'une licence

Cliquez sur **📋** dans la colonne Actions pour voir la timeline :
- `generated` — clé créée par l'admin
- `activated` — clé activée par le client
- `trial_started` — essai démarré
- `expired` — expiration détectée
- `suspended` — suspension manuelle
- `reactivated` — réactivation

---

## 7. Suspendre / Réactiver une licence

### Suspendre (ex : impayé, résiliation)

1. Onglet **🔑 Licences** → trouver la ligne du client
2. Cliquer **⏸** → confirmer
3. ✅ Le client verra l'écran de blocage au prochain démarrage de l'app

> La suspension est **immédiate** — dès que le client redémarre l'app ou que la vérification périodique s'exécute.

### Réactiver (ex : paiement reçu)

1. Onglet **🔑 Licences** → trouver la ligne suspendue
2. Cliquer **▶️** → confirmer
3. ✅ Le client peut redémarrer l'app normalement

> ⚠️ Une licence **expirée** ne peut pas être réactivée — il faut générer une nouvelle clé.

---

## 8. Cas pratiques

### Cas 1 — Nouveau client, pack complet

```
Client    : Restaurant La Pergola
Type      : perpetual
Modules   : caisse, cuisine, commandes, historique, statistiques, gestion
Action    : Générer → envoyer par email → installer sur site
```

### Cas 2 — Client abonnement mensuel

```
Client    : Bar Le Zinc
Type      : subscription
Expiration: 2026-03-22  (renouvellement mensuel)
Modules   : caisse, commandes
Action    : Chaque mois, générer une nouvelle clé avant expiration et l'envoyer au client
```

> 💡 **Astuce** : Mettez une alerte agenda le 25 de chaque mois pour les renouvellements.

### Cas 3 — Client qui veut tester

```
Client    : Snack Chez Mohamed
Action    : Le client démarre l'app → clique "Démarrer l'essai gratuit 7 jours"
            Tous les modules sont actifs pendant l'essai
            → automatique, aucune action de votre part
Suivi     : Contacter le client à J-7 avant expiration pour convertir en licence payante
```

### Cas 4 — Client qui upgrade ses modules

```
Client    : Café des Arts (avait seulement caisse)
Demande   : Ajouter le module "statistiques"
Action    : Générer une NOUVELLE clé avec les modules caisse + statistiques
            → Envoyer la nouvelle clé → Client l'active → Ancienne désactivée automatiquement
```

> ℹ️ Il n'y a pas de mise à jour de licence existante — on génère toujours une nouvelle clé.

### Cas 5 — Client qui ne renouvelle pas

```
Expiration atteinte → app bloquée automatiquement côté client
Action              : Aucune action manuelle nécessaire
Si le client appelle : Générer une nouvelle clé subscription + envoyer
```

### Cas 6 — Fraude / clé partagée

```
Suspicion : Un client partage sa clé avec un tiers
Action    : Onglet Licences → ⏸ Suspendre la licence
            → Contacter le client légitime → Générer une nouvelle clé
```

---

## 9. Tarification suggérée

> Adaptez selon votre stratégie commerciale.

### Pack Starter
```
Modules   : caisse
Type      : perpetual
Prix      : 149 €
```

### Pack Restaurant
```
Modules   : caisse + commandes + cuisine
Type      : perpetual
Prix      : 349 €
```

### Pack Complet
```
Modules   : tous (caisse, cuisine, commandes, historique, statistiques, gestion)
Type      : perpetual
Prix      : 499 €
```

### Abonnement mensuel
```
Pack Starter  : 9 €/mois
Pack Restaurant : 19 €/mois
Pack Complet    : 29 €/mois
```

---

## 10. FAQ

**Q : Un client peut-il utiliser l'app sans connexion internet ?**
> Oui — la clé est vérifiable hors ligne (HMAC). L'app fonctionne en local. Seule la vérification du statut (suspension) nécessite une connexion au serveur Co-Caisse.

**Q : Que se passe-t-il si le serveur Co-Caisse est inaccessible ?**
> L'app démarre en mode "fail open" — si elle ne peut pas contacter le serveur de licences, elle laisse passer. Cela évite de bloquer un client en cas de problème réseau.

**Q : Un client peut-il avoir plusieurs installations avec la même clé ?**
> Oui, par conception actuelle. Si vous voulez restreindre à une seule installation, vous devrez implémenter un système de "machine ID" (étape future).

**Q : Comment renouveler une licence subscription ?**
> Générez une nouvelle clé avec la nouvelle date d'expiration et envoyez-la au client. La nouvelle clé remplace l'ancienne dès activation.

**Q : Où est stockée la clé LICENCE_SECRET ?**
> Dans `server/.env` — **ne la commitez jamais** dans Git. Si elle est compromise, toutes les clés existantes doivent être regénérées.

**Q : Comment retrouver une clé déjà générée ?**
> Dans l'onglet **🔑 Licences**, la colonne "Clé" affiche la clé complète `CCZ-XXXX-XXXX-XXXX` pour chaque licence.

---

## 🔧 Référence technique rapide

```
Format clé     : CCZ-XXXX-XXXX-XXXX
Algorithme     : HMAC-SHA256 (LICENCE_SECRET dans server/.env)
Vérification   : offline (syntaxe) + online (statut en DB)
Tables DB      : licences, licence_events
Routes API     : /api/licences/*, /api/admin/licences/*
Panel admin    : Onglet 🔑 Licences (rôle admin uniquement)
```

---

*Document Co-Caisse — Usage interne — v1.0.0 — 2026*

