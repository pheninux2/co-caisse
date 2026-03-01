# 📋 Clôture Journalière — Z-Ticket NF525

> **Module :** Conformité fiscale France  
> **Norme :** NF525 — Loi anti-fraude TVA  
> **Accès :** Admin uniquement  
> **Fichiers :** `server/src/routes/fiscal.js` · `client/src/renderer/app.js` · `client/src/renderer/index.html`

---

## 1. 🎯 À quoi ça sert ?

### Contexte légal

En France, la **loi anti-fraude TVA du 1er janvier 2018** (article 88 de la loi de finances 2016) impose à tout commerce utilisant un logiciel de caisse de :

- **Enregistrer chaque vente** de manière sécurisée et infalsifiable
- **Produire un Z-ticket** à la clôture de chaque journée de vente
- **Conserver ces documents** pendant au moins **6 ans**
- Utiliser un logiciel certifié **NF525** ou équivalent

Un **Z-ticket** (aussi appelé ticket de clôture journalière) est le **récapitulatif officiel** de toutes les ventes d'une journée. Il fait foi devant l'administration fiscale.

### Ce que fait ce module concrètement

| Fonction | Description |
|---|---|
| **Totalise** toutes les ventes de la journée | Nombre de transactions, CA TTC, HT, TVA |
| **Ventile par taux de TVA** | 5,5% / 10% / 20% — base HT + montant TVA + TTC |
| **Ventile par mode de paiement** | Espèces, Carte bancaire, Mixte, Autre |
| **Signe cryptographiquement** | HMAC-SHA256 du contenu + dernier hash de transaction |
| **Numérote séquentiellement** | Z001 → Z002 → Z003… (jamais de trou) |
| **Bloque les modifications** | Triggers MariaDB empêchent DELETE et UPDATE |
| **Avertit si oubli** | Badge ⚠️ si clôture non faite depuis > 26h |
| **Permet réimpression** | Tout Z-ticket passé est consultable et réimprimable |

---

## 2. 🗄️ Structure de données

### Table `daily_closures`

```sql
CREATE TABLE daily_closures (
  id                    VARCHAR(36)   -- UUID unique
  closure_number        VARCHAR(10)   -- Z001, Z002… (UNIQUE)
  fiscal_day_start      DATETIME      -- ex: 2026-02-28 06:00:00
  fiscal_day_end        DATETIME      -- ex: 2026-02-29 05:59:59
  closed_at             DATETIME      -- horodatage réel de la clôture
  closed_by             VARCHAR(36)   -- UUID de l'admin
  transaction_count     INT           -- nb de transactions
  total_ttc             DOUBLE        -- total TTC en €
  total_ht              DOUBLE        -- total HT en €
  total_tax             DOUBLE        -- total TVA en €
  total_discount        DOUBLE        -- total remises en €
  vat_breakdown         JSON          -- [{rate, base_ht, tax_amount, total_ttc}]
  payment_breakdown     JSON          -- {cash, card, mixed, other}
  last_transaction_id   VARCHAR(36)   -- ID dernière TX de la journée
  last_transaction_hash VARCHAR(64)   -- Hash HMAC de la dernière TX
  closure_hash          VARCHAR(64)   -- Hash de la clôture elle-même
  zticket_content       TEXT          -- Contenu texte du Z-ticket (réimpression)
  created_at            DATETIME
)
```

> 🔒 **Deux triggers MariaDB** empêchent définitivement tout `DELETE` et `UPDATE` sur cette table.

### Journée fiscale

La journée fiscale ne correspond **pas** à la journée calendaire :

```
Journée fiscale "28/02/2026"
  ├── Début : 28/02/2026 à 06:00:00 UTC  ← fiscal_day_start_hour (configurable)
  └── Fin   : 01/03/2026 à 05:59:59 UTC  ← exactement 24h après
```

Les transactions entre **minuit et 06h00** appartiennent donc à la journée fiscale **de la veille**.

---

## 3. 🔐 Hash de clôture

Le hash de clôture est un **HMAC-SHA256** calculé sur :

