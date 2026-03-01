# 🌍 BUSINESS_CONFIG — Configuration Centrale de l'Établissement

## À quoi ça sert ?

`BUSINESS_CONFIG` est le **cerveau de configuration** de Co-Caisse.  
Il permet d'adapter **toute l'application** à votre pays et type d'établissement en changeant quelques paramètres :

| Sans BUSINESS_CONFIG | Avec BUSINESS_CONFIG |
|---|---|
| Taux TVA fixes dans le code (20%) | Taux TVA dynamiques selon le pays |
| Devise € codée en dur | EUR / MAD / CHF selon le pays |
| Règles fiscales françaises pour tous | Règles adaptées FR / MA / BE / CH |
| Impression auto du ticket | Configurable (AGEC France = non auto) |

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BUSINESS_CONFIG SYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  server/config/business-config.js                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  BUSINESS_CONFIG (valeurs par défaut)                    │    │
│  │  COUNTRY_PRESETS { FR, MA, BE, CH }                     │    │
│  │  getConfigForCountry(country) → config fusionnée        │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│  server/src/database (table business_config)                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  config_key        │ config_value                        │    │
│  │  ─────────────────────────────────                       │    │
│  │  country           │ FR                                  │    │
│  │  business_type     │ restaurant                          │    │
│  │  vat_rates         │ 5.5,10,20                           │    │
│  │  default_vat_rate  │ 20                                  │    │
│  │  currency          │ EUR                                 │    │
│  │  currency_symbol   │ €                                   │    │
│  │  print_by_default  │ 0                                   │    │
│  │  antifraud_mode    │ 1                                   │    │
│  │  closure_required  │ 1                                   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│  server/src/routes/config.js                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  GET  /api/config/business  → config active (public)    │    │
│  │  PUT  /api/config/business  → sauvegarde (admin)        │    │
│  │  GET  /api/config/presets   → liste préréglages pays    │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                          │                                        │
│                          ▼                                        │
│  client/src/renderer/app.js                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  this.businessConfig = { country, fiscal, receipt, ui } │    │
│  │  getVatRates()      → [5.5, 10, 20]                     │    │
│  │  getDefaultVatRate() → 20                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Workflow complet

### 1. Démarrage de l'application

```
App démarre
    │
    ▼
loadData() ──────────────────────────────────────────────┐
    │                                                      │
    ▼                                                      │
loadBusinessConfig()                                      │
    │                                                      │
    ├─► GET /api/config/business                          │
    │       │                                              │
    │       ▼                                              │
    │   Serveur lit business_config table (MariaDB)       │
    │       │                                              │
    │       ▼                                              │
    │   Fusionne avec COUNTRY_PRESETS[country]            │
    │       │                                              │
    │       ▼                                              │
    │   Retourne { country, fiscal, receipt, ui }         │
    │       │                                              │
    ▼       ▼                                              │
this.businessConfig = config reçue                       │
    │                                                      │
    ▼                                                      │
loadProducts() / loadCategories() ──────────────────────►┘
    (utilisent this.businessConfig pour les taux TVA)
```

### 2. Changement de pays (onglet ⚙️ Avancé)

```
Admin ouvre Paramètres → ⚙️ Avancé
    │
    ▼
_populateBusinessConfigUI()
    │── Remplit le select "Pays" avec la valeur actuelle
    │── Remplit le select "Type d'établissement"
    └── Affiche l'aperçu du préréglage actif

Admin change le pays dans le select
    │
    ▼
onCountryChange()   ← SANS appel API, instant
    │
    ▼
_updateBusinessPreview(country)
    │── previewCurrency    → "MAD (د.م.)"
    │── previewDefaultVat  → "10%"
    │── previewVatRates    → "0% · 7% · 10% · 14% · 20%"
    │── previewPrintDefault → "Oui"
    └── previewAntifraud   → "Non"

Admin clique "💾 Appliquer la configuration pays"
    │
    ▼
saveBusinessConfig()
    │
    ├─► PUT /api/config/business  { country: 'MA', vat_rates: [0,7,10,14,20], ... }
    │       │
    │       ▼
    │   UPSERT dans business_config table
    │   UPDATE settings SET country = 'MA'
    │       │
    │       ▼
    │   Retourne { success: true, config: {...} }
    │
    ├── this.businessConfig = data.config  (mis à jour en mémoire)
    │
    └── loadProducts()  (taux TVA dans les cards mis à jour)
```

---

## 🗂️ Structure de la config retournée

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

---

## 🌍 Préréglages par pays

| Paramètre | 🇫🇷 France | 🇲🇦 Maroc | 🇧🇪 Belgique | 🇨🇭 Suisse |
|---|---|---|---|---|
| Devise | EUR (€) | MAD (د.م.) | EUR (€) | CHF |
| Taux TVA | 5.5%, 10%, 20% | 0%, 7%, 10%, 14%, 20% | 6%, 12%, 21% | 2.6%, 3.8%, 8.1% |
| TVA défaut | 20% | 10% | 21% | 8.1% |
| Impression auto | ❌ Non (AGEC) | ✅ Oui | ❌ Non | ❌ Non |
| Anti-fraude NF525 | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |
| Clôture obligatoire | ✅ Oui | ❌ Non | ❌ Non | ❌ Non |

---

## 📍 Où cette config est utilisée dans l'app

