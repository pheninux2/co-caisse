# 🧾 TVA Multi-Taux & Configuration Établissement

> **Module :** Gestion fiscale multi-taux + Configuration par pays  
> **Fichiers clés :**
> - `server/src/config/business-config.js` — Configuration centrale
> - `server/src/routes/config.js` — Endpoint API public
> - `client/src/renderer/app.js` — Méthodes `loadBusinessConfig`, `computeCartTax`, `buildVatOptions`
> - `client/src/renderer/index.html` — Select TVA produit, zone ventilation panier

---

## 1. 🎯 À quoi ça sert ?

### Problème résolu

Avant ce module, Co-Caisse appliquait **un seul taux de TVA fixe à 20%** sur tous les produits.  
C'est incorrect en France et impossible à utiliser dans d'autres pays :

- Une boulangerie vend du pain (TVA 5,5%), des plats chauds (TVA 10%) et de l'alcool (TVA 20%)
- Un restaurant marocain utilise des taux de 0%, 7%, 10%, 14% ou 20%
- En Belgique, les taux sont 6%, 12% et 21%

### Ce que fait ce module

| Fonctionnalité | Description |
|---|---|
| **Taux TVA par produit** | Chaque produit a son propre taux, stocké en base |
| **Select dynamique** | Le formulaire produit affiche uniquement les taux légaux du pays |
| **Ventilation POS** | Le panier affiche la décomposition HT + TVA taux par taux |
| **Ticket multi-taux** | Le reçu imprime chaque taux séparément (obligation légale) |
| **Config par pays** | Changer le pays change automatiquement les taux disponibles |
| **Fallback robuste** | Si le serveur est inaccessible → taux FR par défaut |

---

## 2. 🗂️ Structure des fichiers

```
server/src/
├── config/
│   └── business-config.js      ← Préréglages par pays (COUNTRY_PRESETS)
├── routes/
│   └── config.js               ← GET /api/config/business
└── database/
    └── migrations/
        └── 004_vat_multi_rate.sql ← Migration produits existants

client/src/renderer/
├── app.js                      ← loadBusinessConfig, computeCartTax, buildVatOptions
└── index.html                  ← <select id="productTax">, #vatBreakdownDisplay
```

---

## 3. 🌍 Préréglages par pays

Définis dans `business-config.js` — `COUNTRY_PRESETS` :

| Pays | Code | Taux TVA disponibles | Taux défaut | Devise | Anti-fraude |
|---|---|---|---|---|---|
| 🇫🇷 France | `FR` | 5,5% · 10% · **20%** | 20% | EUR € | ✅ Oui |
| 🇲🇦 Maroc | `MA` | 0% · 7% · **10%** · 14% · 20% | 10% | MAD د.م. | ❌ Non |
| 🇧🇪 Belgique | `BE` | 6% · 12% · **21%** | 21% | EUR € | ❌ Non |
| 🇨🇭 Suisse | `CH` | 2,6% · 3,8% · **8,1%** | 8,1% | CHF | ❌ Non |

> 💡 **Ajouter un pays** : il suffit d'ajouter une entrée dans `COUNTRY_PRESETS` dans `business-config.js`.

---

## 4. 🔄 Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────────┐
│              business-config.js  (serveur)                        │
│                                                                    │
│  BUSINESS_CONFIG (défauts FR)                                     │
│  COUNTRY_PRESETS { FR, MA, BE, CH }                               │
│  getConfigForCountry(country)  → fusionne défauts + préréglage   │
└──────────────────────┬───────────────────────────────────────────┘
                       │ importé par
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                 routes/config.js  (serveur)                       │
│                                                                    │
│  GET /api/config/business                                         │
│    1. Lit `settings.country` en base (ex: "FR")                  │
│    2. Lit `settings.default_tax_rate` (surcharge)                │
│    3. Appelle getConfigForCountry(country)                        │
│    4. Retourne JSON public (sans données sensibles)               │
│                                                                    │
│  ⚠️  Route PUBLIQUE — pas de JWT requis                           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP GET
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│              app.js — loadBusinessConfig()  (client)              │
│                                                                    │
│  this.businessConfig = { country, fiscal: { vatRates, ... } }    │
│                                                                    │
│  ├── getVatRates()       → [5.5, 10, 20]                         │
│  ├── getDefaultVatRate() → 20                                     │
│  ├── buildVatOptions(currentRate)  → HTML <option>               │
│  └── computeCartTax()   → { totalHt, totalTax, byRate }          │
└──────────────────────────────────────────────────────────────────┘
         │ injecte         │ calcule          │ affiche
         ▼                 ▼                  ▼
  <select #productTax>   updateTotals()    showReceipt()
  formulaire produit     panier POS        ticket de caisse
