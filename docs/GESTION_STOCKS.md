# Gestion des stocks — Documentation technique

> Version : 1.0.0 — Implémentée le 05/03/2026  
> Applicable à : Co-Caisse v3 (MariaDB + Express + Vanilla JS)

---

## 1. Description de la fonctionnalité

Le module **Gestion des stocks** permet de suivre en temps réel les quantités disponibles pour chaque produit du catalogue. Il est **optionnel par produit** : on active la gestion de stock sur chaque fiche individuellement via un toggle dédié.

### Trois déclencheurs automatiques

| Déclencheur | Condition | Effet |
|---|---|---|
| **Décrémentation à la vente** | Paiement validé en caisse | Le stock de chaque article du panier est réduit de la quantité vendue |
| **Alerte stock bas** | `stock ≤ stock_alert_threshold` | Alerte 📦 apparaît dans le panneau d'alertes 🔔 et dans le dashboard |
| **Grisage rupture** | `stock = 0` | La carte produit dans la grille POS est grisée, désactivée, avec badge « Rupture » |

### Ajustement manuel vs mouvement automatique

- **Mouvement automatique** : déclenché par le système lors d'une vente. L'utilisateur ne fait rien, le stock se met à jour en arrière-plan. Le `reason` est toujours `vente`.
- **Ajustement manuel** : déclenché par un admin ou manager depuis la section **Produits > onglet Stocks**. Il couvre les cas de livraison reçue, correction d'inventaire, perte ou casse. Chaque ajustement crée un mouvement traçable avec le nom de l'utilisateur et la date.

---

## 2. Fichiers modifiés

| Fichier | Modification |
|---|---|
| `server/src/database/migrations/012_stock_management.sql` | **Créé** — Ajoute `stock_enabled`, `stock_alert_threshold`, `stock_unit` sur `products` ; crée la table `stock_movements` |
| `server/src/database/index.js` | **Modifié** — Column guards ajoutés pour les 3 nouvelles colonnes de `products` (idempotent au démarrage) |
| `server/src/routes/stock.js` | **Créé** — 5 endpoints : rapport, alertes, mouvements, ajustement, paramètres |
| `server/src/routes/transactions.js` | **Modifié** — Ajout de `decrementStock()` appelée après chaque INSERT de transaction |
| `server/src/index.js` | **Modifié** — Import et montage de `/api/stock` |
| `client/src/renderer/app.js` | **Modifié** — `openProductDialog`, `saveProduct`, `renderProducts`, `searchProducts`, `filterProducts`, `loadAlerts`, `loadDashboard`, `showAlertsPanel` + nouvelles méthodes stock |
| `client/src/renderer/index.html` | **Modifié** — Champs stock dans la modale produit, onglet Stocks, modales d'ajustement et d'historique, bloc alertes stock dans le dashboard |

---

## 3. Structure de la base de données

### Colonnes ajoutées sur la table `products` existante

```sql
ALTER TABLE `products`
  ADD COLUMN IF NOT EXISTS `stock_enabled`         TINYINT(1)   NOT NULL DEFAULT 0
    COMMENT 'Activer la gestion de stock pour ce produit (0=non, 1=oui)',
  ADD COLUMN IF NOT EXISTS `stock_alert_threshold` INT          NOT NULL DEFAULT 5
    COMMENT 'Seuil alerte stock bas (alerte si stock <= seuil)',
  ADD COLUMN IF NOT EXISTS `stock_unit`            VARCHAR(20)           DEFAULT 'pièces'
    COMMENT 'Unité de mesure (pièces, kg, litres, portions, boîtes, bouteilles)';
```

> La colonne `stock` (quantité actuelle) existait déjà dans la table `products` avant cette migration.

### Table `stock_movements` — historique des entrées/sorties

