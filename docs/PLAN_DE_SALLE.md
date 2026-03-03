# 🪑 PLAN DE SALLE — Vue Visuelle Interactive

## À quoi ça sert ?

Le **Plan de salle** est une vue cartographique de votre restaurant/établissement.  
Il remplace la liste textuelle des commandes par une représentation **visuelle en temps réel** de l'état de chaque table.

| Sans plan de salle | Avec plan de salle |
|---|---|
| Liste de commandes sans contexte spatial | Vision instantanée de toute la salle |
| Le serveur doit mémoriser quelle table a commandé quoi | Couleur = statut → lecture en 1 coup d'œil |
| Aucune info sur les tables libres/occupées | Tables libres en vert, cuisine en rouge |
| Créer une commande = saisir manuellement le numéro de table | Clic sur table libre → commande pré-remplie |

---

## 📐 Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        PLAN DE SALLE SYSTEM                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  BASE DE DONNÉES                                                           │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │  floor_plans (singleton)                                         │      │
│  │  ┌──────────────┬──────────┬───────┬────────────────────────┐  │      │
│  │  │ id           │ name     │ width │ height  background_color│  │      │
│  │  │ default-...  │ Salle    │ 1100  │ 650     #f3f4f6        │  │      │
│  │  └──────────────┴──────────┴───────┴────────────────────────┘  │      │
│  │                                                                   │      │
│  │  tables (tables physiques)                                        │      │
│  │  ┌────┬───────┬──────┬───┬───┬───┬───┬──────────┬────────┐      │      │
│  │  │ id │ label │shape │ x │ y │ w │ h │ capacity │ active │      │      │
│  │  │ ..  │  T1   │rect  │50 │50 │90 │70 │    4     │   1   │      │      │
│  │  │ ..  │  T2   │circle│200│50 │80 │80 │    2     │   1   │      │      │
│  │  └────┴───────┴──────┴───┴───┴───┴───┴──────────┴────────┘      │      │
│  │                                                                   │      │
│  │  orders (commandes — lien via table_number = tables.label)        │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                            │
│  SERVEUR : server/src/routes/tables.js                                    │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │  GET  /api/tables/layout   → plan + tables (positions)          │      │
│  │  POST /api/tables/layout   → dimensions du plan (admin)         │      │
│  │  GET  /api/tables/status   → statuts temps réel (orders JOIN)   │      │
│  │  POST /api/tables          → créer table (admin)                │      │
│  │  PUT  /api/tables/:id      → modifier position/label (admin)    │      │
│  │  DELETE /api/tables/:id    → soft delete (admin)                │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                            │
│  CLIENT : client/src/renderer/                                            │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │  index.html  → <section id="floorplan-section">                 │      │
│  │               → <div id="floorPlanCanvas"> (canvas relatif)     │      │
│  │               → <div id="floorTableDetail"> (panneau latéral)   │      │
│  │               → <div id="tableFormModal"> (créer/modifier)      │      │
│  │  app.js      → loadFloorPlan(), _renderFloorPlan()              │      │
│  │               → handleTableClick(), toggleFloorPlanEditMode()   │      │
│  │               → startFloorPlanPolling() (15 secondes)           │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Workflow complet

### 1. Chargement de la section

```
Admin / Caissier clique sur onglet 🪑 Salle
        │
        ▼
showSection('floorplan')
        │
        ├── stopFloorPlanPolling()  (si déjà en cours)
        │
        ▼
loadFloorPlan()
        │
        ├─► GET /api/tables/layout ──────────────────────────────────────►
        │       Retourne :                                                  │
        │       { floor_plan: { width, height, bg },                       │
        │         tables: [ { id, label, shape, x, y, w, h, capacity } ] } │
        │                                                                   │
        ├─► GET /api/tables/status ──────────────────────────────────────►
        │       Retourne :                                                  │
        │       [ { id, label, computed_status, order_id,                  │
        │           order_number, elapsed_minutes, order_total } ]          │
        │                                                                   │
        ├── Fusion layout + statuts → this.floorPlanTables[]              │
        │                                                                   │
        ▼
_renderFloorPlan()
        │
        ├── Dimensionne #floorPlanCanvas (width×height)
        ├── Pour chaque table → _createTableEl(table)
        │       → <div class="floor-table" style="left:X;top:Y">
        │         couleur selon computed_status
        │         badge : label + capacité + temps écoulé
        │
        └── startFloorPlanPolling() → setInterval 15s → _refreshTableStatuses()
```