```js
payload = JSON.stringify({
  closure_number,       // "Z003"
  fiscal_day_start,     // "2026-02-28 06:00:00"
  fiscal_day_end,       // "2026-03-01 05:59:59"
  transaction_count,    // 42
  total_ttc,            // 1234.56
  total_ht,             // 1028.80
  total_tax,            // 205.76
  vat_breakdown,        // [{rate:20, base_ht:..., ...}]
  payment_breakdown,    // {cash:500, card:734.56, ...}
  last_transaction_hash // "a3f9c2..." ou "GENESIS"
})

closure_hash = HMAC-SHA256(payload, FISCAL_HMAC_KEY)
```

**Propriétés de sécurité :**
- Toute modification du contenu (même 1 centime) produit un hash totalement différent
- Le chaînage avec `last_transaction_hash` lie la clôture à la chaîne des transactions
- La clé `FISCAL_HMAC_KEY` est uniquement dans le `.env` serveur, jamais exposée

---

## 4. 🔄 Schéma d'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                  │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐  │
│  │  Nav badge   │   │ Modal Confirm  │   │  Modal Z-ticket  │  │
│  │  ⚠️ amber   │   │  (aperçu jour) │   │  (fond noir,     │  │
│  │  si > 26h   │   │  [Clôturer]    │   │   monospace vert)│  │
│  └──────┬───────┘   └───────┬────────┘   └────────┬─────────┘  │
│         │                   │                      │            │
│    checkClosureStatus()  openClosureModal()    showZticket()    │
│         │                   │                      │            │
└─────────┼───────────────────┼──────────────────────┼────────────┘
          │                   │                      │
          ▼                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API REST (Express)                        │
│                                                                  │
│  GET /api/fiscal/closure-status  ◄── statut + nb TX du jour    │
│  POST /api/fiscal/close-day      ◄── effectue la clôture       │
│  GET  /api/fiscal/closures       ◄── liste des clôtures        │
│  GET  /api/fiscal/closures/:id   ◄── détail + Z-ticket         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          │                   │
          ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE FISCAL                              │
│                                                                  │
│  getFiscalDayBounds()  ── calcule 06:00 → 05:59                │
│  buildZticketContent() ── génère le texte du ticket             │
│  HMAC-SHA256           ── signe le contenu                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MariaDB                                   │
│                                                                  │
│  transactions     ── source des données de la journée           │
│  daily_closures   ── stockage immuable (triggers DELETE/UPDATE) │
│  settings         ── fiscal_day_start_hour                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 🌊 Workflow complet

