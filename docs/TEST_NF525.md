# 🧪 Guide de test — Phase 1 : Conformité fiscale NF525

> **Application :** Co-Caisse  
> **Date :** 28/02/2026  
> **Prérequis :** Serveur démarré (`npm run dev` dans `server/`), interface ouverte sur `http://localhost:3000`, connecté en tant qu'**admin**

---

## 📋 Table des matières

1. [Prérequis et mise en place](#1-prérequis-et-mise-en-place)
2. [Test — Clé HMAC dans .env](#2-test--clé-hmac-dans-env)
3. [Test — Migration base de données](#3-test--migration-base-de-données)
4. [Test — Activation du chaînage dans les Paramètres](#4-test--activation-du-chaînage-dans-les-paramètres)
5. [Test — Chaînage à la création d'une transaction](#5-test--chaînage-à-la-création-dune-transaction)
6. [Test — Endpoint /api/fiscal/status](#6-test--endpoint-apifiscalstatus)
7. [Test — Vérification de la chaîne (verify-chain)](#7-test--vérification-de-la-chaîne-verify-chain)
8. [Test — Détection d'une rupture de chaîne](#8-test--détection-dune-rupture-de-chaîne)
9. [Test — Journal des anomalies](#9-test--journal-des-anomalies)
10. [Test — Désactivation du chaînage](#10-test--désactivation-du-chaînage)
11. [Test — Cas limites et robustesse](#11-test--cas-limites-et-robustesse)
12. [Récapitulatif des résultats](#12-récapitulatif-des-résultats)

---

## 1. Prérequis et mise en place

### 1.1 Démarrer l'environnement

```powershell
# Terminal 1 — Serveur backend
cd C:\Users\pheni\IdeaProjects\co-caisse\server
npm run dev

# Terminal 2 — Frontend (si build nécessaire)
cd C:\Users\pheni\IdeaProjects\co-caisse\client
npm run dev
```

### 1.2 Vérifier que le serveur répond

Ouvrir dans le navigateur ou Postman :
```
GET http://localhost:5000/api/health
```
✅ **Attendu :** `{ "status": "OK", "version": "2.0.0" }`

### 1.3 Obtenir un token JWT admin

```
POST http://localhost:5000/api/users/login
Content-Type: application/json

{
  "username": "admin",
  "password": "AdminLocal123!"
}
```
✅ **Attendu :** `{ "token": "eyJ...", "user": { "role": "admin" } }`

> 💡 **Conserver ce token** — il sera utilisé dans tous les appels suivants sous la forme :
> `Authorization: Bearer <token>`

---

## 2. Test — Clé HMAC dans .env

### 2.1 Vérifier que la variable est définie

Ouvrir `server/.env` et vérifier la présence de :
```dotenv
FISCAL_HMAC_KEY=changeme_fiscal_hmac_key_min_32_chars_NF525_2026
```

> ⚠️ **Pour un test réaliste**, remplacer par une vraie clé aléatoire :
> ```powershell
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Copier le résultat dans `.env`, puis **redémarrer le serveur**.

### 2.2 Vérifier via l'API que la clé est détectée

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token>
```
✅ **Attendu :** `"hmac_key_set": true`  
❌ **Si `false`** : la variable `FISCAL_HMAC_KEY` est absente ou vide dans `.env`

---

## 3. Test — Migration base de données

### 3.1 Vérifier que la migration 002 a été jouée

Dans les **logs du serveur** au démarrage, chercher :
```
✅ Migration appliquée : 002_fiscal_chain.sql
```
ou (si déjà jouée lors d'un démarrage précédent) :
```
✅ Migrations : aucune nouvelle migration
```

### 3.2 Vérifier les tables en base (via un client MariaDB)

```sql
-- Se connecter à la base
mysql -u cocaisse -p cocaisse

-- Vérifier les nouvelles tables
SHOW TABLES LIKE 'fiscal%';
-- Attendu : fiscal_chain, fiscal_anomalies

-- Vérifier la colonne transaction_hash
DESCRIBE transactions;
-- Attendu : une ligne "transaction_hash | varchar(64) | YES | | NULL"

-- Vérifier la colonne fiscal_chain_enabled
DESCRIBE settings;
-- Attendu : une ligne "fiscal_chain_enabled | tinyint(1) | NO | | 0"

-- Vérifier le singleton fiscal_chain
SELECT * FROM fiscal_chain;
-- Attendu : id=1, last_hash="GENESIS", chain_length=0
```

✅ **Toutes les vérifications passent** → migration OK

---

## 4. Test — Activation du chaînage dans les Paramètres

### 4.1 Via l'interface

1. Aller dans **Gestion → Paramètres** (onglet visible admin uniquement)
2. Faire défiler jusqu'à la section **"🔐 Conformité fiscale NF525"**
3. Vérifier que le bloc est visible avec :
   - Le toggle **"Activer le chaînage NF525"** (désactivé par défaut)
   - Le statut de la chaîne (point gris = désactivé)
   - Le bouton **"🔍 Vérifier l'intégrité de la chaîne"**

✅ **Attendu :** Le bloc NF525 est visible uniquement en étant connecté en tant qu'admin

### 4.2 Activer le chaînage

1. Cocher le toggle **"Activer le chaînage NF525"**
2. Cliquer **"💾 Enregistrer les paramètres"**
3. Observer le statut qui se met à jour automatiquement

✅ **Attendu après sauvegarde :**
- Point **vert** dans l'indicateur de statut
- Texte : `✅ Chaînage actif — 0 transaction(s) chaînée(s)`
- Message : `Dernière transaction : aucune`

### 4.3 Vérifier via l'API

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token>
```
✅ **Attendu :**
```json
{
  "enabled": true,
  "chain_length": 0,
  "last_tx_id": null,
  "hmac_key_set": true,
  "unchained_count": 0
}
```

---

## 5. Test — Chaînage à la création d'une transaction

### 5.1 Créer une première transaction (Transaction T1)

Depuis la **caisse POS** de l'interface :
1. Ajouter un ou plusieurs produits au panier
2. Cliquer **Payer** → sélectionner **Espèces** → valider

**Ou via l'API directement :**
```
POST http://localhost:5000/api/transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [{"id": "p1", "name": "Café", "qty": 2, "price": 1.50}],
  "subtotal": 3.00,
  "tax": 0.60,
  "discount": 0,
  "total": 3.60,
  "payment_method": "cash",
  "payment_status": "completed",
  "change": 0
}
```

### 5.2 Vérifier que le hash a été calculé

```sql
-- En base MariaDB
SELECT id, total, receipt_number, transaction_hash
FROM transactions
ORDER BY created_at DESC
LIMIT 1;
```
✅ **Attendu :** `transaction_hash` est une chaîne hexadécimale de **64 caractères**  
❌ **Si NULL** : vérifier que `fiscal_chain_enabled = 1` dans settings et que `FISCAL_HMAC_KEY` est définie

### 5.3 Vérifier la mise à jour du singleton fiscal_chain

```sql
SELECT * FROM fiscal_chain;
```
✅ **Attendu :**
```
id=1 | last_hash=<64 chars hex> | last_tx_id=<uuid T1> | chain_length=1
```

### 5.4 Vérifier via l'API status

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token>
```
✅ **Attendu :** `"chain_length": 1`, `"last_tx_id": "<uuid T1>"`

### 5.5 Créer une deuxième transaction (Transaction T2)

Répéter l'étape 5.1 avec un autre produit ou montant.

```sql
SELECT id, total, transaction_hash
FROM transactions
ORDER BY created_at DESC
LIMIT 2;
```
✅ **Attendu :**
- T1 et T2 ont chacun un `transaction_hash` différent
- Les deux hash font 64 caractères
- `fiscal_chain.chain_length = 2`
- `fiscal_chain.last_tx_id = <uuid T2>`

---

## 6. Test — Endpoint /api/fiscal/status

### 6.1 Accès admin uniquement

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token_admin>
```
✅ **Attendu :** `200 OK` avec les infos de la chaîne

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token_cashier>
```
✅ **Attendu :** `403 Forbidden` — `"Accès refusé — rôle requis : admin"`

### 6.2 Contenu de la réponse

✅ **Vérifier que la réponse contient :**
| Champ | Type | Valeur attendue |
|---|---|---|
| `enabled` | boolean | `true` si activé |
| `chain_length` | number | Nombre de TX chaînées |
| `last_tx_id` | string\|null | UUID de la dernière TX |
| `last_hash_hint` | string | 8 premiers chars du hash + `…` |
| `hmac_key_set` | boolean | `true` si clé définie dans .env |
| `unchained_count` | number | TX sans hash (avant activation) |
| `updated_at` | datetime | Date de la dernière mise à jour |

---

## 7. Test — Vérification de la chaîne (verify-chain)

### 7.1 Via l'interface

1. Aller dans **Paramètres → 🔐 Conformité fiscale NF525**
2. Cliquer **"🔍 Vérifier l'intégrité de la chaîne"**
3. Attendre le résultat (peut prendre quelques secondes si beaucoup de transactions)

✅ **Attendu (chaîne intègre) :**
```
✅ Chaîne intègre — X/X transaction(s) vérifiée(s)
Vérifiée le 28/02/2026 à 14:32
```

### 7.2 Via l'API

```
GET http://localhost:5000/api/fiscal/verify-chain
Authorization: Bearer <token_admin>
```
✅ **Attendu :**
```json
{
  "ok": true,
  "total": 2,
  "verified": 2,
  "anomalies": [],
  "verified_at": "2026-02-28T14:32:00.000Z"
}
```

### 7.3 Performance — Vérification sur volume

Créer **10 transactions** successives via la caisse ou l'API, puis relancer la vérification.

✅ **Attendu :**
- `"verified": 10`, `"ok": true`
- Temps de réponse < 2 secondes pour 10 transactions

---

## 8. Test — Détection d'une rupture de chaîne

> ⚠️ **Ce test modifie des données en base — à effectuer sur un environnement de test uniquement.**

### 8.1 Préparer — Identifier la transaction à corrompre

```sql
SELECT id, transaction_hash FROM transactions
ORDER BY created_at DESC
LIMIT 3;
```
Noter l'`id` et le `transaction_hash` d'une transaction (ex: la 2ème).

### 8.2 Corrompre manuellement un hash en base

```sql
-- Remplacer le hash de la 2ème transaction par une valeur bidon
UPDATE transactions
SET transaction_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
WHERE id = '<uuid_tx2>';
```

### 8.3 Relancer la vérification

```
GET http://localhost:5000/api/fiscal/verify-chain
Authorization: Bearer <token_admin>
```
✅ **Attendu :**
```json
{
  "ok": false,
  "total": 3,
  "verified": 2,
  "anomalies": [
    {
      "position": 2,
      "tx_id": "<uuid_tx2>",
      "type": "hash_mismatch",
      "expected": "<hash_correct>",
      "actual": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```

### 8.4 Vérifier dans les logs serveur

Dans le terminal du serveur, vérifier la présence de :
```
[fiscal] ⚠️  1 anomalie(s) détectée(s) dans la chaîne !
[fiscal]   ↳ TX <uuid_tx2> — type: hash_mismatch
[fiscal] 🚨 ALERTE ADMIN — Intégrité de la chaîne fiscale compromise !
```

### 8.5 Vérifier l'interface

1. Aller dans **Paramètres → 🔐 NF525**
2. Cliquer **"🔍 Vérifier"**

✅ **Attendu :**
```
🚨 1 anomalie(s) détectée(s) !
2/3 transaction(s) OK
• Position #2 — TX <uuid>… — hash_mismatch
Les anomalies ont été enregistrées. Contactez le support.
```

### 8.6 Restaurer le hash correct (nettoyage)

```sql
-- Remettre le hash original pour ne pas laisser la base corrompue
UPDATE transactions
SET transaction_hash = '<hash_original_noté_en_8.1>'
WHERE id = '<uuid_tx2>';
```

---

## 9. Test — Journal des anomalies

### 9.1 Lister les anomalies enregistrées

Après le test de rupture (section 8) :

```
GET http://localhost:5000/api/fiscal/anomalies
Authorization: Bearer <token_admin>
```
✅ **Attendu :** tableau avec au moins 1 entrée contenant :
- `tx_id`, `anomaly_type`, `expected_hash`, `actual_hash`, `detected_at`
- `resolved: 0` (non résolue)

### 9.2 Filtrer les anomalies non résolues uniquement

```
GET http://localhost:5000/api/fiscal/anomalies?resolved=false
Authorization: Bearer <token_admin>
```
✅ **Attendu :** seules les anomalies avec `resolved = 0`

### 9.3 Marquer une anomalie comme résolue

Récupérer l'`id` d'une anomalie depuis la réponse précédente, puis :

```
POST http://localhost:5000/api/fiscal/anomalies/<id>/resolve
Authorization: Bearer <token_admin>
```
✅ **Attendu :** `{ "success": true }`

Vérifier en base :
```sql
SELECT id, resolved, resolved_at, resolved_by FROM fiscal_anomalies;
```
✅ **Attendu :** `resolved = 1`, `resolved_at` renseignée, `resolved_by = <userId admin>`

---

## 10. Test — Désactivation du chaînage

### 10.1 Désactiver le chaînage via l'interface

1. Aller dans **Paramètres → 🔐 NF525**
2. Décocher le toggle **"Activer le chaînage NF525"**
3. Cliquer **"💾 Enregistrer"**

✅ **Attendu :**
- Point **gris** dans l'indicateur de statut
- Texte : `Chaînage désactivé — les nouvelles transactions ne seront pas signées`
- Si des transactions avaient déjà été chaînées : `X transaction(s) déjà chaînée(s) conservées.`

### 10.2 Créer une transaction avec le chaînage désactivé

Créer une nouvelle transaction depuis la caisse ou l'API.

```sql
SELECT transaction_hash FROM transactions ORDER BY created_at DESC LIMIT 1;
```
✅ **Attendu :** `transaction_hash = NULL` (pas de hash puisque désactivé)

### 10.3 Vérifier que les anciens hashs sont préservés

```sql
SELECT COUNT(*) FROM transactions WHERE transaction_hash IS NOT NULL;
```
✅ **Attendu :** le nombre de transactions chaînées avant désactivation est inchangé

---

## 11. Test — Cas limites et robustesse

### 11.1 FISCAL_HMAC_KEY absente avec chaînage activé

1. Dans `server/.env`, **commenter** la ligne `FISCAL_HMAC_KEY` :
   ```dotenv
   # FISCAL_HMAC_KEY=...
   ```
2. Redémarrer le serveur
3. Tenter un encaissement en caisse

✅ **Attendu :**
- La transaction est créée normalement (pas de blocage)
- `transaction_hash = NULL` (le hash est ignoré avec un warning)
- Dans les logs serveur : `[fiscal] fiscal_chain_enabled=1 mais FISCAL_HMAC_KEY manquante dans .env !`
- Dans l'interface : le statut indique `⚠️ FISCAL_HMAC_KEY manquante dans le .env serveur !`

> 🔁 **Remettre la clé** dans `.env` et redémarrer avant de continuer.

### 11.2 Accès avec un rôle non-admin

Tester avec un compte **cashier** :

```
GET http://localhost:5000/api/fiscal/status
Authorization: Bearer <token_cashier>
```
✅ **Attendu :** `403 Forbidden`

```
GET http://localhost:5000/api/fiscal/verify-chain
Authorization: Bearer <token_cashier>
```
✅ **Attendu :** `403 Forbidden`

### 11.3 Accès sans token

```
GET http://localhost:5000/api/fiscal/status
```
✅ **Attendu :** `401 Unauthorized`

### 11.4 Vérification sur une chaîne vide (0 transaction hashée)

Désactiver le chaînage (voir section 10), puis appeler :
```
GET http://localhost:5000/api/fiscal/verify-chain
Authorization: Bearer <token_admin>
```
✅ **Attendu :**
```json
{ "ok": true, "total": 0, "verified": 0, "anomalies": [] }
```
Pas d'erreur, pas de crash.

### 11.5 Résistance à la perte de connexion DB sur fiscal_chain

> Ce test vérifie que l'encaissement n'est PAS bloqué si la table `fiscal_chain` est temporairement indisponible.

Simuler via un arrêt momentané de MariaDB ou en renommant temporairement la table :
```sql
RENAME TABLE fiscal_chain TO fiscal_chain_bak;
```
Tenter un encaissement en caisse.

✅ **Attendu :**
- La transaction est créée avec `transaction_hash = NULL`
- L'encaissement aboutit normalement (code 201)
- Erreur loggée côté serveur mais pas de crash

```sql
-- Restaurer
RENAME TABLE fiscal_chain_bak TO fiscal_chain;
```

---

## 12. Récapitulatif des résultats

Remplir ce tableau après chaque session de test :

| # | Test | Statut | Observations |
|---|------|--------|--------------|
| 2.1 | Clé HMAC dans .env | ⬜ | |
| 2.2 | Clé détectée par l'API | ⬜ | |
| 3.1 | Migration 002 dans les logs | ⬜ | |
| 3.2 | Tables en base MariaDB | ⬜ | |
| 4.1 | Bloc NF525 visible en admin | ⬜ | |
| 4.2 | Activation du toggle | ⬜ | |
| 4.3 | API status enabled=true | ⬜ | |
| 5.2 | Hash 64 chars sur TX1 | ⬜ | |
| 5.3 | fiscal_chain mis à jour | ⬜ | |
| 5.5 | Hash différent sur TX2 | ⬜ | |
| 6.1 | Accès refusé cashier (403) | ⬜ | |
| 6.2 | Tous les champs présents | ⬜ | |
| 7.1 | Vérification OK interface | ⬜ | |
| 7.2 | API verify-chain ok=true | ⬜ | |
| 8.3 | Rupture détectée (ok=false) | ⬜ | |
| 8.4 | Log serveur ALERTE ADMIN | ⬜ | |
| 8.5 | Anomalie affichée interface | ⬜ | |
| 9.1 | Anomalie listée en API | ⬜ | |
| 9.3 | Résolution anomalie | ⬜ | |
| 10.1 | Désactivation toggle | ⬜ | |
| 10.2 | TX sans hash après désact. | ⬜ | |
| 11.1 | Clé absente non-bloquante | ⬜ | |
| 11.2 | 403 sur rôle cashier | ⬜ | |
| 11.4 | verify-chain chaîne vide | ⬜ | |
| 11.5 | Encaissement non bloqué | ⬜ | |

**Légende :** ✅ Passé · ❌ Échoué · ⏭️ Non testé · ⬜ À tester

---

## 🛠️ Commandes utiles (aide-mémoire)

```powershell
# Démarrer le serveur
cd C:\Users\pheni\IdeaProjects\co-caisse\server ; npm run dev

# Générer une clé HMAC sécurisée
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Vérifier les tables fiscales en MariaDB
mysql -u cocaisse -pcocaisse cocaisse -e "SELECT * FROM fiscal_chain; SELECT COUNT(*) as tx_hashees FROM transactions WHERE transaction_hash IS NOT NULL;"

# Voir les 5 dernières transactions avec leur hash
mysql -u cocaisse -pcocaisse cocaisse -e "SELECT id, total, LEFT(transaction_hash,16) as hash_debut, created_at FROM transactions ORDER BY created_at DESC LIMIT 5;"
```

---

*Co-Caisse — Guide de test NF525 v1.0 · 28/02/2026*

