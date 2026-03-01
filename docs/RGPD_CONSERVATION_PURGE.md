# 🛡️ RGPD — Conservation & Purge des Données Personnelles

> **Module :** Gestion de la durée de conservation (RGPD)  
> **Cadre légal :** RGPD (Règlement UE 2016/679) + Livre des Procédures Fiscales (LPF art. L102 B)  
> **Accès :** Admin uniquement  
> **Fichiers clés :**
> - `server/src/jobs/purgeJob.js` — Cron node-cron + logique d'anonymisation
> - `server/src/routes/rgpd.js` — 4 endpoints API
> - `server/src/database/migrations/007_rgpd_purge.sql` — Migration colonnes + table
> - `client/src/renderer/index.html` — Bloc config **🛡️ RGPD** dans Paramètres
> - `client/src/renderer/app.js` — `loadRgpdStatus()` · `previewRgpdPurge()` · `triggerRgpdPurge()`

---

## 1. 🎯 À quoi ça sert ?

### Le problème légal à résoudre

Deux lois s'appliquent simultanément et semblent contradictoires :

| Loi | Obligation | Durée |
|---|---|---|
| **RGPD** (UE 2016/679) | Limiter la conservation des données personnelles | Le minimum nécessaire |
| **Code général des impôts** (LPF L102 B) | Conserver les pièces comptables (transactions) | **10 ans minimum** |

**La solution : l'anonymisation.**  
On ne supprime pas les transactions (interdit fiscalement), mais on **efface les données personnelles** qu'elles contiennent, tout en conservant les données fiscales intactes.

### Ce que fait ce module concrètement

