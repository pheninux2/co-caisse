# 📧 Ticket Dématérialisé — Loi AGEC

> **Module :** Ticket de caisse dématérialisé + email client  
> **Cadre légal :** Loi AGEC — Article 49 (en vigueur depuis août 2023)  
> **Fichiers clés :**
> - `server/src/routes/receipts.js` — Endpoints API
> - `server/src/services/email.service.js` — `sendReceiptEmail()`, templates HTML/texte
> - `server/src/database/migrations/005_agec_receipt_email.sql` — Colonnes DB
> - `server/src/database/migrations/006_agec_setting.sql` — Toggle activation
> - `client/src/renderer/app.js` — `_openTicketChoiceModal()`, `sendReceiptByEmail()`, …
> - `client/src/renderer/index.html` — Modal `#ticketChoiceModal`, bloc config paramètres

---

## 1. 🎯 À quoi ça sert ?

### Contexte légal

La **loi AGEC (Anti-Gaspillage pour une Économie Circulaire)**, article 49, est entrée en vigueur en **août 2023** en France. Elle interdit l'impression systématique des tickets de caisse thermiques pour limiter la production de déchets non recyclables.

**Ce que la loi impose :**
- Le ticket **ne doit plus être imprimé automatiquement** (sauf demande explicite du client)
- Il doit être proposé sous **format dématérialisé** (email, SMS, QR code…)
- Le client peut toujours demander une impression papier

**Ce que **ce module** implémente :**

| Fonctionnalité | Description |
|---|---|
| **Modal de choix** | Après chaque encaissement, un modal propose 3 options au caissier |
| **Envoi par email** | Ticket HTML complet envoyé via nodemailer (SMTP configurable) |
| **Impression à la demande** | Thermique (Electron) ou navigateur (web) |
| **Option "Aucun ticket"** | Ferme le modal sans rien faire |
| **RGPD** | Email stocké seulement avec consentement explicite du client |
| **Toggle admin** | On/off dans Paramètres — désactivable si besoin |

---

## 2. 🗄️ Données en base

### Table `transactions` — nouvelles colonnes
```sql
customer_email        VARCHAR(255)  DEFAULT NULL
  -- Email du client (stocké uniquement avec consentement RGPD)

receipt_email_sent_at DATETIME      DEFAULT NULL
  -- Horodatage d'envoi du ticket par email (NULL = pas envoyé)
```

### Table `settings` — nouvelle colonne
```sql
agec_enabled  TINYINT(1)  DEFAULT 1
  -- 1 = modal AGEC actif après encaissement
  -- 0 = comportement classique (affichage ticket direct, pas de modal)
```

---

## 3. 🔄 Schéma d'architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    CLIENT (app.js)                                    │
│                                                                       │
│  processPayment()                                                     │
│    └─► POST /api/transactions  (encaissement)                        │
│    └─► _openTicketChoiceModal(transaction)                           │
│              │                                                        │
│              ├─ agec_enabled = 0  ──────────────► showReceipt()      │
│              │                                    (comportement classique)
│              ├─ printByDefault = true (pays non-FR) ► showReceipt()  │
│              │                                                        │
│              └─ agec_enabled = 1 + printByDefault = false            │
│                        │                                              │
│                        ▼                                              │
│                 #ticketChoiceModal                                    │
│                  ├── 📧 Email ──► showEmailInput()                   │
│                  │                 └─► sendReceiptByEmail()           │
│                  │                       └─► POST /api/receipts/email │
│                  ├── 🖨️ Imprimer ─► printAndCloseTicketModal()       │
│                  │                   └─► showReceipt() + printReceipt()
│                  └── Aucun ticket ─► closeTicketModal()              │
└──────────────────────────────────────────────────────────────────────┘
                               │
                    POST /api/receipts/email
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    API SERVER (receipts.js)                           │
│                                                                       │
│  1. Valider transactionId + format email                             │
│  2. Récupérer transaction en base                                    │
│  3. Récupérer settings établissement                                 │
│  4. Vérifier SMTP_HOST / SMTP_USER / SMTP_PASS                      │
│  5. sendReceiptEmail({ to, transaction, settings })                  │
│  6. UPDATE transactions SET receipt_email_sent_at = NOW()            │
│     + customer_email = ? (si storeEmail = true)                     │
│  7. Retourner { success, rgpd_notice }                               │
└──────────────────────────────────────────────────────────────────────┘
                               │
                    nodemailer.sendMail()
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              email.service.js — sendReceiptEmail()                    │
│                                                                       │
│  _buildReceiptHtml()  → email HTML complet (tableau articles + TVA) │
│  _buildReceiptText()  → fallback texte brut                          │
│                                                                       │
│  Envoi via SMTP (Gmail, OVH, Mailgun, Mailtrap…)                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. 🌊 Workflow complet pas à pas