```
┌─────────────────────────────────────────────────────────────────────┐
│  DÉMARRAGE DE L'APPLICATION                                         │
│                                                                     │
│  app.init()                                                         │
│    └─► checkClosureStatus()  ──── GET /fiscal/closure-status       │
│              │                                                      │
│              ├── already_closed = true  →  badge caché ✅           │
│              │                                                      │
│              └── warn_no_closure_hours > 0  →  badge ⚠️ + banner   │
│                                                                     │
│  (répété toutes les 30 minutes automatiquement)                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  admin clique [📋 Z-Ticket]
┌─────────────────────────────────────────────────────────────────────┐
│  MODAL CONFIRMATION                                                 │
│                                                                     │
│  openClosureModal()  ──── GET /fiscal/closure-status               │
│                                                                     │
│  Affiche :                                                          │
│    📅 Période : 28/02/2026 06:00 → 01/03/2026 05:59               │
│    🧾 Transactions du jour : 42                                     │
│                                                                     │
│  ┌─ Cas 1 : déjà clôturé ──────────────────────────────────────┐  │
│  │  ✅ "Journée déjà clôturée — Z003"                           │  │
│  │  Bouton [Clôturer] désactivé                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Cas 2 : 0 transaction ─────────────────────────────────────┐  │
│  │  Bouton change en [📋 Clôturer (0 transaction)]              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ Cas 3 : normal ────────────────────────────────────────────┐  │
│  │  [📋 Clôturer et générer le Z-Ticket]  ◄── admin clique     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  executeCloseDay()
┌─────────────────────────────────────────────────────────────────────┐
│  TRAITEMENT SERVEUR  (POST /api/fiscal/close-day)                   │
│                                                                     │
│  1. Vérifier FISCAL_HMAC_KEY présente                               │
│  2. Calculer bornes journée fiscale (getFiscalDayBounds)            │
│  3. Vérifier si déjà clôturé → 409 si oui                          │
│  4. Charger toutes les transactions de la période                   │
│  5. Calculer :                                                      │
│       totalTtc = Σ(total)                                           │
│       totalTax = Σ(tax)                                             │
│       totalHt  = totalTtc - totalTax                               │
│       vatMap   = ventilation par taux (lu dans items JSON)          │
│       payMap   = ventilation cash/card/mixed/other                  │
│  6. Numéro séquentiel : SELECT MAX → Z001 + 1 = Z002               │
│  7. Hash = HMAC-SHA256(payload, FISCAL_HMAC_KEY)                    │
│  8. Générer texte Z-ticket (buildZticketContent)                    │
│  9. INSERT INTO daily_closures (immuable)                           │
│  10. Répondre 201 avec tout le contenu                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  showZticket(data)
┌─────────────────────────────────────────────────────────────────────┐
│  MODAL Z-TICKET RÉSULTAT                                            │
│                                                                     │
│  ┌──────────────────────────────────────┐                          │
│  │ 📋 Z-Ticket de clôture       Z003   │                          │
│  │ Clôturé le 28/02/2026 à 23:15       │                          │
│  ├──────────────────────────────────────┤                          │
│  │ ████████████████████████████████████ │  ← fond noir            │
│  │  ========================================  │  ← texte monospace │
│  │   Z - TICKET DE CLÔTURE              │  vert                   │
│  │   JOURNÉE FISCALE                    │                          │
│  │  ========================================  │                    │
│  │  ...                                 │                          │
│  ├──────────────────────────────────────┤                          │
│  │  [42 TX] [1234.56€ TTC] [205€ TVA]  │  ← résumé visuel        │
│  ├──────────────────────────────────────┤                          │
│  │  [🖨️ Imprimer] [📄 PDF] [Fermer]   │                          │
│  └──────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 📄 Exemple de Z-ticket généré

```
========================================
        Z - TICKET DE CLÔTURE
            JOURNÉE FISCALE
========================================
         BOULANGERIE MARTIN
      12, rue de la Paix, 75000 PARIS
         SIRET : 123 456 789 00012
----------------------------------------
N° Clôture   : Z003
Clôturé le   : 28/02/2026 à 23:15:00
Période      : 28/02/2026 à 06:00:00
           → 01/03/2026 à 05:59:59
----------------------------------------
Nb transactions  : 42
Total remises    : -5.00 €
----------------------------------------
TOTAL HT         : 1028.80 €

----------------------------------------
VENTILATION TVA
  TVA 5.5  %  HT:   120.00 €  TVA:    6.60 €
  TVA 10   %  HT:   200.00 €  TVA:   20.00 €
  TVA 20   %  HT:   708.80 €  TVA:  141.76 €
----------------------------------------
TOTAL TVA        : 168.36 €
========================================
TOTAL TTC        : 1197.16 €
========================================
MODES DE PAIEMENT
  Espèces          :   500.00 €
  Carte bancaire   :   697.16 €
----------------------------------------
Dernière TX hash : a3f9c2d1e8b4f7a2...
Hash clôture     : 7c2a1b9d3e4f8c1a...
========================================
       Document fiscal — NF525
              Ne pas jeter