```sql
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`          VARCHAR(36)    NOT NULL PRIMARY KEY,         -- UUID v4
  `product_id`  VARCHAR(36)    NOT NULL,                     -- FK → products.id
  `quantity`    DECIMAL(10,3)  NOT NULL,                     -- Positif = entrée, négatif = sortie
  `stock_after` DECIMAL(10,3)  NOT NULL,                     -- Stock restant après ce mouvement
  `reason`      VARCHAR(50)    NOT NULL DEFAULT 'adjustment',-- Type de mouvement (voir valeurs ci-dessous)
  `reference`   VARCHAR(100)   DEFAULT NULL,                 -- N° de ticket ou note libre (optionnel)
  `user_id`     VARCHAR(36)    NOT NULL,                     -- FK → users.id (qui a fait l'action)
  `created_at`  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_stock_mv_product` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
  CONSTRAINT `fk_stock_mv_user`    FOREIGN KEY (`user_id`)    REFERENCES `users`(`id`),
  INDEX `idx_stock_mv_product` (`product_id`),
  INDEX `idx_stock_mv_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Valeurs possibles du champ `reason`

| Valeur | Déclencheur | Qui |
|---|---|---|
| `vente` | Automatique à chaque encaissement | Système |
| `adjustment` | Ajustement manuel (inventaire) | Admin / Manager |
| `delivery` | Livraison / réapprovisionnement | Admin / Manager |
| `return` | Retour fournisseur | Admin / Manager |
| `loss` | Perte ou casse | Admin / Manager |
| `other` | Autre motif libre | Admin / Manager |

### Pourquoi `quantity` peut être négatif

La colonne `quantity` représente le **delta** par rapport au stock précédent :
- Entrée de marchandise → valeur positive (ex : `+20` pour une livraison)
- Sortie de stock → valeur négative (ex : `-2` pour une vente de 2 unités)

Cela permet de reconstruire l'historique chronologique complet et de calculer le stock à n'importe quelle date passée en sommant les mouvements (`SUM(quantity)`).

---

## 4. Endpoints API

Tous les endpoints `/api/stock` requièrent un **JWT valide** dans le header `Authorization: Bearer <token>`.

---

### `GET /api/stock`

- **Description** : Rapport stock complet — tous les produits actifs avec leur statut
- **Auth** : `admin`, `manager`
- **Réponse** :
```json
[
  {
    "id": "uuid",
    "name": "Coca-Cola 33cl",
    "stock": 8,
    "stock_enabled": 1,
    "stock_alert_threshold": 5,
    "stock_unit": "bouteilles",
    "category_name": "Boissons",
    "stock_status": "low"
  }
]
```
- **Valeurs de `stock_status`** :

| Valeur | Condition |
|---|---|
| `ok` | `stock > stock_alert_threshold` |
| `low` | `0 < stock <= stock_alert_threshold` |
| `out` | `stock <= 0` |
| `disabled` | `stock_enabled = 0` |

---

### `GET /api/stock/alerts`

- **Description** : Produits en alerte ou rupture uniquement (utilisé par le badge 🔔)
- **Auth** : tout utilisateur connecté
- **Réponse** :
```json
[
  {
    "id": "uuid",
    "name": "Coca-Cola 33cl",
    "stock": 3,
    "stock_alert_threshold": 5,
    "stock_unit": "bouteilles",
    "category_name": "Boissons",
    "alert_type": "low"
  }
]
```
- **Valeurs de `alert_type`** : `low` (stock bas) ou `out` (rupture totale)

---

### `GET /api/stock/:productId/movements`

- **Description** : Historique des 50 derniers mouvements d'un produit
- **Auth** : `admin`, `manager`
- **Paramètre** : `?limit=50` (optionnel, défaut 50)
- **Réponse** :
```json
[
  {
    "id": "uuid",
    "quantity": -2,
    "stock_after": 8,
    "reason": "vente",
    "reference": "REC-1234567890",
    "user_name": "admin",
    "created_at": "2026-03-05 14:32:00"
  }
]
```

---

### `POST /api/stock/:productId/adjust`

- **Description** : Ajustement manuel du stock (entrée, sortie, ou remise à niveau)
- **Auth** : `admin`, `manager`
- **Body** :
```json
{
  "quantity": 20,
  "mode": "delta",
  "reason": "delivery",
  "reference": "BL-2026-042"
}
```
- **Valeurs de `mode`** :

| Mode | Comportement |
|---|---|
| `delta` | `nouveau_stock = stock_actuel + quantity` (quantity peut être négatif) |
| `set` | `nouveau_stock = quantity` (remise à niveau absolue — inventaire) |

- **Réponse** :
```json
{
  "product_id": "uuid",
  "stock_before": 5,
  "delta": 20,
  "stock_after": 25,
  "reason": "delivery"
}
```

---

### `POST /api/stock/:productId/settings`

- **Description** : Modifier les paramètres stock d'un produit (activation, seuil, unité)
- **Auth** : `admin`, `manager`
- **Body** (tous les champs sont optionnels) :
```json
{
  "stock_enabled": 1,
  "stock_alert_threshold": 5,
  "stock_unit": "pièces"
}
```
- **Réponse** : objet produit mis à jour

---

## 5. Workflow utilisateur — Configuration du stock d'un produit

1. Aller dans **Gestion > Produits** (onglet dans la barre de navigation)
2. Cliquer sur le bouton **✏️** d'un produit pour ouvrir sa fiche
3. En bas de la fiche, activer le toggle **📦 Gestion de stock**
4. Deux champs apparaissent : **Seuil d'alerte** (ex : `5`) et **Unité** (ex : `pièces`)
5. Dans le champ **Stock initial** (en haut de la fiche), saisir la quantité en stock
6. Cliquer **Enregistrer** — les valeurs sont sauvegardées via `PUT /api/products/:id`
7. Le produit apparaît désormais dans l'onglet **📊 Stocks** avec son statut coloré

> **Note** : si le toggle est désactivé, le produit apparaît dans le rapport stock avec le statut « Désactivé » et aucune décrémentation ne se produira à la vente.

---

## 6. Workflow utilisateur — Vente en caisse (automatique)

L'utilisateur en caisse ne voit rien de ce processus — tout se passe en arrière-plan :

1. **Paiement confirmé** par le caissier (clic sur le bouton de paiement)
2. **Transaction enregistrée** en base via `POST /api/transactions`
3. **Décrémentation du stock** : la fonction `decrementStock()` parcourt chaque article du panier
   - Si `stock_enabled = 0` pour un produit → ignoré
   - Sinon : `nouveau_stock = MAX(0, stock_actuel - quantité_vendue)`
   - Un mouvement `reason = 'vente'` est créé avec la référence du ticket
4. **Vérification seuil** : lors du prochain appel à `loadAlerts()` (toutes les 60 secondes), les alertes stock sont rechargées via `GET /api/stock/alerts`
5. **Si stock = 0** : au prochain chargement des produits, la carte POS est automatiquement grisée avec le badge « Rupture »

> **Comportement sécurisé** : la décrémentation n'est jamais bloquante. Si elle échoue (ex : erreur DB), la transaction est quand même enregistrée et un message d'erreur est loggué côté serveur. Le stock ne peut pas devenir négatif (plancher à 0).

---

## 7. Workflow utilisateur — Ajustement manuel du stock

**Cas d'usage** : livraison reçue, correction après inventaire physique, déclaration d'une perte ou d'une casse.

1. Aller dans **Gestion > Produits**
2. Cliquer sur l'onglet **📊 Stocks**
3. Repérer le produit à ajuster (filtrer par statut ou par nom si besoin)
4. Cliquer sur le bouton **📦 Ajuster** sur la ligne du produit
5. Dans la modale, choisir le type d'ajustement :
   - **➕ Entrée** : ajouter une quantité (livraison, retour)
   - **➖ Sortie** : retirer une quantité (perte, casse)
   - **📋 Inventaire** : définir le stock absolu (remise à zéro + nouvelle valeur)
6. Saisir la quantité et choisir le **motif** dans la liste déroulante
7. Le stock estimé après ajustement s'affiche en temps réel sous le champ
8. Cliquer **💾 Enregistrer** — le stock est mis à jour et le mouvement est tracé

---

## 8. Workflow utilisateur — Consultation rapport stock

1. Aller dans **Gestion > Produits**
2. Cliquer sur l'onglet **📊 Stocks**
3. Le tableau affiche tous les produits actifs avec les colonnes suivantes :

| Colonne | Contenu |
|---|---|
| Produit | Nom du produit |
| Catégorie | Catégorie parente |
| Stock actuel | Quantité en stock + unité (ex : `8 bouteilles`) |
| Seuil alerte | Valeur du seuil configuré |
| Statut | Badge coloré : 🟢 OK / 🟡 Stock bas / 🔴 Rupture / ⚪ Désactivé |
| Actions | Bouton 📦 Ajuster + bouton 📋 Historique |

4. **Filtrer** par statut via les boutons en haut : Tous / 🔴 Rupture / 🟡 Bas / 🟢 OK
5. **Rechercher** un produit par nom via le champ de filtre texte
6. **Exporter en CSV** : cliquer le bouton **⬇️ CSV** en haut à droite
   - Le fichier téléchargé contient : Produit, Catégorie, Stock actuel, Unité, Seuil alerte, Statut
   - Encodage UTF-8 avec BOM (compatible Excel)
   - Nom du fichier : `stock_YYYY-MM-DD.csv`
7. **Consulter l'historique** d'un produit : cliquer 📋 → modale avec les 50 derniers mouvements (date, type, quantité, stock résultant, utilisateur)

---

## 9. Workflow utilisateur — Alerte de rupture imminente

### Dans le panneau d'alertes 🔔

Lorsqu'un produit passe en dessous de son seuil ou tombe à 0, il apparaît dans le panneau accessible via le bouton 🔔 de la barre de navigation :

**Format de l'alerte stock** :
```
📦 [Nom du produit]          Stock bas / Rupture
   [Catégorie]         [quantité restante] [unité]  seuil : [X]
                                              [Gérer →]
```

### Différence visuelle entre les deux états

| État | Badge dans le tableau | Fond de la ligne | Icône dans le panneau |
|---|---|---|---|
| **Stock bas** (`0 < stock ≤ seuil`) | 🟡 Fond amber | `bg-amber-50` | 🟡 fond `bg-amber-50` |
| **Rupture totale** (`stock = 0`) | 🔴 Fond rouge | `bg-red-50` | 🔴 fond `bg-red-50` |

### Dans le dashboard

Un bloc **📦 Alertes stock** apparaît automatiquement en bas du dashboard si au moins un produit est en alerte. Il affiche les 8 premières alertes avec un lien « Gérer les stocks → » vers l'onglet Stocks.

### Badge 🔔

Le compteur du badge prend en compte **les alertes commandes + les alertes stock**. Un badge avec le total combiné s'affiche en rouge sur le bouton 🔔.

---

## 10. Cas de test

### 10.1 Tests configuration stock

| Cas | Action | Résultat attendu | Statut |
|-----|--------|-----------------|--------|
| Initialisation | Définir `stock=10`, `seuil=3`, `unité=pièces` sur un produit | Valeurs sauvegardées, produit visible dans l'onglet Stocks avec statut 🟢 OK | |
| Activation du toggle | Activer la gestion de stock sur un produit | Les champs Seuil et Unité apparaissent dans la fiche | |
| Désactivation du toggle | Désactiver la gestion de stock | Produit affiché ⚪ Désactivé dans le rapport, aucune décrémentation à la vente | |
| Seuil > stock | Définir `stock=2`, `seuil=5` | Produit en statut 🟡 Stock bas, alerte visible dans le panneau 🔔 | |
| Stock = 0 | Définir `stock=0` | Produit grisé dans la grille POS avec badge « Rupture » | |

### 10.2 Tests décrémentation automatique à la vente

| Cas | Action | Résultat attendu | Statut |
|-----|--------|-----------------|--------|
| Vente normale | Vendre 2 unités d'un produit avec `stock=10` | Stock passe à 8, mouvement `reason=vente` créé | |
| Vente franchissant le seuil | Vendre jusqu'à `stock ≤ seuil` | Alerte 📦 apparaît dans le panneau 🔔 au prochain cycle (≤60s) | |
| Vente à stock = 1 | Vendre 1 unité | `stock = 0`, produit grisé au prochain rechargement de la grille POS | |
| Vente multiple produits | Panier avec 3 produits différents (tous `stock_enabled=1`) | Les 3 stocks décrémentés dans la même transaction, 3 mouvements créés | |
| Produit sans gestion stock | Vendre un produit avec `stock_enabled=0` | Aucune modification du stock, aucun mouvement créé | |
| Stock insuffisant | Vendre 5 unités avec `stock=3` | La vente est autorisée (mode souple), stock planché à 0 | |

### 10.3 Tests ajustement manuel

| Cas | Action | Résultat attendu | Statut |
|-----|--------|-----------------|--------|
| Réapprovisionnement | Mode ➕ Entrée, quantité `20`, motif `delivery` | Stock augmenté de 20, mouvement `reason=delivery` avec nom utilisateur | |
| Correction inventaire | Mode 📋 Inventaire, valeur absolue `15` | Stock remis à 15 quelle que soit la valeur précédente | |
| Perte / casse | Mode ➖ Sortie, quantité `3`, motif `loss` | Stock diminué de 3, mouvement `reason=loss` créé | |
| Ajustement à 0 | Mode 📋 Inventaire, valeur `0` | `stock=0`, produit grisé dans la grille POS | |
| Quantité négative bloquée | Saisir `-5` en mode ➕ Entrée | La valeur est ignorée (champ `min=0`) | |
| Prévisualisation | Modifier la quantité dans la modale | Le stock estimé se met à jour en temps réel avant confirmation | |

### 10.4 Tests rapport et export

| Cas | Action | Résultat attendu | Statut |
|-----|--------|-----------------|--------|
| Affichage rapport | Ouvrir **Produits > onglet Stocks** | Tableau avec tous les produits actifs et leur statut coloré | |
| Filtre Rupture | Cliquer sur le bouton 🔴 Rupture | Seuls les produits à `stock=0` sont affichés | |
| Filtre texte | Saisir un nom dans le champ de recherche | Tableau filtré en temps réel | |
| Export CSV | Cliquer **⬇️ CSV** | Fichier `stock_YYYY-MM-DD.csv` téléchargé avec toutes les colonnes | |
| Historique mouvements | Cliquer 📋 sur un produit | Modale avec liste chronologique des mouvements (quantité, motif, user, date) | |
| Actualiser | Cliquer 🔄 Actualiser | Données rechargées depuis l'API, tableau mis à jour | |

### 10.5 Tests API (curl / Postman)

```bash
# 1. Récupérer le rapport stock complet
curl -X GET http://localhost:5000/api/stock \
  -H "Authorization: Bearer <token>"

# 2. Récupérer les alertes stock uniquement
curl -X GET http://localhost:5000/api/stock/alerts \
  -H "Authorization: Bearer <token>"

# 3. Ajustement delta positif (livraison +20 unités)
curl -X POST http://localhost:5000/api/stock/<productId>/adjust \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "quantity": 20, "mode": "delta", "reason": "delivery", "reference": "BL-2026-042" }'

# 4. Remise à niveau absolue (inventaire → 15 unités)
curl -X POST http://localhost:5000/api/stock/<productId>/adjust \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "quantity": 15, "mode": "set", "reason": "adjustment" }'

# 5. Historique des mouvements d'un produit (50 derniers)
curl -X GET http://localhost:5000/api/stock/<productId>/movements?limit=50 \
  -H "Authorization: Bearer <token>"

# 6. Modifier les paramètres stock d'un produit
curl -X POST http://localhost:5000/api/stock/<productId>/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "stock_enabled": 1, "stock_alert_threshold": 5, "stock_unit": "pièces" }'

# 7. Tester l'accès refusé avec un rôle cashier (doit retourner 403)
curl -X GET http://localhost:5000/api/stock \
  -H "Authorization: Bearer <token_cashier>"
```

---

## 11. Comportements en cas d'erreur

### Stock négatif après décrémentation → **Mode souple (autorisé)**

La décrémentation utilise `MAX(0, stock - quantité)` : le stock ne peut pas passer en dessous de 0. La vente n'est **jamais bloquée** pour cause de stock insuffisant — le produit tombe à 0 et une alerte est générée. Ce choix est adapté à la restauration où un produit peut être vendu en excès ponctuel.

Pour passer en **mode strict** (blocage si stock insuffisant), il faudrait vérifier le stock avant l'ajout au panier dans `addToCart()` — non implémenté en v1.

### Produit supprimé avec des mouvements de stock → **Blocage par contrainte FK**

La table `stock_movements` a une FK `ON DELETE RESTRICT` implicite vers `products`. La suppression d'un produit qui possède des mouvements est bloquée par MariaDB avec une erreur `ER_ROW_IS_REFERENCED`. L'interface affichera l'erreur retournée par l'API.

### Perte de connexion pendant un ajustement → **Aucune sauvegarde partielle**

L'ajustement `POST /api/stock/:id/adjust` effectue deux opérations en séquence : `UPDATE products` puis `INSERT stock_movements`. Si la connexion est perdue entre les deux, le stock est mis à jour mais le mouvement n'est pas créé. Pour garantir l'atomicité complète, il faudrait envelopper les deux requêtes dans une transaction SQL explicite (`BEGIN … COMMIT`) — prévu en v2.

### Accès avec rôle `cashier` ou `cook` → **403 Forbidden**

Les endpoints `GET /api/stock` et `GET /api/stock/:id/movements` sont protégés par `roleCheck(['admin', 'manager'])`. Un token `cashier` ou `cook` reçoit une réponse `403 Forbidden`. Seul `GET /api/stock/alerts` est accessible à tous les utilisateurs connectés (utilisé pour le badge 🔔).

---

## 12. Notes de mise en production

### Ordre de déploiement

1. **Stopper le serveur** avant d'appliquer les migrations
2. **Exécuter la migration** `012_stock_management.sql` sur la base de production :
   ```sql
   -- Les column guards dans database/index.js font cela automatiquement au démarrage
   -- mais il est recommandé de l'exécuter manuellement en production pour vérification
   SOURCE server/src/database/migrations/012_stock_management.sql;
   ```
3. **Redémarrer le serveur** — les column guards vérifient automatiquement la présence des colonnes
4. **Vérifier** que la table `stock_movements` est créée et que `products` possède les 3 nouvelles colonnes

### Initialisation des produits existants

Après migration, tous les produits existants ont `stock_enabled = 0` par défaut. Aucune gestion de stock n'est active tant qu'un admin n'active pas le toggle produit par produit. Il n'y a **pas de rétroactivité** : les transactions passées ne génèrent pas de mouvements de stock historiques.

Pour initialiser en masse le stock de tous les produits à 0 avec gestion activée :
```sql
UPDATE products SET stock_enabled = 1, stock = 0 WHERE active = 1;
```
⚠️ À n'exécuter que si vous souhaitez activer le suivi sur tous les produits dès le départ.

### Vérification de la configuration

S'assurer que dans `business_config` le flag est positionné :
```sql
SELECT config_value FROM business_config WHERE config_key = 'setup_completed';
-- Doit retourner '1'
```

### Points d'attention

| Point | Description |
|---|---|
| **Pas de rétroactivité** | Les transactions validées avant l'activation du stock ne génèrent aucun mouvement |
| **Plancher à 0** | Le stock ne descend jamais en négatif — les ventes en excès sont autorisées |
| **Polling 60s** | Les alertes stock se rafraîchissent toutes les 60 secondes via le polling d'alertes existant |
| **Export CSV** | Généré côté client en JavaScript — pas de charge serveur supplémentaire |
| **FK contrainte** | Un produit avec des mouvements de stock ne peut pas être supprimé directement |