| Fonctionnalité | Description |
|---|---|
| **Config durée** | Admin configure la durée de conservation (min légal : 120 mois = 10 ans) |
| **Cron 03h00** | Job automatique toutes les nuits, heure Paris, sans intervention humaine |
| **Anonymisation ciblée** | `customer_name` → `"Client anonymisé"`, `customer_email` → NULL, `customer_phone` → NULL |
| **Intégrité fiscale** | Montants, TVA, produits, totaux → **jamais touchés** |
| **Log immuable** | Chaque purge est enregistrée dans `rgpd_purge_logs` (impossible à supprimer via l'interface) |
| **Aperçu avant action** | L'admin peut voir combien de transactions seraient concernées avant de purger |
| **Purge manuelle** | Déclenchable à tout moment avec confirmation en 2 étapes |

---

## 2. 🗄️ Structure de données

### Nouvelles colonnes dans `settings`

```sql
rgpd_retention_months       SMALLINT  DEFAULT 120
  -- Durée de conservation des données clients (en mois)
  -- Minimum légal : 120 (10 ans)
  -- Toujours forcé à ≥ 120 côté serveur (Math.max)

rgpd_logs_retention_months  SMALLINT  DEFAULT 12
  -- Durée de conservation des logs applicatifs (table app_logs)
  -- Ces logs PEUVENT être supprimés (pas de valeur fiscale)
```

### Colonnes cibles (anonymisation)

**Table `transactions`** — seule colonne personnelle présente :
```sql
customer_email  VARCHAR  → NULL
-- (customer_name et customer_phone n'existent pas dans transactions)
```

**Table `orders`** — données nominatives des commandes :
```sql
customer_name   VARCHAR  → "Client anonymisé"  (si non-NULL)
customer_phone  VARCHAR  → NULL                (si non-NULL)
```

### Table `rgpd_purge_logs` (journal immuable)

```sql
CREATE TABLE rgpd_purge_logs (
  id                      VARCHAR(36)  PRIMARY KEY  -- UUID unique
  run_at                  DATETIME     -- Horodatage de la purge
  triggered_by            VARCHAR(20)  -- 'cron' | 'manual'
  triggered_by_user       VARCHAR(36)  -- UUID admin (si manuel), NULL si cron
  retention_months        SMALLINT     -- Valeur utilisée lors de la purge
  cutoff_date             DATETIME     -- Date pivot : tout avant = anonymisé
  transactions_anonymized INT          -- Nombre de transactions traitées
  logs_deleted            INT          -- Nombre de logs supprimés
  status                  VARCHAR(20)  -- 'success' | 'error' | 'partial'
  error_message           TEXT         -- Message d'erreur si échec
  created_at              DATETIME     -- Identique à run_at
)
```

---

## 3. 🔄 Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SERVER (Node.js)                                  │
│                                                                       │
│  index.js                                                             │
│    └─► db.initialize()       → tables créées/vérifiées               │
│    └─► app.listen(PORT, ...) → startPurgeJob(db) démarré             │
│                                         │                             │
│                        ┌────────────────▼──────────────────┐        │
│                        │        purgeJob.js                 │        │
│                        │  node-cron : '0 3 * * *'           │        │
│                        │  timezone  : 'Europe/Paris'         │        │
│                        │                                    │        │
│                        │  Tous les jours à 03h00 :          │        │
│                        │    runPurgeNow(db, 'cron', null)   │        │
│                        └────────────────┬──────────────────┘        │
│                                         │                             │
│                              ┌──────────▼────────────┐              │
│                              │    runPurgeNow()       │              │
│                              │                        │              │
│                              │ 1. Lire settings       │              │
│                              │    retention_months    │              │
│                              │ 2. Calculer cutoff     │              │
│                              │ 3. UPDATE transactions │              │
│                              │    (anonymisation)     │              │
│                              │ 4. DELETE app_logs     │              │
│                              │    (si table existe)   │              │
│                              │ 5. INSERT purge_log    │              │
│                              └──────────┬────────────┘              │
│                                         │                             │
│  routes/rgpd.js (admin only)            │                             │
│  ┌──────────────────────────────────────▼──────────────────────┐    │
│  │  GET  /api/rgpd/status   → config + dernier log             │    │
│  │  GET  /api/rgpd/preview  → nb transactions concernées       │    │
│  │  GET  /api/rgpd/logs     → 50 derniers logs                 │    │
│  │  POST /api/rgpd/purge    → runPurgeNow(db,'manual',userId)  │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                               │  HTTP
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     CLIENT (app.js)                                   │
│                                                                       │
│  loadSettingsData()                                                   │
│    └─► (admin) loadRgpdStatus()  → GET /api/rgpd/status              │
│               → affiche dernière purge dans #rgpdLastPurge            │
│                                                                       │
│  previewRgpdPurge()  → GET /api/rgpd/preview                         │
│    → affiche "X transactions seraient anonymisées"                   │
│                                                                       │
│  triggerRgpdPurge()                                                   │
│    → modal confirm → POST /api/rgpd/purge                            │
│    → affiche résultat + toast + rafraîchit statut                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. 🌊 Workflow complet

### A — Purge automatique (cron quotidien)

```
┌────────────────────────────────────────────────────────────────────┐
│  Chaque nuit à 03h00 (heure Paris)                                  │
│                                                                     │
│  1. Lire settings.rgpd_retention_months  (ex: 120)                 │
│  2. Calculer cutoff = maintenant - 120 mois                         │
│     → ex: 01/03/2026 - 120 mois = 01/03/2016                       │
│                                                                     │
│  3a. UPDATE transactions                                            │
│      WHERE created_at < '2016-03-01'                                │
│      AND customer_email IS NOT NULL                                 │
│      SET customer_email = NULL                                      │
│                                                                     │
│  3b. UPDATE orders                                                  │
│      WHERE created_at < '2016-03-01'                                │
│      AND (customer_name IS NOT NULL OR customer_phone IS NOT NULL)  │
│      SET customer_name  = 'Client anonymisé'                        │
│          customer_phone = NULL                                      │
│                                                                     │
│     ✅ Montants, articles, TVA, totaux : INCHANGÉS                  │
│     ✅ receipt_number, transaction_hash : INCHANGÉS                  │
│                                                                     │
│  4. (si table app_logs existe)                                      │
│     DELETE FROM app_logs WHERE created_at < (now - 12 mois)        │
│                                                                     │
│  5. INSERT INTO rgpd_purge_logs                                     │
│     { triggered_by: 'cron', transactions_anonymized: N, ... }      │
│                                                                     │
│  ✅ Log dans la console serveur :                                   │
│     [RGPD] ✓ Transactions anonymisées (customer_email) : 0         │
│     [RGPD] ✓ Commandes anonymisées (orders) : 0                    │
│     [RGPD] ✓ Log enregistré — statut: success                      │
└────────────────────────────────────────────────────────────────────┘
```

### B — Purge manuelle (admin via interface)

```
Admin ouvre Paramètres → 🛡️ RGPD
         │
         ├─ [🔄 Rafraîchir] ─────► GET /api/rgpd/status
         │                          → affiche dernière purge + date pivot
         │
         ├─ [🔍 Aperçu] ──────────► GET /api/rgpd/preview
         │                          → "42 transactions seraient anonymisées"
         │                             "avant le 01/03/2016"
         │
         └─ [🗑️ Purger maintenant]
                   │
                   ▼
          Modal de confirmation
          "Anonymiser les données personnelles
           antérieures au 01/03/2016 ?"
                   │
           ┌───────┴───────┐
           │               │
         Annuler        Anonymiser
           │               │
         (rien)     POST /api/rgpd/purge
                           │
                    runPurgeNow(db, 'manual', adminId)
                           │
                    ┌──────▼──────────────────┐
                    │  Résultat affiché :     │
                    │  ✅ Purge terminée      │
                    │  Anonymisées : 42       │
                    │  Logs supprimés : 0     │
                    └─────────────────────────┘
                    + Toast : "✅ Purge RGPD — 42 anonymisées"
                    + Rafraîchissement du statut
```

---

## 5. 🔐 Règles de sécurité immuables

| Règle | Où elle est appliquée | Pourquoi |
|---|---|---|
| **Minimum 120 mois** | `Math.max(months, 120)` côté serveur dans `settings.js` ET dans `purgeJob.js` | Obligation fiscale LPF — impossible à contourner même via API directe |
| **Transactions jamais supprimées** | `UPDATE` uniquement, aucun `DELETE` sur `transactions` | Obligation comptable et fiscale française |
| **Admin only** | `router.use(roleCheck(['admin']))` dans `rgpd.js` | Opération irréversible — seul l'admin peut agir |
| **Log immuable** | Aucun endpoint `DELETE` sur `rgpd_purge_logs` | Traçabilité RGPD requise en cas de contrôle CNIL |
| **Confirmation obligatoire** | Modal 2 étapes dans `triggerRgpdPurge()` | Prévient les clics accidentels |
| **Anonymisation ≠ suppression** | `customer_name = 'Client anonymisé'` (pas NULL) | Permet de savoir qu'un client existait sans l'identifier |

---

## 6. 📊 Avant / Après anonymisation

### Table `transactions`

```
AVANT :
│ customer_email : "jean@dupont.fr"       ← personnel │

APRÈS :
│ customer_email : NULL                  ← supprimé   │
│ total          : 22.40 €               ← identique  │
│ items          : [{Pain, 1.20€}, ...]  ← identique  │
│ transaction_hash: "a3f9c2..."          ← identique  │
```

### Table `orders`

```
AVANT :
│ customer_name  : "Jean Dupont"          ← personnel │
│ customer_phone : "06 12 34 56 78"       ← personnel │
│ total          : 22.40 €                ← conservé  │

APRÈS :
│ customer_name  : "Client anonymisé"    ← anonymisé  │
│ customer_phone : NULL                  ← supprimé   │
│ total          : 22.40 €               ← identique  │
│ items          : [{Pain, 1.20€}, ...]  ← identique  │
```

---

## 7. 🗂️ Endpoints API

Toutes les routes requièrent **JWT + rôle admin**.

### `GET /api/rgpd/status`

**Réponse :**
```json
{
  "retention_months":      120,
  "logs_retention_months": 12,
  "cutoff_date":           "2016-03-01T00:00:00.000Z",
  "legal_minimum_months":  120,
  "last_purge": {
    "id":                      "uuid...",
    "run_at":                  "2026-03-01T03:00:00.000Z",
    "triggered_by":            "cron",
    "triggered_by_user":       null,
    "retention_months":        120,
    "cutoff_date":             "2016-03-01T00:00:00.000Z",
    "transactions_anonymized": 0,
    "logs_deleted":            0,
    "status":                  "success",
    "error_message":           null
  }
}
```

### `GET /api/rgpd/preview`

**Réponse :**
```json
{
  "transactions_to_anonymize": 42,
  "cutoff_date":               "2016-03-01T00:00:00.000Z",
  "retention_months":          120
}
```

### `GET /api/rgpd/logs`

Retourne les 50 derniers logs de purge (tableau d'objets comme `last_purge` ci-dessus).

### `POST /api/rgpd/purge`

**Corps :** aucun (l'admin est identifié via JWT)

**Réponse succès :**
```json
{
  "success":                 true,
  "run_id":                  "uuid...",
  "run_at":                  "2026-03-01T14:00:00.000Z",
  "status":                  "success",
  "transactions_anonymized": 42,
  "logs_deleted":            0,
  "error_message":           null
}
```

---

## 8. ⚙️ Configuration

**Chemin dans l'interface :**  
Gestion → Paramètres → **🛡️ RGPD — Conservation des données**

| Paramètre | ID HTML | Défaut | Contrainte |
|---|---|---|---|
| Rétention données clients | `#rgpdRetentionMonths` | 120 mois | `min="120"` — minimum légal bloqué |
| Rétention logs applicatifs | `#rgpdLogsRetentionMonths` | 12 mois | `min="1"` |

> **Double protection :** même si l'admin saisit 60 dans l'input, le serveur force `Math.max(60, 120) = 120`.

---

## 9. 🧪 Comment tester dans l'application

### Prérequis
- Serveur démarré : `cd server && npm run dev`
- Connecté en tant qu'**admin**
- Migration 007 jouée (automatique au démarrage)

---

### TEST 1 — Vérifier que le bloc RGPD s'affiche

1. Aller dans **Gestion → Paramètres**
2. Faire défiler jusqu'à la section **🛡️ RGPD — Conservation des données**

✅ **Attendu :**
- Champ **Données clients** : valeur `120`, input verrouillé à `min="120"`
- Champ **Logs applicatifs** : valeur `12`
- Bloc **Dernière purge** : "Aucune purge effectuée · Date pivot actuelle : XX/XX/XXXX"
- 3 boutons : `🔄 Rafraîchir`, `🔍 Aperçu`, `🗑️ Purger maintenant`

---

### TEST 2 — Vérifier la date pivot

Avec 120 mois de rétention et la date du jour `01/03/2026` :

```
Cutoff = 01/03/2026 - 120 mois = 01/03/2016
```

1. Cliquer **🔄 Rafraîchir**

✅ **Attendu :** "Date pivot actuelle : données avant le 01/03/2016"

**Pour tester avec une durée plus courte (test uniquement) :**
1. Passer temporairement la rétention à `1` mois
2. Enregistrer → La date pivot devient "01/02/2026"
> ⚠️ Remettre à 120 après le test !

---

### TEST 3 — Aperçu avant purge

> 💡 **Rappel — Date pivot :**  
> Avec 120 mois de rétention et la date du jour `01/03/2026` :  
> `Date pivot = 01/03/2026 − 120 mois = 01/03/2016`  
> Seules les transactions **antérieures au 01/03/2016** sont concernées.  
> Des transactions créées en 2026 **ne seront anonymisées qu'en 2036** — c'est voulu et légalement obligatoire.

1. Cliquer **🔍 Aperçu**

✅ **Attendu (application récente — toutes les transactions datent de moins de 10 ans) :**
```
🔍 Aperçu : 0 transaction(s) avec données personnelles
antérieures au 01/03/2016 seraient anonymisées.
Aucune action requise actuellement.
```
→ **C'est normal.** Vos transactions 2026 ne seront concernées qu'en 2036.

✅ **Attendu (test avec rétention réduite à 1 mois) :**
```
🔍 Aperçu : 2 transaction(s) avec données personnelles
antérieures au 01/02/2026 seraient anonymisées.
Cliquez "Purger maintenant" pour lancer l'anonymisation.
```

---

### TEST 4 — Purge manuelle avec confirmation

*(Réduire temporairement la rétention à 1 mois pour avoir des données à anonymiser)*

1. Changer rétention → `1` → Enregistrer
2. Cliquer **🔍 Aperçu** → noter le nombre de transactions concernées (ex: 5)
3. Cliquer **🗑️ Purger maintenant**

✅ **Attendu :**
- Modal de confirmation s'ouvre avec le texte explicatif
- Cliquer **"Anonymiser"**
- Résultat vert : `✅ Purge terminée — Anonymisées : 5 — Logs supprimés : 0`
- Toast : `✅ Purge RGPD — 5 transaction(s) anonymisée(s)`
- Le bloc statut se met à jour avec l'heure de la purge

**Vérifier en base :**
```sql
SELECT customer_name, customer_email, customer_phone, total
FROM transactions
ORDER BY created_at ASC
LIMIT 5;
```

✅ **Attendu :**
```
customer_name  : "Client anonymisé"
customer_email : NULL
customer_phone : NULL
total          : 22.40   ← inchangé
```

---

### TEST 5 — Annulation de la purge

1. Cliquer **🗑️ Purger maintenant**
2. Dans le modal de confirmation → cliquer **"Annuler"**

✅ **Attendu :** aucune action — aucun changement en base — aucun log créé

---

### TEST 6 — Minimum légal impossible à contourner

1. Saisir `60` dans le champ "Données clients" (60 mois = 5 ans)
2. Cliquer **💾 Enregistrer les paramètres**
3. Recharger la page

✅ **Attendu :** le champ revient à `120` (le serveur a corrigé avec `Math.max(60, 120) = 120`)

---

### TEST 7 — Cron automatique (simulation)

Pour tester sans attendre 03h00, appeler l'endpoint directement :

```bash
curl -X POST http://localhost:5000/api/rgpd/purge \
  -H "Authorization: Bearer <votre_token_admin>" \
  -H "Content-Type: application/json"
```

✅ **Attendu :**
```json
{
  "success": true,
  "status": "success",
  "transactions_anonymized": 0,
  "logs_deleted": 0
}
```

**Vérifier dans la console serveur :**
```
[RGPD] ▶ Démarrage purge automatique : 2026-03-01T03:00:00.000Z
[RGPD] Conservation données : 120 mois → pivot : 2016-03-01 03:00:00
[RGPD] ✓ Transactions anonymisées : 0
[RGPD] ℹ Table app_logs absente — étape ignorée
[RGPD] ✓ Log enregistré — id: uuid... — statut: success
```

---

### TEST 8 — Historique des purges via API

```
GET http://localhost:5000/api/rgpd/logs
Authorization: Bearer <token_admin>
```

✅ **Attendu :** tableau des dernières purges avec `triggered_by`, `run_at`, `transactions_anonymized`, `status`

---

### TEST 9 — Vérifier que le cron démarre bien

Au démarrage du serveur, chercher dans la console :

```
✅ RGPD : job de purge planifié à 03h00 (Europe/Paris)
```

Si ce message est absent → vérifier que `startPurgeJob(db)` est bien appelé dans `index.js` à l'intérieur du `app.listen()`.

---

## 10. 🐛 Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| **"0 anonymisées" alors que j'ai des transactions** | Les transactions datent de moins de 10 ans → date pivot = 2016 | ✅ Normal. Réduire temporairement à `1` mois pour tester, puis remettre à `120` |
| **"Date pivot : données avant le 01/03/2016"** | 120 mois de rétention = 10 ans en arrière | ✅ Normal. C'est l'obligation légale fiscale française |
| Bloc RGPD absent dans Paramètres | Section non insérée dans `index.html` | Vérifier la présence de `id="rgpdStatusBlock"` dans le HTML |
| "Service RGPD non disponible" | Route `/api/rgpd` non enregistrée | Vérifier import `rgpdRoutes` dans `index.js` |
| Rétention revient toujours à 120 | Saisie < 120 corrigée par le serveur | Normal — protection légale |
| `0 transactions anonymisées` toujours | Aucune transaction > 10 ans | Normal si application récente |
| Cron ne démarre pas | `startPurgeJob` non appelé | Doit être dans le callback de `app.listen()` |
| Message d'erreur "roleCheck" | Token JWT expiré ou rôle non admin | Se reconnecter avec un compte admin |
| `app_logs` absent dans les logs | Table non créée | Normal — le job l'ignore silencieusement |

---

## 11. 📐 Diagramme de séquence

```
Admin                app.js             API Server          MariaDB
  │                    │                    │                  │
  │ ─[ouvre Paramètres]►│                   │                  │
  │                    │──GET /rgpd/status─►│                  │
  │                    │                    │─SELECT settings──►
  │                    │                    │─SELECT purge_logs►
  │                    │◄──{cutoff, lastPurge}─────────────────│
  │◄─[Bloc RGPD affiché]│                   │                  │
  │                    │                    │                  │
  │ ─[🔍 Aperçu]───────►│                   │                  │
  │                    │──GET /rgpd/preview─►                  │
  │                    │                    │─COUNT transactions►
  │                    │◄──{to_anonymize:5}─│                  │
  │◄─["5 seraient anon"]│                   │                  │
  │                    │                    │                  │
  │ ─[🗑️ Purger]──────►│                   │                  │
  │◄─[Modal confirm]───│                   │                  │
  │ ─[Confirme]────────►│                   │                  │
  │                    │──POST /rgpd/purge─►│                  │
  │                    │                    │─UPDATE transactions►
  │                    │                    │  (anonymisation) │
  │                    │                    │─INSERT purge_log─►
  │                    │◄──{anonymized:5}───│                  │
  │◄─[✅ Résultat + Toast]│                 │                  │

  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ AUTOMATIQUE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

Chaque nuit 03h00 (Europe/Paris)
  node-cron → runPurgeNow(db,'cron',null)
            → UPDATE transactions (anonymisation)
            → INSERT rgpd_purge_logs
```

---

*Co-Caisse — Documentation RGPD Conservation & Purge v1.0 · 01/03/2026*

