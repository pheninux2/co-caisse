# 🛡️ RGPD — Droit à l'Effacement (Art. 17)

> **Module :** Droit à l'oubli / Droit à l'effacement ciblé  
> **Cadre légal :** RGPD Art. 17 — Règlement UE 2016/679  
> **Accès :** Admin uniquement  
> **Emplacement :** Gestion → onglet 🛡️ Clients RGPD  
> **Fichiers clés :**
> - `server/src/routes/rgpd.js` — `GET /api/rgpd/search-customers` + `POST /api/rgpd/anonymize-customer`
> - `client/src/renderer/app.js` — `searchRgpdCustomers()`, `openRgpdAnonymizeModal()`, `rgpdAnonymizeConfirm()`, `_showRgpdReport()`
> - `client/src/renderer/index.html` — `#panelRgpd`, `#rgpdAnonymizeModal`, `#rgpdReportModal`

---

## 1. 🎯 À quoi ça sert ?

### Le problème légal

Le **RGPD Art. 17** donne à toute personne physique le droit d'exiger la suppression de ses données personnelles auprès d'une entreprise. L'entreprise doit répondre **dans un délai de 30 jours** et conserver une **preuve** de l'action effectuée.

**Cas concrets :**
- Un client envoie un email : *"Je souhaite que vous supprimiez toutes mes données personnelles"*
- Un client exerce son droit via un formulaire en ligne
- Un client demande verbalement à la caisse

### Ce que fait ce module

| Fonctionnalité | Description |
|---|---|
| **Recherche ciblée** | Trouver un client par nom, email ou téléphone dans toute la base |
| **Anonymisation immédiate** | Effacer toutes ses données personnelles en 1 clic (2 étapes de confirmation) |
| **Rapport de conformité** | Générer automatiquement une preuve PDF/TXT de l'action pour le registre RGPD |
| **Traçabilité** | Chaque action loggée dans `rgpd_purge_logs` avec date, admin, identité concernée |
| **Intégrité fiscale** | Les données comptables (montants, TVA, tickets) ne sont **jamais touchées** |

### Différence avec la purge automatique (Art. 5)

| | Purge automatique (Art. 5) | Droit à l'effacement (Art. 17) |
|---|---|---|
| **Déclencheur** | Cron 03h00 quotidien | Demande individuelle d'un client |
| **Périmètre** | Toutes les données > X mois | Un client précis, quelle que soit la date |
| **Urgence** | Non (délai légal) | Oui (30 jours max) |
| **Rapport** | Log de purge | Rapport de conformité nominatif |

---

## 2. 🗄️ Structure de données

### Où sont stockées les données personnelles

```
Table orders :
  customer_name   VARCHAR(255)   → "Jean Dupont"       ← anonymisé : "Client anonymisé"
  customer_phone  VARCHAR(50)    → "06 12 34 56 78"    ← anonymisé : NULL

Table transactions :
  customer_email  VARCHAR(255)   → "jean@dupont.fr"    ← anonymisé : NULL
```

### Ce qui est recherché par l'endpoint

```
GET /api/rgpd/search-customers?q=jean
  ├── orders.customer_name  LIKE '%jean%'
  ├── orders.customer_phone LIKE '%jean%'
  └── transactions.customer_email LIKE '%jean%'
```

### Log dans `rgpd_purge_logs`

```sql
INSERT INTO rgpd_purge_logs (
  triggered_by       = 'manual',
  triggered_by_user  = UUID de l'admin,
  retention_months   = 0,           ← 0 = action ciblée (pas une purge temporelle)
  cutoff_date        = NOW(),
  transactions_anonymized = N,      ← total transactions + orders traités
  status             = 'success',
  error_message      = 'Droit à l'effacement — jean@dupont.fr — par admin. [motif]'
)
```

---