```

---

## 5. 🌊 Workflow complet

```
┌────────────────────────────────────────────────────────────────────┐
│  DÉMARRAGE DE L'APPLICATION                                         │
│                                                                     │
│  showMainApp()                                                      │
│    └─► loadData()                                                   │
│          └─► loadBusinessConfig()  ─── GET /api/config/business   │
│                    │                                                │
│                    ├─ Succès → this.businessConfig = { ... }       │
│                    └─ Échec  → fallback FR { vatRates:[5.5,10,20] }│
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  FORMULAIRE PRODUIT  (Gestion → Produits → Ajouter/Modifier)       │
│                                                                     │
│  openProductDialog(productId)                                       │
│    └─► buildVatOptions(product.tax_rate)                           │
│          └─► getVatRates()  → [5.5, 10, 20]                       │
│          └─► <select> injecté :                                    │
│                <option value="5.5">5.5 %</option>                  │
│                <option value="10">10 %</option>                    │
│                <option value="20" selected>20 %</option>           │
│                                                                     │
│  saveProduct() → POST/PUT /api/products  { tax_rate: 5.5 }        │
│  Stocké en base : products.tax_rate = 5.5                          │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  CAISSE POS — PANIER                                               │
│                                                                     │
│  addToCart(productId)                                               │
│    └─► cart = [ { id, name, price, tax_rate, quantity } ]          │
│                                                   ↑                │
│                               lu depuis products (chargé en mémoire)│
│                                                                     │
│  updateTotals()                                                     │
│    └─► computeCartTax()                                            │
│          Pour chaque item :                                         │
│            rate    = item.tax_rate  (ex: 5.5)                      │
│            ttc     = item.price × qty    (ex: 3.00 €)             │
│            ht      = ttc / 1.055         (ex: 2.84 €)             │
│            taxAmt  = ttc - ht            (ex: 0.16 €)             │
│          Groupe par taux → byRate[]                                 │
│                                                                     │
│  Affichage POS :                                                    │
│    Sous-total HT :  XX,XX €                                        │
│    TVA 5.5% sur X,XX € :  0,XX €   ← #vatBreakdownDisplay        │
│    TVA 10%  sur X,XX € :  0,XX €                                   │
│    TVA 20%  sur X,XX € :  X,XX €                                   │
│    Total TVA :       XX,XX €                                        │
│    ─────────────────────────                                        │
│    TOTAL TTC :       XX,XX €                                        │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  ENCAISSEMENT  processPayment()                                     │
│                                                                     │
│  transaction envoyée au serveur :                                   │
│  {                                                                  │
│    items: [                                                         │
│      { id, name, qty, price, tax_rate: 5.5, total: 3.00 },        │
│      { id, name, qty, price, tax_rate: 10,  total: 12.00 },       │
│    ],                                                               │
│    subtotal: XX.XX,   ← HT total                                   │
│    tax:      XX.XX,   ← TVA totale                                 │
│    total:    XX.XX,   ← TTC - remise                               │
│    vat_breakdown: [ { rate:5.5, baseHt, taxAmount, totalTtc } ]   │
│  }                                                                  │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│  TICKET DE CAISSE  showReceipt()                                   │
│                                                                     │
│  ════════════════════════════════════                               │
│   BOULANGERIE MARTIN                                                │
│  ────────────────────────────────────                               │
│  Pain au chocolat                                                   │
│    2 × 1.20€  [TVA 5.5%]  = 2.40€                                 │
│  Menu midi                                                          │
│    1 × 12.00€ [TVA 10%]   = 12.00€                                │
│  Vin rouge                                                          │
│    1 × 8.00€  [TVA 20%]   = 8.00€                                 │
│  ────────────────────────────────────                               │
│  Sous-total HT :        20.83€                                     │
│  TVA 5.5% sur 2.27€ :   0.13€                                     │
│  TVA 10% sur 10.91€ :   1.09€                                     │
│  TVA 20% sur 6.67€ :    1.33€                                     │
│  ════════════════════════════════════                               │
│  TOTAL TTC :            22.40€                                     │
│  ════════════════════════════════════                               │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. 📐 Formules de calcul TVA