```
╔══════════════════════════════════════════════════════════════════════╗
║  CAISSIER clique [✅ Encaisser]                                       ║
╚══════════════════════════════════════════════════════════════════════╝
                         │
                         ▼
         POST /api/transactions  →  transaction créée en base
         Panier vidé, dashboard rafraîchi, toast "Paiement réussi"
                         │
                         ▼
             _openTicketChoiceModal(transaction)
                         │
          ┌──────────────┼──────────────────────┐
          │              │                       │
    agec_enabled=0   printByDefault=true    agec_enabled=1
    (désactivé)      (autre pays)           printByDefault=false
          │              │                       │  (France, défaut)
          ▼              ▼                       ▼
    showReceipt()   showReceipt()       ┌───────────────────┐
    (direct)        (impression auto)   │  MODAL AGEC       │
                                        │  🧾 Votre ticket  │
                                        │                   │
                                        │ ┌───────────────┐ │
                                        │ │ 📧 Par email  │ │
                                        │ └───────┬───────┘ │
                                        │         │         │
                                        │ ┌───────▼───────┐ │
                                        │ │ Saisie email  │ │
                                        │ │ ☐ Mémoriser   │ │
                                        │ │ [📤 Envoyer]  │ │
                                        │ └───────────────┘ │
                                        │                   │
                                        │ ┌───────────────┐ │
                                        │ │ 🖨️  Imprimer  │ │
                                        │ └───────────────┘ │
                                        │                   │
                                        │ [ Aucun ticket ]  │
                                        └───────────────────┘

  ── Option Email ──────────────────────────────────────────────────────
  sendReceiptByEmail()
    ├─ Validation regex email
    ├─ POST /api/receipts/email { transactionId, email, storeEmail }
    │    ├─ nodemailer → email HTML vers client
    │    └─ UPDATE transactions SET receipt_email_sent_at = NOW()
    │         + customer_email = email  (si consentement)
    ├─ ✅ Toast "Ticket envoyé à email@client.fr"
    └─ ℹ️  Toast RGPD si email mémorisé

  ── Option Imprimer ───────────────────────────────────────────────────
  printAndCloseTicketModal()
    ├─ Ferme le modal AGEC
    ├─ showReceipt(tx)  → modal monospace avec contenu ticket
    └─ setTimeout 400ms → printReceipt()
         ├─ Electron : window.electron.printTicket(html)
         └─ Navigateur : window.open() + window.print()

  ── Option Aucun ticket ───────────────────────────────────────────────
  closeTicketModal()
    └─ Ferme le modal, _pendingReceiptTransaction = null
```

---

## 5. 📄 Contenu du ticket email (HTML)

Le template `_buildReceiptHtml()` génère un email HTML responsive avec :