## 3. 🔄 Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     CLIENT (app.js)                                   │
│                                                                       │
│  Gestion → onglet [🛡️ Clients RGPD]                                  │
│    └─► switchProductsTab('rgpd')                                     │
│          → affiche panelRgpd, cache panelProducts                    │
│                                                                       │
│  Admin saisit "Jean" dans #rgpdSearchInput                           │
│    └─► searchRgpdCustomers()                                         │
│          └─► GET /api/rgpd/search-customers?q=jean                   │
│               → résultats : [{type, identifier, count, last_seen}]   │
│               → rendu liste avec bouton [🗑️ Anonymiser]              │
│                                                                       │
│  Admin clique [🗑️ Anonymiser]                                        │
│    └─► openRgpdAnonymizeModalByIndex(idx)                            │
│          └─► openRgpdAnonymizeModal(email, name)                     │
│               → affiche #rgpdAnonymizeModal étape 1                  │
│               → récap client + champ motif + tableau effacé/conservé │
│                                                                       │
│  Admin clique [Continuer →]                                          │
│    └─► rgpdAnonymizeStep2()                                          │
│         → affiche étape 2 : saisir "CONFIRMER"                       │
│                                                                       │
│  Admin saisit "CONFIRMER" et clique [🛡️ Anonymiser définitivement]   │
│    └─► rgpdAnonymizeConfirm()                                        │
│         └─► POST /api/rgpd/anonymize-customer                        │
│              { customer_email, customer_name, reason }               │
│                                                                       │
│  Réponse reçue → _showRgpdReport(data)                               │
│    → affiche #rgpdReportModal avec rapport monospace                 │
│    → [🖨️ Imprimer] ou [💾 Télécharger TXT]                          │
└──────────────────────────────────────────────────────────────────────┘
                               │  HTTP
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              API SERVER — routes/rgpd.js (admin only)                │
│                                                                       │
│  GET  /api/rgpd/search-customers?q=...                               │
│    ├── SELECT FROM orders WHERE name/phone LIKE ?                    │
│    └── SELECT FROM transactions WHERE email LIKE ?                   │
│         → résultats fusionnés (max 40 entrées)                       │
│                                                                       │
│  POST /api/rgpd/anonymize-customer                                   │
│    ├── 1. UPDATE transactions SET customer_email = NULL              │
│    │      WHERE customer_email = ?                                   │
│    ├── 2. UPDATE orders                                              │
│    │      SET customer_name = 'Client anonymisé', phone = NULL       │
│    │      WHERE customer_name = ?                                    │
│    └── 3. INSERT INTO rgpd_purge_logs (...)                         │
│         → retourne { success, run_id, total_affected, ... }         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. 🌊 Workflow complet pas à pas