### 2. Statut calculé des tables

```
GET /api/tables/status — pour chaque table physique :
        │
        ▼
SELECT * FROM orders
  WHERE table_number = tables.label
    AND status NOT IN ('paid', 'cancelled')
  ORDER BY created_at DESC LIMIT 1
        │
        ├── Aucune commande active → computed_status = 'free'     🟢
        ├── status = 'draft'       → computed_status = 'draft'    🟡
        ├── status = 'validated'   → computed_status = 'draft'    🟡
        ├── status = 'in_kitchen'  → computed_status = 'in_kitchen' 🔴
        ├── status = 'ready'       → computed_status = 'ready'    🟠
        └── status = 'served'      → computed_status = 'served'   🔵
```

### 3. Clic sur une table (mode opérationnel)

```
Clic sur une table
        │
        ▼
handleTableClick(tableId)
        │
        ├─── computed_status = 'free' ─────────────────────────────────►
        │                                                                │
        │    Panneau latéral affiche :                                   │
        │    🟢 Table libre — Capacité : X pers.                        │
        │    [+ Nouvelle commande]                                       │
        │           │                                                    │
        │           ▼                                                    │
        │    openNewOrderForTable(label)                                 │
        │           │                                                    │
        │           └── showSection('orders')                           │
        │               + pré-remplit #orderTableNumber = label         │
        │                                                                │
        └─── computed_status ≠ 'free' ─────────────────────────────────►
                                                                        │
             Panneau latéral affiche :                                  │
             Commande N°, statut, durée, total                          │
             [📋 Ouvrir la commande]                                    │
             [✏️ Modifier la table]  (admin seulement)                  │
```

### 4. Mode édition (admin)

```
Admin active le toggle "Mode édition"
        │
        ▼
toggleFloorPlanEditMode()
        │
        ├── this.floorPlanEditMode = true
        ├── _renderFloorPlan()  ← re-render avec drag listeners
        │
        └── Pour chaque table → _attachDragListeners(el, tableId)
                │
                ├── pointerdown → setPointerCapture → stocker offset souris
                ├── pointermove → calculer new X/Y (clampé aux bords)
                │                → style.left / style.top en temps réel
                └── pointerup   → PUT /api/tables/:id { x, y }
                                  (persistance automatique)

Admin clique "+ Table"
        │
        ▼
openTableForm()  → modal avec label, forme, capacité
        │
        ▼
saveTable()  →  POST /api/tables { label, shape, x_centre, y_centre, capacity }
        │
        ▼
loadFloorPlan()  ← recharge et affiche la nouvelle table
```

### 5. Polling temps réel

```
Toutes les 15 secondes :
        │
        ▼
_refreshTableStatuses()
        │
        ├── GET /api/tables/status
        │
        └── Pour chaque table :
            ├── statut inchangé → mise à jour du timer (elapsed_minutes)
            └── statut changé   → _createTableEl() + replaceWith()
                                  (DOM diff minimal, pas de re-render total)

Quitter la section 🪑 Salle → stopFloorPlanPolling()
(le polling NE tourne PAS quand la section n'est pas visible)
```

---

## 🎨 Code couleur des tables

| Couleur | `computed_status` | Signification |
|---|---|---|
| 🟢 **Vert** | `free` | Table libre, prête à accueillir |
| 🟡 **Jaune** | `draft` / `validated` | Commande prise, en attente |
| 🔴 **Rouge** | `in_kitchen` | En cours de préparation |
| 🟠 **Orange** | `ready` | Plats prêts, à servir |
| 🔵 **Bleu** | `served` | Servi, en attente du paiement |