| Endroit | Utilisation |
|---|---|
| **Caisse (POS)** | `getVatRates()` → options TVA dans le formulaire produit |
| **Panier** | `getDefaultVatRate()` → calcul HT/TVA/TTC |
| **Ticket de caisse** | Symbole devise, ventilation TVA par taux |
| **Clôture journalière** | `closureRequired` → badge avertissement si non faite |
| **NF525** | `antifraudMode` → activation/désactivation du chaînage |
| **Ticket dématérialisé** | `printByDefault` → impression auto ou modal AGEC |

---

## 🧪 Comment tester dans l'application

### Pré-requis
- Serveur démarré : `cd server && npm run dev`
- Client démarré : `cd client && npm start`
- Connecté en tant qu'**admin**

---

### Test 1 — Vérifier la config active

```
1. Ouvrir le navigateur : http://localhost:3000
2. Ouvrir l'onglet Réseau (F12 → Network)
3. Filtrer sur "config"
4. Recharger la page
5. Cliquer sur la requête GET /api/config/business
6. Vérifier la réponse JSON :
   {
     "country": "FR",
     "fiscal": {
       "vatRates": [5.5, 10, 20],
       "currency": "EUR"
     }
   }
```

---

### Test 2 — Changer le pays vers le Maroc

```
1. Aller dans ⚙️ Paramètres → onglet ⚙️ Avancé
2. Dans le bloc "🌍 Pays & type d'établissement"
3. Changer le select "Pays" → 🇲🇦 Maroc (MAD)

   ✅ ATTENDU (immédiat, sans sauvegarde) :
   → Aperçu se met à jour :
     Devise : MAD (د.م.)
     TVA défaut : 10%
     Taux disponibles : 0% · 7% · 10% · 14% · 20%
     Impression auto : Oui
     Anti-fraude : Non

4. Cliquer "💾 Appliquer la configuration pays"
   ✅ ATTENDU :
   → Toast "🌍 Config MA appliquée — TVA : 0%, 7%, 10%, 14%, 20%"
   → Message vert "✅ Configuration appliquée"
   → Les produits se rechargent

5. Aller dans Gestion → Produits → Modifier un produit
   ✅ ATTENDU :
   → Le select "Taux TVA" propose : 0%, 7%, 10%, 14%, 20%
```

---

### Test 3 — Vérifier la persistance après redémarrage

```
1. Appliquer la config Maroc (Test 2)
2. Fermer et relancer l'application
3. Aller dans ⚙️ Paramètres → ⚙️ Avancé
   ✅ ATTENDU :
   → Le select "Pays" affiche toujours 🇲🇦 Maroc
   → L'aperçu affiche les taux marocains

4. Vérifier directement en base :
   MariaDB> SELECT * FROM business_config;
   ┌──────────────────┬─────────────────┐
   │ config_key       │ config_value    │
   ├──────────────────┼─────────────────┤
   │ country          │ MA              │
   │ vat_rates        │ 0,7,10,14,20    │
   │ currency         │ MAD             │
   │ currency_symbol  │ د.م.            │
   └──────────────────┴─────────────────┘
```

---

### Test 4 — Retour France (réinitialisation)

```
1. Changer le pays → 🇫🇷 France
2. Cliquer "💾 Appliquer"
   ✅ ATTENDU :
   → Taux TVA : 5.5%, 10%, 20%
   → Devise : EUR (€)
   → Anti-fraude : Oui (NF525)
   → Impression auto : Non (AGEC)
```

---

### Test 5 — API directe (curl / Postman)

```bash
# GET config active (sans auth)
curl http://localhost:5000/api/config/business

# GET préréglages tous les pays
curl http://localhost:5000/api/config/presets

# PUT changer le pays (admin requis)
curl -X PUT http://localhost:5000/api/config/business \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <votre_token>" \
  -d '{
    "country": "BE",
    "business_type": "restaurant",
    "vat_rates": [6, 12, 21],
    "default_vat_rate": 21,
    "currency": "EUR",
    "currency_symbol": "€",
    "print_by_default": false,
    "antifraud_mode": false
  }'

# ✅ ATTENDU :
# { "success": true, "config": { "country": "BE", ... } }
```

---

## ⚠️ Points d'attention

### Ordre de priorité des valeurs
```
table business_config (DB)
    ↓ priorité haute
table settings.country / default_tax_rate
    ↓
COUNTRY_PRESETS[country] (fichier serveur)
    ↓ priorité basse
BUSINESS_CONFIG par défaut (FR)
```

### Après un changement de pays
- Les **produits existants** conservent leur taux TVA individuel (`vat_rate` sur la table `products`)
- Seuls les **nouveaux produits** utilisent le nouveau `defaultVatRate`
- Le changement affecte immédiatement le **formulaire de création** de produit

### Sécurité
- `GET /api/config/business` → **public** (pas de JWT) — nécessaire au démarrage avant connexion
- `PUT /api/config/business` → **admin uniquement** (JWT + roleCheck)
- La clé HMAC (`FISCAL_HMAC_KEY`) n'est **jamais** exposée dans la config publique

---

## 🗃️ Fichiers concernés

```
co-caisse/
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── business-config.js          ← Valeurs par défaut + COUNTRY_PRESETS
│   │   ├── routes/
│   │   │   └── config.js                   ← GET + PUT /api/config/business
│   │   ├── database/
│   │   │   ├── index.js                    ← Création table business_config
│   │   │   └── migrations/
│   │   │       └── 008_business_config.sql ← Migration SQL
│   │   └── routes/
│   │       └── settings.js                 ← Champ country ajouté
└── client/
    └── src/renderer/
        ├── app.js                           ← loadBusinessConfig, saveBusinessConfig,
        │                                      onCountryChange, _populateBusinessConfigUI
        └── index.html                       ← Bloc UI dans onglet ⚙️ Avancé
```

