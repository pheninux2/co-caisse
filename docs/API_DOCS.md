# Documentation API Co-Caisse

## 🔗 Base URL

```
http://localhost:5000/api
```

## 🔐 Authentification

Actuellement, l'authentification est minimal. À implémenter:
- JWT (JSON Web Tokens)
- Sessions
- OAuth2

Headers optionnels:
```
Headers:
  user-id: <uuid>
  user-role: admin|manager|cashier
```

## 📦 Produits

### 1. Lister tous les produits

```
GET /products
```

**Réponse (200):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Croissant",
    "description": "Croissant au beurre",
    "category_id": "...",
    "price": 1.50,
    "cost": 0.50,
    "tax_rate": 20,
    "image_url": "https://...",
    "barcode": "5412345678901",
    "stock": 25,
    "active": true,
    "created_at": "2026-02-07T10:00:00Z",
    "updated_at": "2026-02-07T10:00:00Z"
  }
]
```

### 2. Obtenir un produit

```
GET /products/:id
```

**Réponse (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Croissant",
  "price": 1.50,
  ...
}
```

**Réponse (404):**
```json
{ "error": "Product not found" }
```

### 3. Créer un produit

```
POST /products
Content-Type: application/json
```

**Autorisé:** Admin, Manager

**Body:**
```json
{
  "name": "Pain au Chocolat",
  "description": "Pain avec 2 carrés de chocolat",
  "category_id": "550e8400-e29b-41d4-a716-446655440000",
  "price": 1.80,
  "cost": 0.60,
  "tax_rate": 20,
  "image_url": "https://...",
  "barcode": "5412345678902",
  "stock": 15
}
```

**Réponse (201):**
```json
{
  "id": "new-uuid-here",
  "name": "Pain au Chocolat",
  ...
}
```

**Validation:**
- `name`: requis
- `category_id`: requis, doit exister
- `price`: requis, > 0
- `stock`: optionnel, défaut 0

### 4. Modifier un produit

```
PUT /products/:id
Content-Type: application/json
```

**Autorisé:** Admin, Manager

**Body:** (champs à modifier, autres optionnels)
```json
{
  "name": "Croissant Supérieur",
  "price": 1.80,
  "stock": 30
}
```

**Réponse (200):** Produit modifié

### 5. Supprimer un produit

```
DELETE /products/:id
```

**Autorisé:** Admin uniquement

**Réponse (200):**
```json
{ "message": "Product deleted successfully" }
```

### 6. Lister produits par catégorie

```
GET /products/category/:category_id
```

**Réponse (200):** Array de produits

### 7. Rechercher des produits

```
GET /products/search/:query
```

Cherche dans: `name`, `barcode`, `description`

**Exemple:**
```
GET /products/search/croissant
```

---

## 🏷️ Catégories

### 1. Lister toutes les catégories

```
GET /categories
```

**Réponse (200):**
```json
[
  {
    "id": "uuid",
    "name": "Viennoiseries",
    "description": "Nos délicieuses viennoiseries",
    "image_url": "https://...",
    "color": "#FF6B6B",
    "order_index": 1,
    "active": true,
    "created_at": "2026-02-07T10:00:00Z",
    "updated_at": "2026-02-07T10:00:00Z"
  }
]
```

### 2. Créer une catégorie

```
POST /categories
Content-Type: application/json
```

**Autorisé:** Admin, Manager

**Body:**
```json
{
  "name": "Boissons",
  "description": "Café, thé, jus...",
  "image_url": "https://...",
  "color": "#4ECDC4",
  "order_index": 2
}
```

**Réponse (201):** Catégorie créée

### 3. Modifier une catégorie

```
PUT /categories/:id
Content-Type: application/json
```

### 4. Supprimer une catégorie

```
DELETE /categories/:id
```

**Autorisé:** Admin uniquement

---

## 💰 Transactions (Ventes)

### 1. Créer une transaction

```
POST /transactions
Content-Type: application/json
```

**Body:**
```json
{
  "items": [
    {
      "id": "product-uuid",
      "name": "Croissant",
      "quantity": 2,
      "price": 1.50,
      "total": 3.00
    },
    {
      "id": "product-uuid-2",
      "name": "Café",
      "quantity": 1,
      "price": 2.50,
      "total": 2.50
    }
  ],
  "subtotal": 5.50,
  "tax": 1.10,
  "discount": 0.50,
  "total": 6.10,
  "payment_method": "cash",
  "payment_status": "completed",
  "change": 3.90,
  "notes": "Optionnel"
}
```

**Réponse (201):**
```json
{
  "id": "transaction-uuid",
  "user_id": "user-uuid",
  "transaction_date": "2026-02-07T14:30:00Z",
  "items": "[...json...]",
  "subtotal": 5.50,
  "tax": 1.10,
  "discount": 0.50,
  "total": 6.10,
  "payment_method": "cash",
  "receipt_number": "REC-1707325800000",
  "change": 3.90,
  "created_at": "2026-02-07T14:30:00Z"
}
```

**Validation:**
- `items`: requis, array non-vide
- `total`: requis
- `payment_method`: requis (cash, card, check, transfer)
- TVA, remise, change calculés automatiquement

### 2. Lister les transactions

```
GET /transactions?start_date=2026-02-01&end_date=2026-02-07&payment_method=cash&limit=100&offset=0
```

