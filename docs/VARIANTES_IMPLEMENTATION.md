# Système de Variantes, Options et Sauces — Co-Caisse v2.0.0

## 📋 Résumé d'implémentation

Ce document décrit l'implémentation complète du système de variantes personnalisables pour Co-Caisse, permettant aux administrateurs de créer des groupes de variantes réutilisables (Taille, Sauce, Cuisson, Options, etc.) et de les assigner à des produits.

---

## 🏗️ Architecture Technique

### Base de Données (SQLite / MariaDB)

Trois tables principales créées via migration `013_product_variants.sql` :

#### 1. `variant_groups` — Groupes réutilisables
```sql
CREATE TABLE variant_groups (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,         -- "Taille", "Sauce", "Cuisson", etc.
  description TEXT,
  type VARCHAR(20) NOT NULL,          -- 'single' (radio) | 'multiple' (checkbox)
  required TINYINT(1) DEFAULT 0,      -- Obligatoire avant ajout panier
  position INT DEFAULT 0,             -- Ordre d'affichage
  active TINYINT(1) DEFAULT 1,
  created_by VARCHAR(36),             -- Admin qui a créé
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW()
);
```

#### 2. `variant_options` — Options à l'intérieur d'un groupe
```sql
CREATE TABLE variant_options (
  id VARCHAR(36) PRIMARY KEY,
  group_id VARCHAR(36) NOT NULL,      -- Référence au groupe
  name VARCHAR(100) NOT NULL,         -- "Petite", "Harissa", "Bien cuit"
  description TEXT,
  price_modifier DECIMAL(10,2) DEFAULT 0.00,  -- +3.00€, -0.50€, 0.00€
  is_default TINYINT(1) DEFAULT 0,    -- Pré-sélectionnée
  position INT DEFAULT 0,             -- Ordre dans le groupe
  active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT NOW(),
  updated_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (group_id) REFERENCES variant_groups(id) ON DELETE CASCADE
);
```

#### 3. `product_variant_groups` — Association produit ↔ groupe
```sql
CREATE TABLE product_variant_groups (
  id VARCHAR(36) PRIMARY KEY,
  product_id VARCHAR(36) NOT NULL,    -- Quel produit
  group_id VARCHAR(36) NOT NULL,      -- Quel groupe
  position INT DEFAULT 0,             -- Ordre d'affichage dans la modal
  created_at DATETIME DEFAULT NOW(),
  UNIQUE KEY (product_id, group_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES variant_groups(id) ON DELETE CASCADE
);
```

---

## 🔌 Endpoints API

Tous les endpoints sont dans `server/src/routes/variants.js` (accès admin/manager).

### Gestion des groupes

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/variants/groups` | Liste tous les groupes avec options |
| `POST` | `/api/variants/groups` | Créer un groupe + options |
| `PUT` | `/api/variants/groups/:groupId` | Modifier un groupe |
| `DELETE` | `/api/variants/groups/:groupId` | Supprimer (retourne 409 si utilisé) |
| `GET` | `/api/variants/groups/:groupId/options` | Options d'un groupe |

### Assignation aux produits

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/products/:productId/variants` | Groupes assignés à un produit |
| `POST` | `/api/products/:productId/variants` | Assigner groupe(s) au produit |
| `DELETE` | `/api/products/:productId/variants/:assignmentId` | Retirer groupe du produit |

---

## 💻 Frontend — VariantsManager (client/src/renderer/variants.js)

### Classe `VariantsManager`

Gère toute la logique métier des variantes côté client :

```javascript
new VariantsManager(app, apiUrl)
```

#### Méthodes publiques principales

```javascript
// Charger les variantes d'un produit
await loadProductVariants(productId)

// Afficher la modal de sélection
showVariantsModal(product, variants)

// Ajouter au panier avec variantes
addProductToCart()

// Fermer la modal
closeVariantsModal()

// Mettre à jour le prix en temps réel
updateVariantTotalPrice()

// Valider les sélections (groupes obligatoires)
validateVariantSelection()

// Formater pour affichage
formatVariantsForDisplay(variants)       // "Taille: Grande (+4.00€)"
formatVariantsForTicket(variants)        // Multi-ligne pour ticket
formatVariantsForKitchen(variants)       // MAJUSCULES pour KDS

// Calculer le prix total
calculateVariantsPriceModifier(variants) // Retourne la somme des modifications
```