========================================
```

---

## 7. 🗂️ Endpoints API

| Méthode | URL | Rôle | Description |
|---|---|---|---|
| `GET` | `/api/fiscal/closure-status` | admin | Statut du jour : déjà clôturé ? nb TX ? avertissement ? |
| `POST` | `/api/fiscal/close-day` | admin | Effectue la clôture, génère et stocke le Z-ticket |
| `GET` | `/api/fiscal/closures` | admin | Liste des 30 dernières clôtures |
| `GET` | `/api/fiscal/closures/:id` | admin | Détail complet d'une clôture (avec Z-ticket) |

### Exemple réponse `POST /close-day`
```json
{
  "success": true,
  "closure_id": "uuid...",
  "closure_number": "Z003",
  "transaction_count": 42,
  "total_ttc": 1197.16,
  "total_ht": 1028.80,
  "total_tax": 168.36,
  "total_discount": 5.00,
  "vat_breakdown": [
    { "rate": 5.5,  "base_ht": 120.00, "tax_amount": 6.60,   "total_ttc": 126.60 },
    { "rate": 10,   "base_ht": 200.00, "tax_amount": 20.00,  "total_ttc": 220.00 },
    { "rate": 20,   "base_ht": 708.80, "tax_amount": 141.76, "total_ttc": 850.56 }
  ],
  "payment_breakdown": { "cash": 500.00, "card": 697.16, "mixed": 0, "other": 0 },
  "closure_hash": "7c2a1b9d3e4f8c1a...",
  "closed_at": "2026-02-28T23:15:00.000Z",
  "zticket_content": "========================================\n  Z - TICKET..."
}
```

### Erreurs possibles
| Code | Cause |
|---|---|
| `400` | `FISCAL_HMAC_KEY` absente dans `.env` |
| `409` | Journée déjà clôturée |
| `403` | Accès refusé (rôle non admin) |
| `401` | Token JWT manquant ou expiré |

---

## 8. ⚙️ Configuration

Dans **Paramètres → 🔐 Conformité fiscale NF525** :

| Paramètre | Défaut | Description |
|---|---|---|
| `fiscal_day_start_hour` | `6` (06:00) | Heure de début journée fiscale (0–9) |
| `fiscal_chain_enabled` | `0` | Active le chaînage HMAC sur chaque transaction |

Dans `server/.env` :
```dotenv
FISCAL_HMAC_KEY=205b21123bd65296fb323e8688dd410ef3c257e9e188bd90b262d5d9f3a0247d
```

---

## 9. 🧪 Comment tester dans l'application

### Prérequis
- Serveur démarré : `cd server && npm run dev`
- Connecté en tant qu'**admin**
- `FISCAL_HMAC_KEY` définie dans `server/.env`
- Au moins 1 transaction encaissée

---

### TEST 1 — Badge d'avertissement automatique

**Objectif :** vérifier que le badge `⚠️` apparaît si aucune clôture récente.

1. Ne pas faire de clôture pendant > 26h (ou simuler : modifier `warn_no_closure_hours` dans le handler)
2. Aller sur n'importe quelle section, puis revenir sur **Historique**
3. Observer l'onglet **📜 Historique** dans la nav

✅ **Attendu :**
- Badge `!` amber visible sur l'onglet Historique
- Bandeau orange en haut de la section avec le texte d'avertissement
- Bouton `Clôturer maintenant` dans le bandeau

---

### TEST 2 — Clôture normale (parcours complet)

1. Aller dans **Historique**
2. Cliquer **`📋 Z-Ticket`**
3. **Modal de confirmation** s'ouvre :
   - Vérifier la période affichée (doit commencer à 06:00)
   - Vérifier le nombre de transactions du jour
4. Cliquer **`📋 Clôturer et générer le Z-Ticket`**
5. **Modal Z-ticket** s'ouvre :
   - Vérifier que le numéro `Z00X` est affiché
   - Vérifier la présence du contenu monospace (fond noir, texte vert)
   - Vérifier les totaux dans le résumé visuel (tuiles colorées)
6. Cliquer **`🖨️ Imprimer`**

✅ **Attendu :**
- Z-ticket généré et affiché
- Numérotation séquentielle correcte
- Totaux cohérents avec les transactions visibles dans l'historique
- Badge `⚠️` disparaît de la nav
- Toast de confirmation : `✅ Z003 — Clôture effectuée (X transactions)`

---

### TEST 3 — Protection contre la double clôture

1. Faire une clôture (TEST 2)
2. Cliquer à nouveau **`📋 Z-Ticket`**

✅ **Attendu :**
- Le modal s'ouvre mais affiche : `✅ La journée a déjà été clôturée — Z00X`
- Le bouton `Clôturer` est **grisé** et non cliquable

---

### TEST 4 — Export PDF

1. Depuis le modal Z-ticket (après clôture)
2. Cliquer **`📄 Export PDF`**

✅ **Attendu :**
- Une nouvelle fenêtre s'ouvre avec le Z-ticket formaté
- La boîte de dialogue d'impression du navigateur s'affiche automatiquement
- En choisissant `Enregistrer en PDF` → fichier PDF généré avec le contenu du ticket
- Toast : `Fenêtre d'impression ouverte — choisissez "Enregistrer en PDF"`