```
╔══════════════════════════════════════════════════════════════════════╗
║  ADMIN reçoit une demande d'effacement d'un client                   ║
╚══════════════════════════════════════════════════════════════════════╝
                          │
                          ▼
┌─ ÉTAPE 1 : NAVIGATION ─────────────────────────────────────────────┐
│ Menu → 📦 Produits (Gestion)                                        │
│ Cliquer l'onglet [🛡️ Clients RGPD]                                  │
│ → Le panneau RGPD s'affiche (admin uniquement)                      │
└──────────────────────────────────────────────────────────────────── ┘
                          │
                          ▼
┌─ ÉTAPE 2 : RECHERCHE ──────────────────────────────────────────────┐
│ Saisir le nom OU l'email du client                                  │
│ Ex : "Jean Dupont"  ou  "jean@dupont.fr"  ou  "06 12"              │
│ Appuyer [Entrée] ou cliquer [🔍 Rechercher]                         │
│                                                                     │
│ Résultats :                                                         │
│   👤 Jean Dupont · 3 commandes · Dernière activité : 28/02/2026    │
│                                          [🗑️ Anonymiser]            │
│   📧 jean@dupont.fr · 2 transactions · 01/03/2026                  │
│                                          [🗑️ Anonymiser]            │
└──────────────────────────────────────────────────────────────────── ┘
                          │
                          ▼
┌─ ÉTAPE 3 : MODAL CONFIRMATION (Étape 1/2) ─────────────────────────┐
│  🛡️ Anonymiser ce client ?                                          │
│  ─────────────────────────────────────────────                      │
│  👤 Nom   : Jean Dupont                                             │
│                                                                     │
│  Motif : [demande email du 01/03/2026____________]                  │
│                                                                     │
│  ❌ Sera effacé       │  ✅ Conservé                                │
│  • Nom client         │  • Montants                                 │
│  • Email              │  • Articles & TVA                           │
│  • Téléphone          │  • N° de ticket                             │
│                                                                     │
│  [Annuler]                    [Continuer →]                         │
└──────────────────────────────────────────────────────────────────── ┘
                          │
                          ▼
┌─ ÉTAPE 4 : CONFIRMATION FINALE (Étape 2/2) ────────────────────────┐
│  ⚠️ Confirmation finale                                              │
│  ─────────────────────────────────────────────                      │
│  Cette action est irréversible.                                     │
│  Tapez CONFIRMER pour valider :                                     │
│  [CONFIRMER________________________]                                 │
│                                                                     │
│  [← Retour]      [🛡️ Anonymiser définitivement]                     │
└──────────────────────────────────────────────────────────────────── ┘
                          │
                POST /api/rgpd/anonymize-customer
                          │
            UPDATE transactions + UPDATE orders
                          │
              INSERT INTO rgpd_purge_logs
                          │
                          ▼
┌─ ÉTAPE 5 : RAPPORT DE CONFORMITÉ ──────────────────────────────────┐
│  📄 Rapport de conformité RGPD                                      │
│  ══════════════════════════════════════════════════                 │
│  RAPPORT DE CONFORMITÉ RGPD                                         │
│  Droit à l'effacement — Article 17 RGPD                             │
│  ══════════════════════════════════════════════════                 │
│  Établissement   : Boulangerie Martin                               │
│  Date d'exécution: 01/03/2026 14:35:00                              │
│  Exécuté par     : admin                                            │
│  Référence       : a3f9c2d1-...                                     │
│  ──────────────────────────────────────────────────                 │
│  DONNÉES DU CLIENT CONCERNÉ                                         │
│  Nom   : Jean Dupont                                                │
│  Motif : demande email du 01/03/2026                                │
│  ──────────────────────────────────────────────────                 │
│  RÉSULTAT                                                           │
│  Statut     : ✅ SUCCÈS                                             │
│  Total      : 5 enregistrement(s) anonymisé(s)                      │
│  ══════════════════════════════════════════════════                 │
│                                                                     │
│  [🖨️ Imprimer]   [💾 Télécharger TXT]   [Fermer]                   │
└──────────────────────────────────────────────────────────────────── ┘
```

---

## 5. 📄 Contenu du rapport de conformité

Le rapport généré automatiquement après chaque anonymisation :

```
══════════════════════════════════════════════════
  RAPPORT DE CONFORMITÉ RGPD
  Droit à l'effacement — Article 17 RGPD
══════════════════════════════════════════════════

Établissement   : Boulangerie Martin
Date d'exécution: 01/03/2026 à 14:35:00
Exécuté par     : admin
Référence       : a3f9c2d1  ← UUID unique (traçabilité)

──────────────────────────────────────────────────
DONNÉES DU CLIENT CONCERNÉ
──────────────────────────────────────────────────
Nom             : Jean Dupont
Motif           : Demande email du 01/03/2026

──────────────────────────────────────────────────
RÉSULTAT DE L'OPÉRATION
──────────────────────────────────────────────────
Statut          : ✅ SUCCÈS
Transactions    : 2 enregistrement(s) anonymisé(s)
Commandes       : 3 enregistrement(s) anonymisé(s)
Total affecté   : 5 enregistrement(s)

──────────────────────────────────────────────────
DONNÉES CONSERVÉES (OBLIGATION FISCALE)
──────────────────────────────────────────────────
• Montants des transactions (HT, TVA, TTC)
• Détail des articles et quantités
• Numéros de tickets de caisse
• Dates et modes de paiement

──────────────────────────────────────────────────
DONNÉES EFFACÉES
──────────────────────────────────────────────────
• Nom du client → "Client anonymisé"
• Email du client → NULL
• Téléphone du client → NULL

══════════════════════════════════════════════════
Ce rapport constitue la preuve de conformité de
l'exercice du droit à l'effacement (RGPD Art. 17).
À conserver dans le registre des activités de
traitement (RGPD Art. 30).
══════════════════════════════════════════════════
```

**Formats disponibles :**
- **Impression** → `window.print()` via une fenêtre dédiée (police monospace)
- **Téléchargement** → fichier `.txt` nommé `rapport-rgpd-a3f9c2d1-2026-03-01.txt`

---

## 6. 🗂️ Endpoints API

