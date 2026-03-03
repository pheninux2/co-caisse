# 🧙 SETUP WIZARD — Assistant de Premier Démarrage

## À quoi ça sert ?

Le **Setup Wizard** est un assistant de configuration guidée qui s'affiche **uniquement lors de la toute première utilisation** de Co-Caisse.

Sans wizard, l'administrateur devrait :
- Configurer manuellement le pays, les taux TVA, la devise
- Créer son compte admin via la base de données directement
- Renseigner les infos légales dans les paramètres

**Avec le wizard**, tout se fait en 4 écrans successifs, en moins de 2 minutes, avant même d'accéder à l'application.

> ⚠️ Le wizard est **verrouillé** : impossible de le fermer ou de le contourner tant que la configuration n'est pas complétée. Il ne s'affiche **qu'une seule fois**.

---

## 📐 Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SETUP WIZARD SYSTEM                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  DÉCLENCHEUR : init() dans app.js                                     │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  GET /api/setup/status                                      │      │
│  │  → { completed: false }  ──► _showSetupWizard()            │      │
│  │  → { completed: true  }  ──► flux normal (licence→login)   │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  SERVEUR : server/src/routes/setup.js                                 │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  GET  /api/setup/status    → lit business_config.setup_    │      │
│  │                               completed                     │      │
│  │  POST /api/setup/complete  → crée admin + config + settings │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  BASE DE DONNÉES : flag dans business_config                          │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  config_key       │ config_value                            │      │
│  │  ─────────────────────────────────────                      │      │
│  │  setup_completed  │ 0  (avant wizard)                       │      │
│  │  setup_completed  │ 1  (après wizard)                       │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                        │
│  CLIENT : client/src/renderer/                                        │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  index.html  → <div id="setupWizard">  z-index: 110        │      │
│  │  app.js      → _wizardData, _showSetupWizard(),            │      │
│  │                _wizardNext/Prev/Finish()                    │      │
│  └────────────────────────────────────────────────────────────┘      │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Workflow complet

### Démarrage et décision d'affichage

```
Navigateur charge l'app
        │
        ▼
new CocaisseApp() → init()
        │
        ▼
GET /api/setup/status
        │
        ├─── completed: true ──────────────────────────────────────────►
        │                                          flux normal           │
        │                                   (licence → login → app)     │
        │                                                                │
        └─── completed: false ──────────────────────────────────────────►
                        │                          wizard s'affiche      │
                        ▼
            document.getElementById('setupWizard')
                .classList.remove('hidden')
            init() s'arrête ici
```

### Les 4 étapes du wizard

```
┌─────────────────────────────────────────────────────────────┐
│  ÉTAPE 1 — 🌍 Pays                                           │
│                                                              │
│  [🇫🇷 France]  [🇲🇦 Maroc]  [🇧🇪 Belgique]                    │
│  [🇨🇭 Suisse]  [🌍 Autre]                                    │
│                                                              │
│  Sélection → stockée dans _wizardData.country               │
│  Impact : TVA, devise, NF525, impression auto                │
└─────────────────────────────────────────────────────────────┘
                        │ Suivant →
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  ÉTAPE 2 — 🏪 Type d'établissement                           │
│                                                              │
│  [🍽️ Restaurant]  [🍕 Pizzeria]  [🍺 Bar]                    │
│  [🥐 Boulangerie] [🍔 Fast-food] [🛍️ Commerce]              │
│                                                              │
│  Sélection → stockée dans _wizardData.businessType          │
└─────────────────────────────────────────────────────────────┘
                        │ Suivant →
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  ÉTAPE 3 — 📋 Informations légales                           │
│                                                              │
│  Nom de l'établissement *     Adresse *                      │
│  SIRET (FR 14 chiffres)       N° TVA                         │
│  Téléphone                    Email                          │
│                                                              │
│  Validation temps réel :                                     │
│  • FR → SIRET : 14 chiffres                                  │
│  • MA → ICE   : 15 chiffres                                  │
└─────────────────────────────────────────────────────────────┘
                        │ Suivant →
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  ÉTAPE 4 — 👤 Compte administrateur                          │
│                                                              │
│  Nom d'utilisateur *                                         │
│  Email (optionnel)                                           │
│  Mot de passe *  [████░ Correct]                             │
│  Confirmer MDP *                                             │
│                                                              │
│  Règles mot de passe :                                       │
│  ✓ 8 caractères minimum                                      │
│  ✓ 1 majuscule                                               │
│  ✓ 1 chiffre                                                 │
└─────────────────────────────────────────────────────────────┘
                        │ ✅ Terminer
                        ▼
            POST /api/setup/complete
```

### Ce que fait `POST /api/setup/complete`