```
┌─────────────────────────────────────┐
│  🧾   BOULANGERIE MARTIN            │  ← header dégradé indigo/violet
│        12 rue de la Paix, PARIS     │
│        Tél : 01 23 45 67 89        │
│        N° TVA : FR12345678901      │
├─────────────────────────────────────┤
│  📅 28/02/2026 à 14h35  |  N°0042  │
├─────────────────────────────────────┤
│  Article        Qté  TVA   Montant  │
│  Pain chocolat   2   5.5%   2.40€  │
│  Menu midi       1   10%   12.00€  │
│  Vin rouge       1   20%    8.00€  │
├─────────────────────────────────────┤
│  Sous-total HT          19.83 €    │
│  TVA 5.5% / 2.27€        0.13 €    │
│  TVA 10%  / 10.91€       1.09 €    │
│  TVA 20%  / 6.67€        1.33 €    │
├─────────────────────────────────────┤
│  TOTAL TTC               22.40 €   │  ← gras, couleur indigo
├─────────────────────────────────────┤
│  💳 Paiement : CARTE BANCAIRE      │  ← fond vert
├─────────────────────────────────────┤
│  Merci de votre visite !            │
│  (Ticket envoyé à la demande AGEC) │
└─────────────────────────────────────┘
│  Co-Caisse © 2026 — Document fiscal │  ← footer sombre
```

---

## 6. 🗂️ Endpoints API

### `POST /api/receipts/email`

| Attribut | Valeur |
|---|---|
| **Auth** | ✅ JWT requis |
| **Rôle** | caissier, admin, manager |
| **Body** | `{ transactionId, email, storeEmail? }` |

**Corps de la requête :**
```json
{
  "transactionId": "uuid-de-la-transaction",
  "email":         "client@exemple.fr",
  "storeEmail":    false
}
```

**Réponse succès (200) :**
```json
{
  "success":      true,
  "message":      "Ticket envoyé à client@exemple.fr",
  "email_stored": false,
  "rgpd_notice":  "Email non stocké en base (aucune donnée personnelle conservée)"
}
```

**Codes d'erreur :**
| Code | Cause |
|---|---|
| `400` | `transactionId` ou `email` manquant / format invalide |
| `404` | Transaction introuvable |
| `503` | Variables SMTP absentes dans `.env` ou serveur SMTP inaccessible |
| `500` | Erreur serveur interne |

---

### `GET /api/receipts/:transactionId`

Retourne le statut email d'une transaction (sans exposer l'email complet — RGPD).

**Réponse :**
```json
{
  "transaction_id":        "uuid...",
  "receipt_number":        "TX-0042",
  "email_sent":            true,
  "email_sent_at":         "2026-02-28T14:35:00.000Z",
  "customer_email_stored": false,
  "customer_email_hint":   "cl***@exemple.fr"
}
```

---

## 7. ⚙️ Configuration

### Dans `server/.env`

```dotenv
# ── Email (nodemailer) — Ticket dématérialisé AGEC ──────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@gmail.com
SMTP_PASS=votre_mot_de_passe_application
SMTP_FROM="Boulangerie Martin" <noreply@boulangerie-martin.fr>
```

### Exemples de fournisseurs SMTP

| Fournisseur | HOST | PORT | Usage |
|---|---|---|---|
| **Gmail** | `smtp.gmail.com` | `587` | Production (activer mot de passe app) |
| **Mailtrap** | `sandbox.smtp.mailtrap.io` | `2525` | ✅ Tests uniquement |
| **OVH** | `ssl0.ovh.net` | `465` | Production |
| **Mailgun** | `smtp.mailgun.org` | `587` | Production |
| **Brevo** | `smtp-relay.brevo.com` | `587` | Production |

### Dans l'interface — Paramètres Admin

**Chemin :** Gestion → Paramètres → **📧 Ticket dématérialisé — Loi AGEC**

| Paramètre | Défaut | Effet |
|---|---|---|
| Toggle **Activer la proposition de ticket dématérialisé** | ✅ ON | Modal AGEC affiché après encaissement |
| Toggle **OFF** | — | Reçu classique affiché directement (pas de modal) |

---

## 8. 🔐 RGPD — Données personnelles