---

## 🔗 Lien Table ↔ Commande

> Le champ `orders.table_number` (VARCHAR libre) est comparé à `tables.label`.  
> **Convention obligatoire** : le label saisi dans le wizard de table doit correspondre  
> exactement à ce que le serveur saisit dans `table_number` lors de la création d'une commande.

```
tables.label = "T1"
    ↕ (matching par valeur)
orders.table_number = "T1"
```

---

## 🗂️ Fichiers concernés

```
co-caisse/
├── server/
│   └── src/
│       ├── index.js                          ← /api/tables monté (auth requis)
│       ├── routes/
│       │   └── tables.js                     ← 6 endpoints (CRÉÉ)
│       └── database/
│           ├── index.js                      ← CREATE TABLE floor_plans + tables
│           └── migrations/
│               └── 009_floor_plan.sql        ← Migration SQL (CRÉÉ)
│
└── client/
    └── src/renderer/
        ├── index.html                        ← Nav 🪑 + section + modal formulaire
        └── app.js                            ← 14 méthodes floorPlan*
```

---

## 🧪 Comment tester dans l'application

### Pré-requis
- Serveur démarré : `cd server && npm run dev`
- Client démarré : `cd client && npm start`
- Connecté en tant qu'**admin**
- Quelques commandes créées avec `table_number` renseigné

---

### Test 1 — Accéder au plan de salle

```
1. Cliquer sur l'onglet 🪑 Salle dans la navigation
   ✅ ATTENDU :
   → Section plan de salle affichée
   → Canvas gris avec message "Aucune table configurée" si vide
   → Barre d'outils avec toggle "Mode édition" (admin)
   → Légende des couleurs en haut à droite
```

---

### Test 2 — Créer des tables

```
1. Activer le toggle "Mode édition"
2. Cliquer sur "+ Table"
   ✅ ATTENDU : modal s'ouvre

3. Remplir :
   - Label : "T1"
   - Forme : Rectangulaire
   - Capacité : 4
   Cliquer "💾 Enregistrer"
   ✅ ATTENDU :
   → Table T1 apparaît au centre du canvas (vert = libre)
   → Toast "Table T1 créée"

4. Créer d'autres tables :
   - "T2" ronde, 2 pers.
   - "T3" rectangulaire, 6 pers.
   - "Bar" ronde, 4 pers.
   ✅ ATTENDU : 4 tables vertes sur le canvas
```

---

### Test 3 — Repositionner les tables par drag-and-drop

```
1. S'assurer que le mode édition est actif
2. Cliquer-glisser la table "T1" vers un autre endroit du canvas
   ✅ ATTENDU :
   → La table suit le curseur en temps réel
   → Elle reste dans les bords (ne sort pas du canvas)
   → Au relâché : position sauvegardée automatiquement
                  (PUT /api/tables/:id visible dans l'onglet Réseau)

3. Désactiver le mode édition, recharger la page
   ✅ ATTENDU :
   → Les tables sont toujours aux positions définies
   → (vérification persistance)

4. Vérification en base :
   SELECT label, x, y FROM tables;
   ✅ Les coordonnées reflètent les positions sur le canvas
```

---

### Test 4 — Statuts en temps réel

```
Pré-requis : table "T1" existe dans floor_plans

1. Créer une commande via Commandes → table_number = "T1"
   (laisser en statut "draft")

2. Revenir sur 🪑 Salle
   ✅ ATTENDU :
   → T1 s'affiche en 🟡 JAUNE
   → Badge avec numéro de commande (4 derniers caractères)
   → Temps écoulé affiché (ex: "2min")

3. Passer la commande en "in_kitchen" depuis Cuisine
   ✅ ATTENDU dans les 15 secondes :
   → T1 passe en 🔴 ROUGE (polling automatique)

4. Passer la commande en "ready"
   ✅ ATTENDU :
   → T1 passe en 🟠 ORANGE

5. Payer la commande
   ✅ ATTENDU :
   → T1 repasse en 🟢 VERT (plus de commande active)
```