> **Principe** : les prix en caisse sont **TTC**. La TVA est recalculée à partir du TTC.

```
Prix TTC  = Prix affiché en caisse  (inchangé, c'est la référence)
Prix HT   = Prix TTC ÷ (1 + taux ÷ 100)
TVA       = Prix TTC − Prix HT

Exemple TVA 5,5% :
  TTC    = 2,40 €
  HT     = 2,40 ÷ 1,055 = 2,2749 € ≈ 2,27 €
  TVA    = 2,40 − 2,27 = 0,13 €

Exemple TVA 10% :
  TTC    = 12,00 €
  HT     = 12,00 ÷ 1,10 = 10,909 € ≈ 10,91 €
  TVA    = 12,00 − 10,91 = 1,09 €

Exemple TVA 20% :
  TTC    = 8,00 €
  HT     = 8,00 ÷ 1,20 = 6,667 € ≈ 6,67 €
  TVA    = 8,00 − 6,67 = 1,33 €
```

---

## 7. 🗄️ Données en base

### Table `products`
```sql
tax_rate  DOUBLE  DEFAULT 20   -- taux TVA du produit en %
                               -- ex: 5.5, 10, 20
```

### Table `settings`
```sql
country            VARCHAR(5)  DEFAULT 'FR'  -- code pays ISO
default_tax_rate   DOUBLE      DEFAULT 20    -- taux par défaut pour nouveaux produits
```

### Migration `004_vat_multi_rate.sql`
```sql
-- Migre les produits sans taux vers le taux par défaut des settings
UPDATE products
SET tax_rate = COALESCE(
  (SELECT CAST(default_tax_rate AS DECIMAL(4,2)) FROM settings LIMIT 1),
  20.00
)
WHERE tax_rate IS NULL OR tax_rate = 0;
```

---

## 8. 🗂️ Endpoint API

### `GET /api/config/business`

| Attribut | Valeur |
|---|---|
| **Auth** | ❌ Aucune (public) |
| **Rôle** | Tous |
| **Cache** | Pas de cache côté serveur (rechargé à chaque démarrage app) |

**Réponse exemple (France) :**
```json
{
  "country": "FR",
  "businessType": "restaurant",
  "fiscal": {
    "currency": "EUR",
    "currencySymbol": "€",
    "vatRates": [5.5, 10, 20],
    "defaultVatRate": 20,
    "antifraudMode": true,
    "closureRequired": true
  },
  "receipt": {
    "printByDefault": false,
    "emailEnabled": true
  },
  "ui": {
    "language": "fr",
    "rtl": false,
    "dateFormat": "DD/MM/YYYY",
    "decimalSeparator": ","
  }
}
```

**Réponse exemple (Maroc) :**
```json
{
  "country": "MA",
  "fiscal": {
    "currency": "MAD",
    "currencySymbol": "د.م.",
    "vatRates": [0, 7, 10, 14, 20],
    "defaultVatRate": 10,
    "antifraudMode": false,
    "closureRequired": false
  }
}
```

**Logique de résolution du pays :**
```
1. settings.country en base          (priorité 1)
2. variable env BUSINESS_COUNTRY     (priorité 2)
3. 'FR' par défaut                   (priorité 3)
```

---

## 9. 🧪 Comment tester dans l'application

### Prérequis
- Serveur démarré : `cd server && npm run dev`
- Connecté en tant qu'**admin** ou **manager**

---

### TEST 1 — Vérifier que la config est chargée

Ouvrir les **DevTools du navigateur** (`F12` → Console) après connexion.

Taper dans la console :
```js
app.businessConfig
```
✅ **Attendu :**
```json
{
  "country": "FR",
  "fiscal": {
    "vatRates": [5.5, 10, 20],
    "defaultVatRate": 20,
    "currency": "EUR"
  }
}
```

Ou via l'API directement :
```
GET http://localhost:5000/api/config/business
```
✅ **Attendu :** objet JSON complet sans JWT requis (code 200)

---

### TEST 2 — Select TVA dans le formulaire produit