| Scénario | Email stocké en base ? | Durée |
|---|---|---|
| Client choisit email **sans** cocher "Mémoriser" | ❌ Non | — |
| Client choisit email **en cochant** "Mémoriser" | ✅ Oui, dans `transactions.customer_email` | Durée légale de conservation comptable |
| Client choisit Imprimer | ❌ Non | — |
| Client choisit Aucun ticket | ❌ Non | — |

**Mention affichée au client :**
> *"Email conservé pour l'envoi du ticket uniquement (RGPD)"*

**Ce qui n'est jamais exposé :**
- L'endpoint `GET /api/receipts/:id` retourne uniquement `cl***@exemple.fr` (masqué)
- L'email complet n'est jamais renvoyé dans une réponse API

---

## 9. 🧪 Comment tester dans l'application

### Prérequis
- Serveur démarré : `cd server && npm run dev`
- Connecté en tant que **caissier** ou **admin**
- Au moins 1 produit et 1 catégorie créés

---

### TEST 1 — Vérifier que le modal AGEC s'affiche

1. Aller sur la **Caisse (POS)**
2. Ajouter un produit au panier
3. Sélectionner un mode de paiement
4. Cliquer **✅ Encaisser**

✅ **Attendu :**
- Le modal **"🧾 Votre ticket"** s'ouvre (pas d'impression automatique)
- 3 boutons visibles : `📧 Recevoir par email`, `🖨️ Imprimer le ticket`, `Aucun ticket — Fermer`

❌ **Si reçu monospace s'affiche directement :** vérifier que `agec_enabled = 1` dans les settings

---

### TEST 2 — Option "Aucun ticket"

1. Encaisser une vente (TEST 1)
2. Dans le modal AGEC, cliquer **"Aucun ticket — Fermer"**

✅ **Attendu :**
- Modal fermé immédiatement
- Aucun email envoyé, aucune impression

---

### TEST 3 — Option "Imprimer"

1. Encaisser une vente (TEST 1)
2. Cliquer **🖨️ Imprimer le ticket**

✅ **Attendu :**
- Modal AGEC se ferme
- Modal du reçu monospace s'ouvre
- Fenêtre d'impression du navigateur s'ouvre automatiquement après ~400ms
- Le ticket contient la ventilation TVA par taux

---

### TEST 4 — Envoi email sans SMTP (erreur attendue)

*(SMTP non configuré dans `.env`)*

1. Encaisser une vente
2. Dans le modal AGEC, cliquer **📧 Recevoir par email**
3. Saisir `test@test.com`
4. Cliquer **📤 Envoyer le ticket**

✅ **Attendu :**
- Message d'erreur rouge sous le champ : `"Serveur email non configuré — contactez l'administrateur."`
- Le bouton redevient actif (pas bloqué)

---

### TEST 5 — Envoi email avec Mailtrap (test sans vrai email)

**Configuration Mailtrap dans `server/.env` :**
```dotenv
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<votre_user_mailtrap>
SMTP_PASS=<votre_pass_mailtrap>
SMTP_FROM="Co-Caisse Test" <test@co-caisse.fr>
```

1. Redémarrer le serveur après modification du `.env`
2. Encaisser une vente
3. Dans le modal AGEC → **📧 Par email**
4. Saisir n'importe quelle adresse email
5. Cliquer **📤 Envoyer le ticket**

✅ **Attendu :**
- Toast vert : `✅ Ticket envoyé à xxx@xxx.fr`
- Dans la boîte Mailtrap (inbox sandbox) : email HTML avec le ticket complet
- Tableau articles, ventilation TVA, total TTC, mode de paiement

---

### TEST 6 — Consentement RGPD

1. Encaisser une vente
2. Cliquer **📧 Par email**, saisir `client@test.fr`
3. **Cocher** la case "Conserver mon email pour les prochains tickets"
4. Envoyer