```
POST /api/setup/complete
        │
        ├── Vérification anti-rejeu :
        │   setup_completed === '1' ? → 409 Conflict (bloqué)
        │
        ├── Validation du body (côté serveur) :
        │   • Nom et adresse obligatoires
        │   • MDP : regex /^(?=.*[A-Z])(?=.*\d).{8,}$/
        │   • SIRET (FR) : /^\d{14}$/
        │   • ICE (MA)   : /^\d{15}$/
        │
        ├── 1. UPSERT business_config :
        │      country, business_type, vat_rates,
        │      default_vat_rate, currency, currency_symbol,
        │      print_by_default, antifraud_mode, closure_required
        │
        ├── 2. INSERT / UPDATE settings :
        │      company_name, company_address, company_phone,
        │      company_email, tax_number, currency,
        │      default_tax_rate, country
        │
        ├── 3. INSERT users :
        │      role = 'admin', bcrypt(password, 12 rounds)
        │
        ├── 4. UPDATE business_config :
        │      setup_completed = '1'
        │
        └── 5. Retourne :
               { success: true, token: JWT, user: {...}, config: {...} }
                        │
                        ▼
            Auto-login : JWT stocké dans localStorage
            init() relancé → flux normal
```

---

## 🗂️ Fichiers concernés

```
co-caisse/
├── server/
│   └── src/
│       ├── index.js                  ← Import + montage /api/setup (AVANT licenceMiddleware)
│       ├── routes/
│       │   └── setup.js              ← GET /status + POST /complete (CRÉÉ)
│       └── database/
│           └── index.js              ← INSERT IGNORE setup_completed = '0'
│
└── client/
    └── src/renderer/
        ├── index.html                ← <div id="setupWizard"> (z-[110], 4 étapes)
        └── app.js                    ← Vérification dans init() + méthodes _wizard*
```

---

## 🔒 Sécurités implémentées

| Sécurité | Détail |
|---|---|
| **Anti-rejeu** | `POST /complete` vérifie `setup_completed !== '1'` avant d'exécuter |
| **Pas de bouton fermer** | Aucune croix, aucune touche Échap — impossible de contourner |
| **Validation double** | Client (temps réel) + Serveur (lors de la soumission) |
| **Force MDP** | Regex + indicateur visuel 4 barres (Très faible → Fort) |
| **Bcrypt** | 12 rounds — même niveau que les autres mots de passe |
| **Auto-login sécurisé** | JWT retourné directement par `/setup/complete` — pas de second appel |
| **Route publique isolée** | Montée avant `licenceMiddleware` et `authMiddleware` |

---

## 🧪 Comment tester dans l'application

### Pré-requis
- Serveur démarré : `cd server && npm run dev`
- Client démarré : `cd client && npm start`
- Base de données **vide** ou flag `setup_completed = '0'`

---

### Test 1 — Déclencher le wizard (installation fraîche)

**Option A — Réinitialiser le flag en base :**
```sql
-- Dans MariaDB
UPDATE business_config SET config_value = '0' WHERE config_key = 'setup_completed';
DELETE FROM users WHERE role = 'admin';
```

**Option B — Via l'API :**
```bash
# Vérifier l'état actuel
curl http://localhost:5000/api/setup/status

# Réponse attendue si wizard non complété :
# { "completed": false, "has_admin": false, "reason": "setup_not_completed" }

# Réponse si déjà complété :
# { "completed": true, "has_admin": true, "reason": null }
```

**Recharger l'application :**
```
1. Ouvrir http://localhost:3000
   ✅ ATTENDU : le wizard s'affiche sur fond sombre
   ✅ Pas de bouton fermer
   ✅ Barre de progression : Étape 1 / 4
```

---

### Test 2 — Étape 1 : sélection du pays

```
1. Cliquer sur 🇫🇷 France
   ✅ ATTENDU : bouton surligné en indigo, bordure épaisse

2. Cliquer sur 🇲🇦 Maroc
   ✅ ATTENDU : Maroc sélectionné, France déselectionné

3. Cliquer "Suivant →" SANS sélectionner
   ✅ ATTENDU : message d'erreur "Veuillez sélectionner un pays."

4. Sélectionner 🇫🇷 France, puis "Suivant →"
   ✅ ATTENDU : passage à l'étape 2
   ✅ Barre de progression : Étape 2 / 4
```

---

### Test 3 — Étape 3 : validation SIRET

```
Pays sélectionné : 🇫🇷 France

1. Laisser le champ Nom vide, cliquer "Suivant →"
   ✅ ATTENDU : "Le nom et l'adresse sont obligatoires."

2. Remplir Nom = "Test", Adresse = "1 rue Test"
   Saisir SIRET = "123" (trop court)
   Cliquer "Suivant →"
   ✅ ATTENDU : "SIRET invalide — 14 chiffres requis."

3. Saisir SIRET = "12345678901234" (14 chiffres)
   ✅ ATTENDU : pas d'erreur, passage étape 4

---
Pays sélectionné : 🇲🇦 Maroc

4. Le label du champ devient "ICE (15 chiffres)"
   Saisir ICE = "123456789012345" (15 chiffres)
   ✅ ATTENDU : validation OK
```

---

### Test 4 — Étape 4 : force du mot de passe