1. Aller dans **Gestion → Produits**
2. Cliquer **➕ Nouveau produit** (ou modifier un produit existant)
3. Observer le champ **Taux TVA**

✅ **Attendu :**
- Un `<select>` avec exactement **3 options** : `5.5 %`, `10 %`, `20 %`
- L'option `20 %` est sélectionnée par défaut pour un nouveau produit
- Pour un produit existant → son taux actuel est pré-sélectionné

❌ **Si un seul input numérique** → les modifications `index.html` ne sont pas à jour

---

### TEST 3 — Affecter un taux TVA différent par produit

1. Créer **3 produits** avec des taux différents :
   - `Pain au chocolat` → **5,5%** → Prix TTC : 1,20 €
   - `Menu midi`        → **10%**  → Prix TTC : 12,00 €
   - `Vin rouge`        → **20%**  → Prix TTC : 8,00 €
2. Enregistrer chacun

Vérifier en base :
```sql
SELECT name, price, tax_rate FROM products WHERE name IN ('Pain au chocolat', 'Menu midi', 'Vin rouge');
```
✅ **Attendu :**
```
Pain au chocolat | 1.20  | 5.5
Menu midi        | 12.00 | 10
Vin rouge        | 8.00  | 20
```

---

### TEST 4 — Ventilation TVA dans le panier POS

1. Aller sur la **Caisse** (section POS)
2. Ajouter au panier :
   - 2× Pain au chocolat (TVA 5,5%)
   - 1× Menu midi (TVA 10%)
   - 1× Vin rouge (TVA 20%)
3. Observer la zone totaux

✅ **Attendu :**
```
Sous-total HT         19,83 €
TVA 5.5% sur 2,27 €   0,13 €
TVA 10% sur 10,91 €   1,09 €
TVA 20% sur 6,67 €    1,33 €
Total TVA             2,55 €
─────────────────────────────
Total                22,40 €    ← 19,83 + 2,55 - 0 remise
```

❌ **Si une seule ligne "TVA (20%)"** → `updateTotals()` et `#vatBreakdownDisplay` non à jour

---

### TEST 5 — Ticket de caisse multi-taux

1. Encaisser le panier du TEST 4 (bouton **✅ Encaisser**)
2. Observer le modal de reçu

✅ **Attendu sur le ticket :**
```
Pain au chocolat
  2 × 1.20€  [TVA 5.5%]  = 2.40€
Menu midi
  1 × 12.00€ [TVA 10%]   = 12.00€
Vin rouge
  1 × 8.00€  [TVA 20%]   = 8.00€
────────────────────────────────────
Sous-total HT :        19.83€
TVA 5.5% sur 2.27€ :   0.13€
TVA 10% sur 10.91€ :   1.09€
TVA 20% sur 6.67€ :    1.33€
════════════════════════════════════
TOTAL TTC :            22.40€
════════════════════════════════════
```

❌ **Si "TVA (20%) : X.XX€" en une seule ligne** → `showReceipt()` non mis à jour

---

### TEST 6 — Réimpression avec ventilation correcte

1. Aller dans **Historique**
2. Cliquer sur l'icône 🧾 d'une transaction passée (multi-taux)
3. Observer le reçu

✅ **Attendu :** même ventilation TVA par taux que lors du paiement initial  
*(la ventilation est recalculée depuis `items[].tax_rate` stocké en base)*

---

### TEST 7 — Changement de pays (simulation Maroc)

**Via l'API :**
```sql
-- En base MariaDB : forcer le pays à MA
UPDATE settings SET country = 'MA';
```
Puis **redémarrer le serveur** et **recharger l'application**.

Vérifier dans la console :
```js
app.businessConfig.fiscal.vatRates
// Attendu : [0, 7, 10, 14, 20]

app.businessConfig.fiscal.currencySymbol
// Attendu : "د.م."
```

Ouvrir le formulaire d'un produit → le select TVA doit afficher :
```
0 %
7 %
10 %   ← sélectionné par défaut (defaultVatRate = 10)
14 %
20 %
```

> 🔁 Remettre `country = 'FR'` après le test.

---

### TEST 8 — Robustesse : serveur inaccessible

1. **Arrêter le serveur** (`Ctrl+C` dans le terminal serveur)
2. Recharger l'application (F5)
3. Tenter d'ouvrir le formulaire produit