Toutes les routes nécessitent **JWT + rôle admin**.

### `GET /api/rgpd/search-customers?q=...`

| Paramètre | Description |
|---|---|
| `q` | Terme de recherche (min. 2 caractères) — nom, email ou téléphone |

**Réponse :**
```json
{
  "query":   "jean",
  "total":   2,
  "results": [
    {
      "type":        "orders",
      "identifier":  "Jean Dupont",
      "detail":      "06 12 34 56 78",
      "order_count": 3,
      "tx_count":    0,
      "first_seen":  "2025-10-15T10:00:00.000Z",
      "last_seen":   "2026-02-28T14:30:00.000Z"
    },
    {
      "type":        "transactions",
      "identifier":  "jean@dupont.fr",
      "detail":      null,
      "order_count": 0,
      "tx_count":    2,
      "first_seen":  "2026-01-10T09:00:00.000Z",
      "last_seen":   "2026-03-01T11:00:00.000Z"
    }
  ]
}
```

**Codes d'erreur :**
| Code | Cause |
|---|---|
| `400` | Requête < 2 caractères |
| `403` | Rôle non admin |
| `500` | Erreur serveur |

---

### `POST /api/rgpd/anonymize-customer`

**Corps :**
```json
{
  "customer_email": "jean@dupont.fr",
  "customer_name":  "Jean Dupont",
  "reason":         "Demande email du 01/03/2026"
}
```
> `customer_email` OU `customer_name` — au moins un des deux requis.

**Réponse succès (200) :**
```json
{
  "success":                 true,
  "run_id":                  "a3f9c2d1-0ee3-47a7-a63c-f17a1736e20f",
  "status":                  "success",
  "customer_email":          "jean@dupont.fr",
  "customer_name":           "Jean Dupont",
  "transactions_anonymized": 2,
  "orders_anonymized":       3,
  "total_affected":          5,
  "executed_at":             "2026-03-01T14:35:00.000Z",
  "executed_by":             "admin",
  "reason":                  "Demande email du 01/03/2026",
  "error_message":           null
}
```

---

## 7. 🔐 Sécurités et garde-fous

| Règle | Où | Pourquoi |
|---|---|---|
| **Admin only** | `router.use(roleCheck(['admin']))` | Action irréversible sur les données |
| **2 étapes obligatoires** | Modal étape 1 → étape 2 | Prévient les clics accidentels |
| **Saisie "CONFIRMER"** | `confirmInput.value.toUpperCase() !== 'CONFIRMER'` | Confirmation explicite irréversible |
| **Données fiscales intactes** | `UPDATE` ciblé (name/email/phone uniquement) | Obligation légale comptable |
| **Log immuable** | `INSERT INTO rgpd_purge_logs` | Preuve pour contrôle CNIL |
| **Rapport automatique** | `_showRgpdReport()` après chaque action | Obligation RGPD Art. 30 (registre) |
| **Résultats filtrés** | `WHERE customer_name != 'Client anonymisé'` | N'affiche pas les déjà anonymisés |

---

## 8. 📊 Avant / Après anonymisation

### Table `orders`
```
AVANT :                              APRÈS :
customer_name  = "Jean Dupont"  →   customer_name  = "Client anonymisé"
customer_phone = "06 12 34 56"  →   customer_phone = NULL
total          = 22.40 €        →   total          = 22.40 €   ← inchangé
items          = [{Pain...}]    →   items          = [{Pain...}] ← inchangé
```

### Table `transactions`
```
AVANT :                              APRÈS :
customer_email = "jean@dupont.fr" → customer_email = NULL
total          = 15.80 €          → total          = 15.80 €   ← inchangé
transaction_hash = "a3f9c2..."    → transaction_hash = "a3f9c2..." ← inchangé
```

---

## 9. 🧪 Comment tester dans l'application

### Prérequis
- Serveur démarré : `cd server && npm run dev`
- Connecté en tant qu'**admin**
- Au moins 1 commande créée avec un nom client (ex : "Jean Dupont")

---

### TEST 1 — Accéder à la section Clients RGPD

1. Cliquer sur **📦 Produits** dans la navigation
2. Cliquer sur l'onglet **🛡️ Clients RGPD** (visible admin uniquement)