---

## 🛒 Intégration en Caisse (app.js)

### 1. Détection des variantes lors du clic produit

```javascript
// Dans addToCart(productId)
async addToCart(productId) {
  const product = this.products.find(p => p.id === productId);
  const variants = await this.variantsManager.loadProductVariants(productId);
  
  if (variants && variants.length > 0) {
    // Afficher modal de sélection
    this.variantsManager.showVariantsModal(product, variants);
  } else {
    // Ajouter directement (pas de variantes)
    this._addProductToCartDirect(product);
  }
}
```

### 2. Ajout direct sans variantes

```javascript
_addProductToCartDirect(product) {
  this.cart.push({
    ...product,
    quantity: 1,
    discount: 0,
    variants: []  // Array vide
  });
  this.updateCartDisplay();
}
```

### 3. Affichage dans le panier

Les variantes s'affichent en indentation sous le produit :
```
Pizza Margherita
  12.50€ × 1
  › Taille: Grande (+4.00€)
  › Sauce: Harissa (+0.50€), Sans gluten (+1.00€)
```

### 4. Calcul du prix incluant les variantes

Le prix stocké dans `item.price` est automatiquement le **prix final avec variantes incluses** :
```javascript
const priceModifier = this.variantsManager.calculateVariantsPriceModifier(variants);
const finalPrice = product.price + priceModifier;
```

### 5. Affichage sur le ticket

Les variantes s'affichent ligne par ligne sous le produit :
```
Pizza Margherita
  Taille:
    Grande (+4.00€)
  Options:
    Harissa (+0.50€)
    Sans gluten (+1.00€)
Sous-total : 18.00€
```

### 6. Bon de cuisine (KDS)

Affichage en MAJUSCULES pour lisibilité :
```
PIZZA MARGHERITA
► TAILLE: GRANDE
► SAUCE: HARISSA, SANS GLUTEN
```

---

## 💾 Stockage dans les commandes

Les variantes sélectionnées sont **figées en JSON** au moment de l'encaissement dans la table `transactions` ou `orders` :

```json
{
  "id": "item-uuid",
  "name": "Pizza Margherita",
  "quantity": 1,
  "price": 18.00,  // ← Prix final AVEC variantes
  "tax_rate": 20,
  "total": 18.00,
  "variants": [
    {
      "groupId": "group-uuid-taille",
      "groupName": "Taille",
      "optionId": "opt-uuid-grande",
      "optionName": "Grande",
      "priceModifier": 4.00
    },
    {
      "groupId": "group-uuid-sauce",
      "groupName": "Sauce",
      "optionId": "opt-uuid-harissa",
      "optionName": "Harissa",
      "priceModifier": 0.50
    },
    {
      "groupId": "group-uuid-options",
      "groupName": "Options",
      "optionId": "opt-uuid-sans-gluten",
      "optionName": "Sans gluten",
      "priceModifier": 1.00
    }
  ]
}
```

**Avantages** :
- L'historique est figé (modification ultérieure du groupe n'affecte pas les anciennes commandes)
- Traçabilité complète de ce qu'a commandé le client
- Immuable pour l'audit fiscal

---

## 🎨 Interface Admin

### Gestion > Variantes (nouvelle section)

1. **Bibliothèque de groupes** :
   - Liste tous les groupes créés
   - Bouton "+ Nouveau groupe"
   - Formulaire inline : nom, type (single/multiple), obligatoire, options

2. **Gestion d'options** (drag-and-drop) :
   - Ajouter/supprimer des options
   - Définir le prix de chaque option
   - Marquer une option comme par défaut

### Gestion > Produits > Onglet "Variantes"

1. **Assignation des groupes** :
   - Dropdown "Ajouter un groupe"
   - Drag-and-drop pour réordonner
   - Bouton "Retirer" par groupe

2. **Aperçu** :
   - "La modal en caisse affichera X groupes"

---

## ✅ Flux complet (Exemple)

### Étape 1 : Admin crée les groupes

```bash
POST /api/variants/groups
{
  "name": "Taille",
  "type": "single",
  "required": true,
  "options": [
    { "name": "Petite", "price_modifier": 0, "is_default": false },
    { "name": "Moyenne", "price_modifier": 2.00, "is_default": false },
    { "name": "Grande", "price_modifier": 4.00, "is_default": false }
  ]
}
```