✅ **Attendu :**
- Toast vert envoi + toast bleu `"📧 Email conservé pour l'envoi du ticket uniquement (RGPD)"`
- En base : `SELECT customer_email, receipt_email_sent_at FROM transactions ORDER BY created_at DESC LIMIT 1`
  → `customer_email = 'client@test.fr'`, `receipt_email_sent_at` renseigné

**Sans cocher la case :**
- En base : `customer_email = NULL`, `receipt_email_sent_at` renseigné quand même

---

### TEST 7 — Vérifier le statut via l'API

Après un envoi, appeler l'API directement :
```
GET http://localhost:5000/api/receipts/<transaction_id>
Authorization: Bearer <votre_token>
```

✅ **Attendu :**
```json
{
  "email_sent": true,
  "email_sent_at": "2026-02-28T14:35:00.000Z",
  "customer_email_stored": false,
  "customer_email_hint": "cl***@test.fr"
}
```

---

### TEST 8 — Désactiver la section AGEC

1. Aller dans **Paramètres** (admin)
2. Section **📧 Ticket dématérialisé — Loi AGEC**
3. **Désactiver** le toggle
4. Cliquer **💾 Enregistrer les paramètres**
5. Encaisser une vente

✅ **Attendu :**
- Modal AGEC ne s'affiche plus
- Le reçu monospace s'ouvre directement (comportement classique)

**Réactiver** le toggle → modal AGEC réapparaît.

---

### TEST 9 — Réimpression d'un ticket existant

1. Aller dans **Historique**
2. Cliquer sur l'icône 🧾 d'une transaction
3. Observer le reçu

✅ **Attendu :**
- Reçu monospace affiché directement (pas de modal AGEC — normal pour une réimpression)
- Ventilation TVA correcte recalculée depuis `items[].tax_rate`

---

## 10. 🐛 Résolution des problèmes courants

| Symptôme | Cause probable | Solution |
|---|---|---|
| Modal AGEC ne s'affiche pas | `agec_enabled = 0` en base | Paramètres → AGEC → activer le toggle → enregistrer |
| Modal AGEC ne s'affiche pas | `printByDefault = true` (config pays non-FR) | Normal pour les pays hors France — vérifier `settings.country` |
| Bouton email grisé / erreur SMTP | Variables SMTP absentes dans `.env` | Renseigner `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| Email reçu avec mise en page cassée | Client mail n'affiche pas le HTML | Le texte brut de fallback est utilisé — c'est normal |
| `customer_email` non stocké | Client n'a pas coché "Mémoriser" | Normal — consentement RGPD non donné |
| Validation email échoue | Format invalide | Format attendu : `nom@domaine.ext` |
| Erreur 404 sur `/api/receipts/email` | Route non enregistrée | Vérifier que `receiptRoutes` est importé dans `index.js` |
| Toast "Transaction introuvable" | ID transaction incorrect | Vérifier que `result.id` est bien retourné par `POST /transactions` |

---

## 11. 📐 Diagramme de séquence

```
Caissier          app.js                 API Server          nodemailer        Client
   │                 │                       │                    │               │
   │─[Encaisser]────►│                       │                    │               │
   │                 │──POST /transactions──►│                    │               │
   │                 │◄──{id, receipt_nb...}─│                    │               │
   │◄─[Modal AGEC]───│                       │                    │               │
   │                 │                       │                    │               │
   │─[📧 Par email]─►│                       │                    │               │
   │◄─[Champ email]──│                       │                    │               │
   │─[Saisit email]─►│                       │                    │               │
   │─[📤 Envoyer]───►│                       │                    │               │
   │                 │──POST /receipts/email►│                    │               │
   │                 │     {txId, email}      │──sendMail()───────►│               │
   │                 │                       │                    │──email HTML──►│
   │                 │                       │◄──{messageId}──────│               │
   │                 │                       │─UPDATE tx (sent_at)│               │
   │                 │◄──{success: true}─────│                    │               │
   │◄─[Toast ✅]──────│                       │                    │               │
```

---

*Co-Caisse — Documentation Ticket Dématérialisé AGEC v1.0 · 28/02/2026*