✅ **Attendu :**
- Le panneau Produits est remplacé par le panneau RGPD
- Champ de recherche, bloc info bleu "Ce qui est anonymisé / conservé"
- Onglet non visible pour les rôles caissier/manager

---

### TEST 2 — Créer des données de test

Avant de tester l'effacement, créer une commande avec données client :

1. Aller sur **Commandes** → Nouvelle commande
2. Renseigner **Nom client** : `Jean Test RGPD`
3. **Téléphone** : `06 00 00 00 01`
4. Valider et encaisser la commande

✅ **Attendu :** La commande apparaît dans l'historique avec les données client.

---

### TEST 3 — Rechercher le client

1. Dans **🛡️ Clients RGPD**, saisir `Jean Test`
2. Appuyer sur **Entrée** ou cliquer **🔍 Rechercher**

✅ **Attendu :**
```
1 résultat(s)
👤 Jean Test RGPD · 06 00 00 00 01 · 1 commande(s) · Dernière activité : 01/03/2026
                                                         [🗑️ Anonymiser]
```

❌ **Si 0 résultat :** Vérifier que la commande a bien été créée avec un nom client.

---

### TEST 4 — Anonymisation complète (flux normal)

1. Cliquer **🗑️ Anonymiser** en face de "Jean Test RGPD"

**Étape 1 du modal :**

✅ **Attendu :**
- Récap : `👤 Nom : Jean Test RGPD`
- Tableau ❌ Effacé / ✅ Conservé visible
- Champ motif vide (optionnel)

2. Remplir le motif : `Test RGPD 01/03/2026`
3. Cliquer **[Continuer →]**

**Étape 2 du modal :**

✅ **Attendu :**
- Fond rouge, message "Cette action est irréversible"
- Champ texte avec placeholder "CONFIRMER"

4. Saisir `confirmer` (minuscules)
5. Cliquer **[🛡️ Anonymiser définitivement]**

✅ **Attendu :** Message d'erreur : *"Tapez exactement "CONFIRMER" pour valider."*

6. Corriger en `CONFIRMER` (majuscules)
7. Cliquer **[🛡️ Anonymiser définitivement]**

✅ **Attendu :**
- Modal de confirmation se ferme
- Modal **📄 Rapport de conformité RGPD** s'ouvre avec le rapport complet
- Toast vert : `✅ Client anonymisé — X enregistrement(s) traité(s)`

---

### TEST 5 — Vérifier le rapport

Dans le modal rapport :

✅ **Attendu :**
```
Établissement   : [votre établissement]
Date d'exécution: 01/03/2026 ...
Exécuté par     : admin
Référence       : [UUID]
...
Nom             : Jean Test RGPD
Motif           : Test RGPD 01/03/2026
...
Statut          : ✅ SUCCÈS
Total affecté   : 1
```

1. Cliquer **[🖨️ Imprimer]** → fenêtre d'impression s'ouvre
2. Cliquer **[💾 Télécharger TXT]** → fichier `rapport-rgpd-[uuid]-2026-03-01.txt` téléchargé
3. Cliquer **[Fermer]**

---

### TEST 6 — Vérifier que le client a disparu des résultats

1. Rechercher à nouveau `Jean Test`

✅ **Attendu :** `Aucun client trouvé avec données personnelles.`
> Le filtre `customer_name != 'Client anonymisé'` exclut les déjà anonymisés.

---

### TEST 7 — Vérifier en base de données

```sql
-- Commandes anonymisées
SELECT customer_name, customer_phone, total
FROM orders
WHERE customer_name = 'Client anonymisé'
ORDER BY created_at DESC
LIMIT 5;
-- Attendu : customer_name = "Client anonymisé", customer_phone = NULL
-- total inchangé ✅

-- Journal de purge RGPD
SELECT run_at, triggered_by, transactions_anonymized, status, error_message
FROM rgpd_purge_logs
ORDER BY run_at DESC
LIMIT 3;
-- Attendu : une entrée avec triggered_by='manual', error_message contenant "Jean Test RGPD"
```

---

### TEST 8 — Annulation à l'étape 1

1. Cliquer **🗑️ Anonymiser** sur un client
2. Dans le modal étape 1, cliquer **[Annuler]**

✅ **Attendu :** Modal fermé, aucune modification en base.