✅ **Attendu :**
- L'application démarre quand même (fallback silencieux)
- Le select TVA affiche les taux FR par défaut : `5.5 %`, `10 %`, `20 %`
- Aucune erreur bloquante dans la console liée à `/api/config/business`

---

### TEST 9 — Produits migrés (migration 004)

Après démarrage du serveur (qui joue la migration automatiquement) :

```sql
-- Vérifier qu'aucun produit n'a tax_rate = NULL ou 0
SELECT COUNT(*) as problemes FROM products WHERE tax_rate IS NULL OR tax_rate = 0;
-- Attendu : 0
```

---

## 10. 🛠️ Ajouter un nouveau pays / taux

### Ajouter la Tunisie (TN) par exemple

Dans `server/src/config/business-config.js` :

```js
export const COUNTRY_PRESETS = {
  // ...préréglages existants...

  TN: {
    fiscal: {
      currency: 'TND', currencySymbol: 'DT',
      vatRates: [0, 6, 12, 18], defaultVatRate: 18,
      antifraudMode: false, closureRequired: false,
    },
    receipt: { printByDefault: true },
    ui: { language: 'fr', rtl: false, decimalSeparator: ',' },
  },
};
```

Puis mettre à jour en base :
```sql
UPDATE settings SET country = 'TN';
```

→ Le select TVA affichera automatiquement `0 %`, `6 %`, `12 %`, `18 %` dans l'interface.

---

### Ajouter un taux TVA intermédiaire en France

Si la France ajoute un taux de 2,1% (médicaments) :

```js
FR: {
  fiscal: {
    vatRates: [2.1, 5.5, 10, 20],  // ← ajouter 2.1
    defaultVatRate: 20,
    ...
  },
},
```

Aucune migration nécessaire — les produits existants conservent leur taux.

---

## 11. 🐛 Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| Select TVA ne montre qu'une seule option | `buildVatOptions()` non appelé à l'ouverture | Vérifier `openProductDialog()` appelle bien `buildVatOptions()` |
| Ventilation TVA absente dans le panier | `#vatBreakdownDisplay` absent du HTML | Vérifier la présence de `<div id="vatBreakdownDisplay">` dans `index.html` |
| Ticket affiche "TVA (20%)" fixe | `showReceipt()` n'a pas été mis à jour | Vérifier que la nouvelle version de `showReceipt` est bien en place |
| `app.businessConfig` = null en console | `loadBusinessConfig()` a échoué silencieusement | Vérifier que `/api/config/business` répond (sans JWT) |
| Mauvais taux sur un ancien produit | Produit créé avant la migration | `UPDATE products SET tax_rate = 20 WHERE tax_rate IS NULL` |
| Pays ne change pas après modif SQL | Cache navigateur | Vider le cache ou faire F5 après redémarrage serveur |

---

## 12. 📐 Diagramme de séquence

```
Admin               App (JS)                API Server         MariaDB
  │                    │                         │                 │
  │ ─[ouverture app]──►│                         │                 │
  │                    │──GET /config/business──►│                 │
  │                    │                         │─SELECT country──►
  │                    │                         │◄──{country:'FR'}─│
  │                    │                         │─getConfigForCountry('FR')
  │                    │◄──{vatRates:[5.5,10,20]}│                 │
  │                    │ this.businessConfig=...  │                 │
  │                    │                         │                 │
  │─[clic "Produit"]──►│                         │                 │
  │                    │─buildVatOptions(10)      │                 │
  │◄─[select: 5.5,10✓,20]│                       │                 │
  │─[choisit 5.5%]────►│                         │                 │
  │─[Enregistrer]─────►│──PUT /products/:id ─────►                │
  │                    │  { tax_rate: 5.5 }       │─UPDATE products►
  │                    │                         │◄──OK────────────│
  │                    │                         │                 │
  │─[ajoute au panier]►│                         │                 │
  │                    │─computeCartTax()         │                 │
  │                    │  ttc=1.20, ht=1.14,      │                 │
  │                    │  taxAmt=0.06 (TVA 5.5%) │                 │
  │◄─[Panier mis à jour│                         │                 │
  │   TVA 5.5%: 0.06€]─│                         │                 │
```

---

*Co-Caisse — Documentation TVA Multi-Taux v1.0 · 28/02/2026*