**Paramètres (optionnels):**
- `start_date`: YYYY-MM-DD
- `end_date`: YYYY-MM-DD
- `payment_method`: cash|card|check|transfer
- `limit`: nombre max (défaut 100)
- `offset`: pagination (défaut 0)

**Réponse (200):** Array de transactions

### 3. Obtenir une transaction

```
GET /transactions/:id
```

**Réponse (200):**
```json
{
  "id": "uuid",
  "items": [...],
  ...
}
```

### 4. Résumé du jour

```
GET /transactions/summary/daily?date=2026-02-07
```

**Réponse (200):**
```json
{
  "date": "2026-02-07",
  "transaction_count": 15,
  "total_amount": 457.80,
  "total_tax": 91.56,
  "total_discount": 5.00,
  "average_transaction": 30.52,
  "min_transaction": 2.50,
  "max_transaction": 125.00,
  "cash_total": 250.00,
  "card_total": 200.00,
  "check_total": 7.80
}
```

---

## 👥 Utilisateurs

### 1. Créer un utilisateur

```
POST /users
Content-Type: application/json
```

**Autorisé:** Admin uniquement

**Body:**
```json
{
  "username": "john.doe",
  "password": "SecurePassword123!",
  "email": "john@example.com",
  "role": "cashier",
  "profile": "standard"
}
```

**Réponse (201):**
```json
{
  "id": "user-uuid",
  "username": "john.doe",
  "email": "john@example.com",
  "role": "cashier",
  "profile": "standard"
}
```

### 2. Lister les utilisateurs

```
GET /users
```

**Autorisé:** Admin uniquement

**Réponse (200):** Array d'utilisateurs

### 3. Modifier un utilisateur

```
PUT /users/:id
Content-Type: application/json
```

**Autorisé:** Admin uniquement

**Body:**
```json
{
  "email": "new@example.com",
  "role": "manager",
  "active": true
}
```

### 4. Supprimer un utilisateur

```
DELETE /users/:id
```

**Autorisé:** Admin uniquement

---

## 📊 Rapports

### 1. Rapport ventes journalières

```
GET /reports/sales/daily?start_date=2026-02-01&end_date=2026-02-07
```

**Réponse (200):**
```json
[
  {
    "date": "2026-02-07",
    "transaction_count": 15,
    "total_sales": 457.80,
    "total_tax": 91.56,
    "total_discount": 5.00,
    "average_transaction": 30.52,
    "min_transaction": 2.50,
    "max_transaction": 125.00
  }
]
```

### 2. Rapport moyens de paiement

```
GET /reports/payments?start_date=2026-02-01&end_date=2026-02-07
```

**Réponse (200):**
```json
[
  {
    "payment_method": "cash",
    "count": 8,
    "total": 250.00,
    "average": 31.25
  },
  {
    "payment_method": "card",
    "count": 6,
    "total": 200.00,
    "average": 33.33
  },
  {
    "payment_method": "check",
    "count": 1,
    "total": 7.80,
    "average": 7.80
  }
]
```

### 3. Rapport produits

```
GET /reports/products
```

**Réponse (200):**
```json
[
  {
    "id": "product-uuid",
    "name": "Croissant",
    "times_sold": 45,
    "quantity_sold": 87,
    "revenue": 130.50
  }
]
```

---

## ⚙️ Santé de l'API

### Vérifier que l'API tourne

```
GET /api/health
```

**Réponse (200):**
```json
{
  "status": "OK",
  "timestamp": "2026-02-07T14:30:00Z"
}
```

---

## 🔴 Codes de Réponse

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 201 | Créé |
| 400 | Requête invalide |
| 403 | Accès refusé (rôle insuffisant) |
| 404 | Non trouvé |
| 500 | Erreur serveur |

---

## 📝 Exemples complets

### Exemple: Encaissement complet

```bash
# 1. Obtenir les produits
curl http://localhost:5000/api/products

# 2. Créer une transaction
curl -X POST http://localhost:5000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"id": "prod-1", "name": "Croissant", "quantity": 1, "price": 1.50}
    ],
    "subtotal": 1.50,
    "tax": 0.30,
    "discount": 0,
    "total": 1.80,
    "payment_method": "cash",
    "change": 3.20
  }'

# 3. Récupérer le résumé du jour
curl "http://localhost:5000/api/transactions/summary/daily?date=2026-02-07"
```

### Exemple: Gestion produits

```bash
# Créer catégorie
curl -X POST http://localhost:5000/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name": "Viennoiseries", "color": "#FF6B6B"}'

# Créer produit
curl -X POST http://localhost:5000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Croissant",
    "category_id": "cat-uuid",
    "price": 1.50,
    "tax_rate": 20
  }'

# Modifier produit
curl -X PUT http://localhost:5000/api/products/prod-uuid \
  -H "Content-Type: application/json" \
  -d '{"stock": 25, "price": 1.60}'
```

---

## 🚀 Utilisation depuis l'App

L'interface utilise automatiquement ces endpoints:

```javascript
// Exemple dans app.js
async function loadProducts() {
  const response = await fetch(`${API_URL}/products`);
  const products = await response.json();
  return products;
}
```

---

**Version API:** 1.0.0  
**Dernière mise à jour:** Février 2026