---

### TEST 9 — Retour de l'étape 2 vers l'étape 1

1. Cliquer **🗑️ Anonymiser** sur un client
2. Cliquer **[Continuer →]** pour aller à l'étape 2
3. Cliquer **[← Retour]**

✅ **Attendu :** Retour à l'étape 1 avec le motif toujours rempli.

---

### TEST 10 — Recherche par email

1. Créer une transaction avec ticket email (modal AGEC → envoyer par email avec "mémoriser")
2. Rechercher `@gmail.com` (ou l'email utilisé)

✅ **Attendu :**
```
📧 client@gmail.com · 1 transaction(s) · Dernière activité : 01/03/2026
                                          [🗑️ Anonymiser]
```

---

### TEST 11 — Accès refusé pour un non-admin

1. Se connecter avec un compte **caissier**
2. Aller dans **📦 Produits**

✅ **Attendu :** L'onglet **🛡️ Clients RGPD** n'est pas visible  
*(attribut `data-role="admin"` sur le bouton de l'onglet)*

---

## 10. 🐛 Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| Onglet RGPD non visible | Connecté avec un rôle non-admin | Se reconnecter avec un compte admin |
| `0 résultat(s)` pour un client connu | Données déjà anonymisées | `customer_name != 'Client anonymisé'` — normal |
| `0 résultat(s)` et données non anonymisées | Nom cherché différent du nom stocké | Vérifier la casse / espaces en base |
| Erreur `400` sur search-customers | Requête < 2 caractères | Saisir au moins 2 caractères |
| "CONFIRMER" refusé | Minuscules ou caractères parasites | Saisir exactement `CONFIRMER` en majuscules |
| Rapport vide ou incomplet | `data.run_id` absent | Vérifier que le POST retourne bien `run_id` |
| Toast erreur "Erreur serveur" | Route RGPD non enregistrée | Vérifier import `rgpdRoutes` dans `index.js` |
| Le panneau RGPD ne s'affiche pas | `#panelRgpd` absent dans le HTML | Vérifier la présence de l'élément dans `index.html` |
| `total_affected = 0` alors que client trouvé | Email/nom légèrement différent en base | Recherche LIKE ≠ UPDATE WHERE exact match |

---

## 11. 📐 Diagramme de séquence complet

```
Admin          app.js              API Server          MariaDB
  │               │                     │                  │
  │─[onglet RGPD]►│                     │                  │
  │               │                     │                  │
  │─[Recherche]──►│                     │                  │
  │               │─GET /search-customers?q=jean──────────►│
  │               │                     │─SELECT orders────►
  │               │                     │─SELECT transactions►
  │               │◄──{results:[...]}───│                  │
  │◄─[Liste affiché]│                  │                  │
  │               │                     │                  │
  │─[🗑️ Anonymiser]►│                  │                  │
  │◄─[Modal étape 1]│                  │                  │
  │─[Motif + Continuer]►│              │                  │
  │◄─[Modal étape 2]│                  │                  │
  │─["CONFIRMER"]─►│                   │                  │
  │               │─POST /anonymize-customer──────────────►│
  │               │                     │─UPDATE transactions►
  │               │                     │─UPDATE orders────►
  │               │                     │─INSERT purge_log─►
  │               │◄──{success, run_id, total_affected}────│
  │◄─[Modal rapport]│                  │                  │
  │               │                     │                  │
  │─[💾 Télécharger]►│                 │                  │
  │◄─[fichier .txt]─│                  │                  │
```

---

## 12. 📋 Obligations légales associées

| Obligation | Article RGPD | Action dans Co-Caisse |
|---|---|---|
| Répondre dans 30 jours | Art. 12 | Exécution immédiate via le module |
| Conserver la preuve | Art. 30 | Rapport .txt + `rgpd_purge_logs` |
| Ne pas supprimer les données fiscales | LPF Art. L102 B | UPDATE ciblé — montants intacts |
| Traçabilité des accès admin | Art. 5(2) | `triggered_by_user` dans le log |
| Informer le client de l'action | Art. 12(3) | Le rapport peut être transmis au client |

---

*Co-Caisse — Documentation RGPD Droit à l'Effacement Art. 17 v1.0 · 01/03/2026*

