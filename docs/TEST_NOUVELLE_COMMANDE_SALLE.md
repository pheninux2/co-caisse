# 🪑 TEST — Bouton "Nouvelle commande" depuis le Plan de salle

## 📋 Résumé du changement

Le bouton **"+ Nouvelle commande"** dans le panel latéral du plan de salle (quand vous cliquez sur une table libre) redirige maintenant **UNIQUEMENT** vers l'onglet caisse, **SANS pré-sélectionner la table**.

Comportement **avant** :
- Clic sur table libre → panel latéral
- Clic sur "+ Nouvelle commande"
- → Va à la caisse + **pré-remplit la table** dans le select

Comportement **après** (nouveau) :
- Clic sur table libre → panel latéral
- Clic sur "+ Nouvelle commande"
- → Va à la caisse + **aucune table pré-sélectionnée**
- Vous choisissez la table ou l'article directement

---

## ✅ Comment tester ?

### Prérequis :
- Application client rebuildée (`npm run build-renderer` ✅ fait)
- Server en cours d'exécution
- Au moins 1 table créée dans le plan de salle
- Connecté en admin

### Étapes du test :

**1. Allez à l'onglet 🪑 Salle**
```
Navigation → Cliquez sur "Salle"
```

**2. Vérifiez qu'une table libre existe**
- Elle doit être affichée en vert (🟢)
- Sinon, créez-en une via le bouton "+ Table" en mode édition

**3. Cliquez sur une table libre**
```
Le panel latéral apparaît avec :
  - 🟢 Table libre
  - Capacité : X personnes
  - Bouton "+ Nouvelle commande"
```

**4. Cliquez sur "+ Nouvelle commande"**
```
Résultat attendu :
  ✅ Vous êtes redirigé(e) à l'onglet 🛒 Caisse
  ✅ Le panier est VIDE (aucune table pré-sélectionnée)
  ✅ Le select "Table / Référence" est VIDE (pas de table pré-remplie)
  ✅ Aucun badge de table n'apparaît sur le panier
```

**5. Vérifiez que vous pouvez créer une commande normalement**
```
- Ajoutez des articles au panier
- Sélectionnez une table (optionnel)
- Validez et payez normalement
```

---

## 🔍 Cas de test supplémentaires

### Test 1 : Vérifier l'ancienne fonction pour table occupée
**Contexte** : La fonction `openNewOrderForTable(tableLabel)` existe toujours mais n'est plus utilisée

- Créez une commande (table occupée)
- Cliquez sur la table occupée → le panel affiche "Ouvrir la commande"
- Attendu : Le bouton "Ouvrir la commande" ouvre l'onglet Commandes (inchangé)

### Test 2 : Fermer et rouvrir le plan de salle
**Contexte** : Vérifier que le changement persiste

- Onglet Salle → Cliquez sur une table
- Cliquez "+ Nouvelle commande"
- Allez à l'onglet Commandes ou autre
- Retournez à l'onglet Salle
- Comportement attendu : Identique (pas de régression)

### Test 3 : Vérifier le panier précédent
**Contexte** : Si vous aviez un panier en attente, il ne doit pas être affecté

- Créez un article 1, mettez le panier en attente
- Onglet Salle → "+ Nouvelle commande"
- Le nouveau panier est vide
- Clic sur "Paniers en attente" → vous retrouvez le premier panier

---

## 🛠️ Détails techniques

### Fichiers modifiés :
```
client/src/renderer/app.js
  - Ligne ~2426 : onclick="app.openCashierForNewOrder()"
    (au lieu de onclick="app.openNewOrderForTable('${table.label}')")
  
  - Ligne ~2503 : Nouvelle fonction openCashierForNewOrder()
    (redirection simple sans pré-sélection de table)
```

### Fonctions :
- **`openCashierForNewOrder()`** (nouveau)
  - Ferme le panel de détail table
  - Affiche l'onglet caisse
  - Pas de pré-sélection de table

- **`openNewOrderForTable(tableLabel)`** (inchangée)
  - Utilisée par l'API interne
  - Toujours disponible si besoin futur

---

## 📊 Résumé du test

| Aspect | Résultat |
|--------|----------|
| Compilation | ✅ OK |
| Bouton visible | ✅ OK |
| Redirection vers caisse | À tester ✓ |
| Aucune table pré-sélectionnée | À tester ✓ |
| Panier vide | À tester ✓ |
| Select table vide | À tester ✓ |

---

## 📝 Notes

- Le toast (message d'info) a été enlevé pour un comportement plus "silencieux"
- Aucune modification backend requise
- Le changement est compatible avec tous les navigateurs
- Aucun risque de régression sur d'autres fonctionnalités

---

**Date du test** : 2026-03-08  
**Version** : v2.0.0