---

### Test 5 — Clic sur une table occupée

```
1. Avec la table T1 en jaune (commande active)
2. Désactiver le mode édition
3. Cliquer sur T1
   ✅ ATTENDU :
   → Panneau latéral s'ouvre à droite
   → Affiche : N° commande, statut, durée, total
   → Bouton "📋 Ouvrir la commande"

4. Cliquer "📋 Ouvrir la commande"
   ✅ ATTENDU :
   → Navigation vers la section Commandes
   → La commande de T1 est visible
```

---

### Test 6 — Clic sur une table libre

```
1. Cliquer sur T2 (verte = libre)
   ✅ ATTENDU :
   → Panneau latéral : "🟢 Table libre — Capacité : 2 pers."
   → Bouton "+ Nouvelle commande"

2. Cliquer "+ Nouvelle commande"
   ✅ ATTENDU :
   → Navigation vers la section Commandes
   → Le champ "Numéro de table" est pré-rempli avec "T2"
```

---

### Test 7 — Modifier/supprimer une table

```
Modifier :
1. Mode édition activé
2. Cliquer sur une table → panneau latéral → "✏️ Modifier la table"
   OU cliquer directement sur app.openTableForm('id')
   ✅ ATTENDU : modal pré-rempli avec les valeurs actuelles

3. Changer la capacité de T3 : 6 → 8
   Cliquer "💾 Enregistrer"
   ✅ ATTENDU : badge de capacité mis à jour sur le canvas

---
Supprimer :
4. app.deleteTable('id') (via console JS ou bouton futur)
   ✅ ATTENDU :
   → Confirmation demandée
   → Si table avec commande active : erreur 409 "commande active"
   → Sinon : table disparaît du canvas (soft delete — active=0)
```

---

### Test 8 — API directe (curl / Postman)

```bash
# Obtenir le token admin
TOKEN=$(curl -s -X POST http://localhost:5000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# GET layout
curl http://localhost:5000/api/tables/layout \
  -H "Authorization: Bearer $TOKEN"

# GET statuts temps réel
curl http://localhost:5000/api/tables/status \
  -H "Authorization: Bearer $TOKEN"

# POST créer une table
curl -X POST http://localhost:5000/api/tables \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Terrasse 1","shape":"circle","x":500,"y":400,"capacity":4}'

# PUT déplacer une table
curl -X PUT http://localhost:5000/api/tables/<ID> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"x":300,"y":200}'

# DELETE supprimer une table (soft delete)
curl -X DELETE http://localhost:5000/api/tables/<ID> \
  -H "Authorization: Bearer $TOKEN"
```

---

## ⚠️ Points d'attention

### Lien `table_number` ↔ `tables.label`
Le statut d'une table est calculé par **comparaison de texte**.  
Si un serveur crée une commande avec `table_number = "table 1"` mais que la table du plan s'appelle `"T1"`, il n'y aura **aucun lien** — la table restera verte même si occupée.

> **Convention recommandée** : utiliser le même format court partout (`T1`, `T2`, `Bar`, `Terrasse`).

### Soft delete
La suppression d'une table ne la supprime pas de la base — elle passe à `active = 0`.  
Les historiques de commandes restent intacts.

### Polling et performance
- Le polling tourne **uniquement** quand la section 🪑 Salle est visible
- À chaque changement de section, `stopFloorPlanPolling()` est appelé automatiquement
- Le poll ne recharge pas le layout (positions) — seulement les statuts

### Drag-and-drop sur tablette
Le drag-and-drop utilise les **Pointer Events** (pas Mouse Events), donc il fonctionne sur écran tactile. Chaque table capture le pointeur (`setPointerCapture`) pour éviter les glissements parasites.