---

### TEST 5 — Historique des clôtures

1. Cliquer **`🗂️ Clôtures`** dans la barre de l'historique
2. Vérifier que toutes les clôtures passées sont listées
3. Cliquer sur une clôture dans la liste

✅ **Attendu :**
- Modal avec liste scrollable : `Z001 · 28/02/2026 · 42 tx · 1197.16 €`
- Clic sur une entrée → ferme le modal liste → ouvre le Z-ticket de cette clôture
- Z-ticket identique à celui de la clôture originale (réimpression fidèle)

---

### TEST 6 — Clôture sur journée sans transaction

1. Vérifier qu'il n'y a aucune transaction aujourd'hui (heure fiscale 06:00–05:59)
   *(ou créer un `.env` de test avec une heure future)*
2. Cliquer **`📋 Z-Ticket`**

✅ **Attendu :**
- Modal affiche `🧾 Transactions du jour : 0`
- Bouton change en `📋 Clôturer (0 transaction)`
- Z-ticket généré avec `Nb transactions : 0` et `TOTAL TTC : 0.00 €`

---

### TEST 7 — Vérification en base de données

Après une clôture, vérifier directement en MariaDB :

```sql
-- Vérifier la clôture enregistrée
SELECT id, closure_number, fiscal_day_start, closed_at,
       transaction_count, total_ttc, closure_hash
FROM daily_closures
ORDER BY created_at DESC
LIMIT 5;

-- Vérifier l'immuabilité (doit échouer avec une erreur trigger)
DELETE FROM daily_closures WHERE closure_number = 'Z001';
-- → ERROR 1644: NF525 : une clôture journalière ne peut pas être supprimée

UPDATE daily_closures SET total_ttc = 0 WHERE closure_number = 'Z001';
-- → ERROR 1644: NF525 : une clôture journalière ne peut pas être modifiée
```

---

### TEST 8 — Heure de début configurable

1. Aller dans **Paramètres → 🔐 NF525**
2. Changer `🕕 Début journée fiscale` de `06:00` à `08:00`
3. Enregistrer
4. Ouvrir le modal de clôture

✅ **Attendu :**
- La période affichée commence à `08:00` au lieu de `06:00`
- Les transactions avant 08:00 appartiennent à la journée fiscale de la veille

---

## 10. 🐛 Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| `400 FISCAL_HMAC_KEY manquante` | Clé absente dans `.env` | Ajouter `FISCAL_HMAC_KEY=<clé>` dans `server/.env` |
| `409 Journée déjà clôturée` | Double clic ou rechargement | Normal — affiche la clôture existante |
| Montants TVA à 0 | Produits sans `tax_rate` dans `items` | Vérifier que les produits ont un taux TVA configuré |
| Badge ⚠️ ne disparaît pas | `checkClosureStatus` en erreur réseau | Vérifier que le serveur répond sur `/api/fiscal/closure-status` |
| Impression vide | Bloqueur popup navigateur | Autoriser les popups pour `localhost:3000` |
| Z-ticket non disponible | `zticket_content` NULL en base | Refaire la clôture (ancienne clôture avant mise à jour) |

---

## 11. 📐 Diagramme de séquence simplifié

```
Admin          App (JS)           API Server         MariaDB
  │                │                   │                 │
  │─[clic Z-Ticket]►│                  │                 │
  │               │──GET /closure-status►               │
  │               │◄──{transactions_today: 42}──────────│
  │◄─[Modal confirm]│                  │                 │
  │                │                   │                 │
  │─[clic Clôturer]►│                  │                 │
  │               │──POST /close-day──►│                 │
  │               │                   │─SELECT transactions►
  │               │                   │◄──[42 lignes]────│
  │               │                   │─ calcul totaux   │
  │               │                   │─ HMAC-SHA256     │
  │               │                   │─INSERT daily_closures►
  │               │                   │◄──OK─────────────│
  │               │◄──201 {Z003, ...}─│                  │
  │◄─[Modal Z-ticket]│                │                  │
  │                │                  │                  │
  │─[clic Imprimer]►│                 │                  │
  │◄─[Fenêtre print]│                 │                  │
```

---

*Co-Caisse — Documentation Z-ticket NF525 v1.0 · 28/02/2026*

