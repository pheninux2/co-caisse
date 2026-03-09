# 🎯 WORKFLOW — "Nouvelle commande" depuis Plan de Salle

## Comportement complet du système

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION CO-CAISSE                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 1 : Navigation ──────────────────────────────────────────────────┐
│                                                                          │
│  Admin/Caissier clique sur onglet 🪑 Salle                             │
│         │                                                               │
│         ▼                                                               │
│  showSection('floorplan')                                               │
│         │                                                               │
│         ├─► loadFloorPlan()                                             │
│         │   ├─ GET /api/tables/layout                                   │
│         │   └─ GET /api/tables/status                                   │
│         │                                                               │
│         └─► _renderFloorPlan()                                          │
│             └─ Affiche toutes les tables sur le canvas                  │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 2 : Clic sur une table libre ──────────────────────────────────┐
│                                                                        │
│  Admin clique sur table (couleur 🟢 vert = libre)                     │
│         │                                                             │
│         ▼                                                             │
│  handleTableClick(tableId)                                             │
│         │                                                             │
│         ├─► Récupère infos table (label, capacity, etc.)              │
│         │                                                             │
│         ├─► Détecte : computed_status === 'free'                       │
│         │                                                             │
│         └─► Affiche le PANEL LATÉRAL avec :                            │
│             ┌──────────────────────────────┐                          │
│             │ 🪑 Table X — Y pers.        │                          │
│             ├──────────────────────────────┤                          │
│             │ 🟢 Table libre               │                          │
│             │ Capacité : Y personnes       │                          │
│             │                              │                          │
│             │ [+ Nouvelle commande]   ◄────┼─ NOUVEAU BOUTON          │
│             │                              │                          │
│             │ [✏️ Modifier la table]       │                          │
│             │ [🗑️ Supprimer la table]     │                          │
│             └──────────────────────────────┘                          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 3 : Clic sur "+ Nouvelle commande" ────────────────────────────┐
│                                                                        │
│  Admin clique sur "+ Nouvelle commande"                                │
│         │                                                             │
│         ▼                                                             │
│  openCashierForNewOrder()  ◄─── NOUVELLE FONCTION (v2.0.0)            │
│         │                                                             │
│         ├─► closeFloorTableDetail()                                    │
│         │   └─ Ferme le panel latéral                                 │
│         │                                                             │
│         └─► showSection('pos')                                         │
│             └─ Affiche l'onglet 🛒 CAISSE                            │
│                                                                        │
│  RÉSULTAT ATTENDU :                                                    │
│  ✅ Onglet caisse ouvert                                              │
│  ✅ Panier VIDE                                                       │
│  ✅ Select "Table" VIDE (aucune table pré-sélectionnée)              │
│  ✅ Aucun badge "Table X" sur le panier                               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 4 : Création de la commande en caisse ──────────────────────────┐
│                                                                        │
│  Admin à la caisse                                                     │
│         │                                                             │
│         ├─► Ajoute des articles au panier                             │
│         │   (sélection table optionnelle)                             │
│         │                                                             │
│         ├─► Valide la commande                                        │
│         │   POST /api/orders { items, table_id?, ... }                │
│         │                                                             │
│         └─► Traitement normal de paiement/impression                  │
│             (identique à avant)                                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ CAS ALTERNATIF : Table occupée ──────────────────────────────────────┐
│                                                                        │
│  Admin clique sur table (couleur 🔴 rouge/jaune = occupée)           │
│         │                                                             │
│         ▼                                                             │
│  handleTableClick(tableId)                                             │
│         │                                                             │
│         ├─► Détecte : computed_status ≠ 'free'                        │
│         │                                                             │
│         └─► Affiche le PANEL LATÉRAL avec :                            │
│             ┌────────────────────────────────────┐                   │
│             │ 🪑 Table X — Y pers.             │                   │
│             ├────────────────────────────────────┤                   │
│             │ 🔴 En cuisine (depuis 12:34)      │                   │
│             │ 👤 Serveur : Marie                │                   │
│             │ ⏱ Durée : 45 min                  │                   │
│             │ 🍽 Articles : 3                    │                   │
│             │ 💶 Total : 42,50 €                │                   │
│             │ 📋 N° Commande : #00234           │                   │
│             │                                    │                   │
│             │ [📋 Ouvrir la commande]            │                   │
│             │ [✏️ Modifier la table]             │                   │
│             │ [🗑️ Supprimer la table]           │                   │
│             └────────────────────────────────────┘                   │
│                                                                        │
│  ✅ Pas de bouton "+ Nouvelle commande"                              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

┌─ DIFFÉRENCE CLEF : Avant vs Après ────────────────────────────────────┐
│                                                                        │
│  AVANT (v1.9.9) :                                                      │
│  └─ openNewOrderForTable('Table 5')                                    │
│     └─ this._setPosTable('Table 5')                                    │
│        └─ pré-sélectionne la table dans le select                     │
│        └─ affiche le badge "Table 5" sur le panier                    │
│                                                                        │
│  APRÈS (v2.0.0) :                                                      │
│  └─ openCashierForNewOrder()                                           │
│     └─ showSection('pos')                                              │
│        └─ AUCUNE pré-sélection                                        │
│        └─ Panier complètement vide                                    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Comparaison visuelle

### AVANT (v1.9.9)
```
Plan de salle → Clic table → "+ Nouvelle commande"
  ↓
Caisse s'ouvre
  ↓
Badge "Table 5" ← PRÉ-SÉLECTIONNÉ
Select table = "Table 5" ← PRÉ-REMPLI
Panier préconfiguré
```

### APRÈS (v2.0.0) ✨
```
Plan de salle → Clic table → "+ Nouvelle commande"
  ↓
Caisse s'ouvre
  ↓
Aucun badge
Select table = vide
Panier complètement libre
  ↓
Admin choisit la table (ou pas) en caisse
```

---

## 📊 État des éléments UI

| Élément | Avant | Après | Changement |
|---------|-------|-------|-----------|
| Onglet caisse | ✅ Ouvert | ✅ Ouvert | Aucun |
| Badge "Table" | ✅ Visible | ❌ Caché | NOUVEAU |
| Select table | ✅ Pré-rempli | ❌ Vide | NOUVEAU |
| Panier | ✅ Vide | ✅ Vide | Aucun |
| Toast message | ❌ Non | ❌ Non | Aucun |

---

## ⚙️ Détails implémentation

### Fonction OLD (encore disponible)
```javascript
openNewOrderForTable(tableLabel) {
  this.closeFloorTableDetail();
  this._setPosTable(tableLabel);  // ← Pré-sélection
  this.showSection('pos');
  this.toastInfo(`🪑 Table ${tableLabel} sélectionnée…`);
}
```

### Fonction NEW (utilisée maintenant)
```javascript
openCashierForNewOrder() {
  this.closeFloorTableDetail();
  // Pas d'appel à this._setPosTable() ← Clé du changement
  this.showSection('pos');
  // Pas de toast
}
```

---

## ✨ Avantages du nouveau comportement

1. **Flexibilité** : Admin peut choisir la table EN CAISSE, pas forcément celle du plan
2. **Réutilisabilité** : Utilise le flux normal de création de commande
3. **Simplicité** : Moins de pré-remplissage, moins de confusion
4. **Cohérence** : Identique au bouton "+ Nouvelle commande" du menu principal

---

**Version** : v2.0.0  
**Date** : 2026-03-08