### Étape 2 : Admin assigne aux produits

```bash
POST /api/products/pizza-margherita-id/variants
{
  "group_ids": ["taille-group-id", "sauce-group-id"],
  "positions": [0, 1]
}
```

### Étape 3 : Caissier ajoute un produit

1. Clique sur "Pizza Margherita"
2. API détecte 2 groupes assignés
3. Modal affiche :
   - [x] Petite / Moyenne / Grande (obligatoire)
   - [ ] Ketchup / Mayo / Harissa (optionnel)
4. Caissier sélectionne "Grande" + "Harissa"
5. Prix total mis à jour : 12.50€ + 4.00€ + 0.50€ = **17.00€**
6. Clique "Ajouter au panier"

### Étape 4 : Panier

```
🛒 Panier
Pizza Margherita  17.00€
  › Taille: Grande (+4.00€)
  › Sauce: Harissa (+0.50€)
```

### Étape 5 : Paiement & Ticket

Le ticket affiche :
```
PIZZA MARGHERITA
  Taille:
    Grande (+4.00€)
  Sauce:
    Harissa (+0.50€)
Sous-total HT: 14.17€
TVA 20%: 2.83€
TOTAL TTC: 17.00€
```

### Étape 6 : Bon de cuisine

```
PIZZA MARGHERITA
► TAILLE: GRANDE
► SAUCE: HARISSA
```

---

## 🔒 Sécurité & Validation

### Côté API
- ✅ Authentification JWT (admin/manager only)
- ✅ Validation des IDs produit/groupe
- ✅ Vérification des FK CASCADE
- ✅ Erreur 409 si suppression d'un groupe utilisé

### Côté Frontend
- ✅ `_escapeHtml()` pour éviter XSS
- ✅ Validation des groupes obligatoires
- ✅ Désactivation bouton "Ajouter panier" si incomplet
- ✅ Récupération depuis le DOM (fiable)

---

## 📦 Fichiers modifiés/créés

### Backend
- ✅ `server/src/database/migrations/013_product_variants.sql` — Schéma DB
- ✅ `server/src/routes/variants.js` — Endpoints API (complétés)

### Frontend
- ✅ `client/src/renderer/variants.js` — VariantsManager (classe ES6)
- ✅ `client/src/renderer/app.js` — Intégration (addToCart, affichage)
- ✅ `client/src/renderer/index.html` — Modal container (variantsModal)
- ✅ `client/src/renderer/styles/main.css` — Styles (déjà présents)

---

## 🚀 Déploiement

1. **Base de données** : Migration 013 s'exécute automatiquement au démarrage du serveur
2. **Frontend** : Compilé avec Webpack, inclus dans l'app Electron
3. **API** : Les endpoints sont prêts et testables via Postman/curl

---

## 🧪 Cas de test

### Cas 1 : Produit sans variantes
- ✅ Clic sur le produit → Ajout direct au panier
- ✅ Pas de modal affichée

### Cas 2 : Produit avec 1 groupe optionnel
- ✅ Modal affichée avec options
- ✅ Bouton "Ajouter" activé par défaut
- ✅ Variantes figées au prix correct

### Cas 3 : Produit avec groupes obligatoires
- ✅ Modal affichée avec badge "Obligatoire"
- ✅ Bouton "Ajouter" désactivé jusqu'à sélection
- ✅ Message d'erreur sous groupe non rempli

### Cas 4 : Suppression groupe utilisé
- ✅ API retourne 409
- ✅ Message d'erreur avec liste des produits affectés

### Cas 5 : Historique après modification groupe
- ✅ Anciennes commandes conservent les valeurs d'origine (JSON figé)
- ✅ Nouvelle commande utilise nouvelles valeurs

---

## 📖 Documentation utilisateur

Pour l'utilisation admin, voir : [docs/ADMIN_VARIANTES.md](./ADMIN_VARIANTES.md)

---

## ✨ Améliorations futures

- [ ] Export/import des groupes de variantes
- [ ] Variantes dépendantes (ex: "Sans gluten" uniquement si "Taille = Grande")
- [ ] Analytics : options les plus commandées
- [ ] Variantes par gamme horaire (brunch vs dinner)
- [ ] Images pour les options (ex: photos des sauces)

---

**Version** : Co-Caisse 2.0.0
**Date** : 2026-03-08
**Auteur** : Système de variantes personnalisables