```
1. Saisir "abc" dans le champ mot de passe
   ✅ ATTENDU :
   → 1 barre rouge allumée
   → Label "Très faible"

2. Saisir "abcdefgh" (8 car., pas de majuscule ni chiffre)
   ✅ ATTENDU : 1 barre rouge — "Très faible"

3. Saisir "Abcdefgh" (majuscule)
   ✅ ATTENDU : 2 barres orange — "Faible"

4. Saisir "Abcdefg1" (majuscule + chiffre)
   ✅ ATTENDU : 3 barres jaunes — "Correct"
   ✅ Ce niveau est le minimum accepté

5. Saisir "Abcdefg1!" (+ caractère spécial)
   ✅ ATTENDU : 4 barres vertes — "Fort"

6. Confirmer avec un mot de passe différent
   ✅ ATTENDU : "Les mots de passe ne correspondent pas"

7. Cliquer "Terminer" sans username
   ✅ ATTENDU : "Le nom d'utilisateur est obligatoire."
```

---

### Test 5 — Soumission complète et auto-login

```
Étape 1 : Pays → France
Étape 2 : Type → Restaurant
Étape 3 :
  - Nom : "Restaurant Test"
  - Adresse : "1 rue de la Paix, 75000 Paris"
  - SIRET : "12345678901234"
  - Téléphone : "01 23 45 67 89"
  - Email : "test@restaurant.fr"
Étape 4 :
  - Username : "admin"
  - Email : "admin@restaurant.fr"
  - Mot de passe : "Admin1234"
  - Confirmation : "Admin1234"

Cliquer "✅ Terminer & Lancer Co-Caisse"

✅ ATTENDU :
→ Bouton → "⏳ Configuration en cours…"
→ Appel POST /api/setup/complete
→ JWT reçu → stocké dans localStorage
→ Wizard se ferme
→ init() relancé automatiquement
→ Écran licence s'affiche (ou app directement si pas de licence)
→ Utilisateur connecté en tant qu'admin (pas besoin de ressaisir les identifiants)
```

---

### Test 6 — Vérification post-setup en base

```sql
-- Vérifier le flag
SELECT * FROM business_config WHERE config_key = 'setup_completed';
-- ✅ config_value = '1'

-- Vérifier la config pays
SELECT * FROM business_config WHERE config_key IN ('country','vat_rates','currency');
-- ✅ country = 'FR', vat_rates = '5.5,10,20', currency = 'EUR'

-- Vérifier les settings
SELECT company_name, company_address, tax_number, country FROM settings;
-- ✅ Les infos saisies dans le wizard

-- Vérifier le compte admin
SELECT username, role, active FROM users WHERE role = 'admin';
-- ✅ username = 'admin', role = 'admin', active = 1
```

---

### Test 7 — Protection anti-rejeu

```bash
# Tenter de re-soumettre le setup alors qu'il est déjà complété

curl -X POST http://localhost:5000/api/setup/complete \
  -H "Content-Type: application/json" \
  -d '{
    "country": "FR",
    "business_type": "restaurant",
    "company_name": "Attaque",
    "company_address": "1 rue Hack",
    "admin_username": "hacker",
    "admin_password": "Hacker123"
  }'

✅ ATTENDU :
HTTP 409 Conflict
{ "error": "Setup déjà complété — accès refusé." }
```

---

### Test 8 — Wizard ne réapparaît pas

```
1. Recharger http://localhost:3000 après le wizard
   ✅ ATTENDU : écran de login normal, PAS le wizard

2. Vider localStorage et recharger
   ✅ ATTENDU : toujours le login (le flag est en DB, pas dans localStorage)
```

---

## ⚠️ Points d'attention

### Le wizard bloque init()
Quand le wizard s'affiche, `init()` est interrompu par un `return`.  
C'est intentionnel — aucun autre écran (licence, login, app) ne doit être accessible.  
À la fin du wizard, `init()` est **relancé** depuis `_wizardFinish()`.

### Si le serveur est inaccessible au démarrage
Le bloc `try/catch` autour du check de setup considère le setup comme **complété** en cas d'erreur réseau.  
Cela évite de bloquer une app en production si le serveur redémarre lentement.

### Le flag est en base, pas dans localStorage
Effacer le localStorage ne redéclenche pas le wizard.  
Seul un `UPDATE business_config SET config_value='0' WHERE config_key='setup_completed'` en base le réinitialise.

### Pays "Autre"
Si l'utilisateur choisit 🌍 Autre, le code pays envoyé au serveur est **'FR'** (fallback).  
La configuration peut être ajustée manuellement ensuite dans **⚙️ Paramètres → Avancé**.

---

## 🔁 Réinitialiser le wizard (développement)

```bash
# Via API (si le serveur tourne)
curl -X POST http://localhost:5000/api/setup/status
# (consulter seulement)

# Via MariaDB directement
mysql -u root -p cocaisse -e "
  UPDATE business_config SET config_value='0' WHERE config_key='setup_completed';
  DELETE FROM users WHERE role='admin';
"

# Puis recharger l'application
# → Le wizard s'affiche à nouveau
```

