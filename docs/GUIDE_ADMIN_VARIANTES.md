# Guide Admin — Système de Variantes Co-Caisse

## 🎯 Qu'est-ce qu'une variante ?

Une **variante** est une option personnalisable que le client peut ajouter à un produit :
- **Taille** : Petite, Moyenne, Grande
- **Sauce** : Ketchup, Mayonnaise, Harissa
- **Cuisson** : Saignant, À point, Bien cuit
- **Options** : Sans gluten, Extra fromage, Sauce à part

## 🏪 Cas d'usage réels

### Restaurant classique
- Pizza : Taille (obligatoire) + Sauce (optionnel)
- Burger : Taille (obligatoire) + Cuisson (obligatoire) + Options (optionnel)
- Boisson : Taille (obligatoire)

### Pizzeria/Livrais on
- Pizza : Taille (obligatoire) + Sauce (obligatoire)
- Pâtes : Portion (obligatoire) + Sauce (obligatoire) + Extras (optionnel)

### Boulangerie
- Pain : Type (radio single) + Options (checkbox)
- Sandwich : Garnitures (checkbox multiple)

---

## 📋 Configuration — Gestion > Variantes

### Étape 1 : Créer un groupe de variantes

1. Allez dans **⚙️ Gestion > Variantes**
2. Cliquez sur **"+ Nouveau groupe"**
3. Remplissez le formulaire :

| Champ | Exemple | Description |
|-------|---------|-------------|
| **Nom du groupe** | "Taille" | Nom visible (ex: "Taille", "Sauce", "Cuisson") |
| **Type** | "Choix unique" | `Choix unique` = Radio (1 seul) / `Choix multiple` = Checkbox (plusieurs) |
| **Obligatoire** | ✓ Oui | Doit-on sélectionner au moins une option ? |

### Étape 2 : Ajouter des options au groupe

Dans le même formulaire, section "Options" :

1. Cliquez **"+ Ajouter une option"**
2. Remplissez pour chaque option :

| Champ | Exemple | Description |
|-------|---------|-------------|
| **Nom de l'option** | "Grande" | Le libellé (ex: "Petite", "Harissa", "Bien cuit") |
| **Modificateur de prix** | "+2.00" ou "-0.50" | Surcharge ou réduction sur le produit |
| **Par défaut ☐** | ✓ | Pré-sélectionnée à l'ouverture |

3. Vous pouvez **drag-and-drop** les lignes pour les réordonner
4. Cliquez **"Sauvegarder le groupe"**

### Exemple : Groupe "Taille"

```
Nom du groupe : Taille
Type : Choix unique
Obligatoire : ✓ Oui

Options :
  1. Petite        prix: 0.00€   par défaut: ☐
  2. Moyenne       prix: +2.00€  par défaut: ☐
  3. Grande        prix: +4.00€  par défaut: ☐
```

### Exemple : Groupe "Sauce"

```
Nom du groupe : Sauce
Type : Choix multiple
Obligatoire : ☐ Non

Options :
  1. Ketchup       prix: 0.00€   par défaut: ☐
  2. Mayonnaise    prix: 0.00€   par défaut: ✓ (pré-coché)
  3. Harissa       prix: +0.50€  par défaut: ☐
```

---

## 🔗 Étape 3 : Assigner les groupes à un produit

1. Allez dans **📦 Gestion > Produits**
2. Cliquez sur un produit (ex: "Pizza Margherita")
3. Allez à l'**onglet "Variantes"**

### Ajouter un groupe

1. Cliquez **"Ajouter un groupe"**
2. Sélectionnez depuis le dropdown (ex: "Taille")
3. Le groupe s'ajoute à la liste
4. Vous pouvez **drag-and-drop** pour réordonner l'affichage en caisse

### Retirer un groupe

- Cliquez le bouton **"✕ Retirer"** sur la ligne du groupe
- Le groupe reste dans la bibliothèque (peut être réutilisé)

### Aperçu

Vous voyez : _"La modal en caisse affichera 2 groupes"_

---

## 💰 Gestion des prix

### Cas 1 : Surcharge simple
```
Pizza Margherita : 12.00€
  + Taille Grande : +2.00€
  = Client paye : 14.00€
```

### Cas 2 : Surcharges cumulées
```
Pizza Margherita : 12.00€
  + Taille Grande : +2.00€
  + Harissa : +0.50€
  + Sans gluten : +1.00€
  = Client paye : 15.50€
```

### Cas 3 : Option gratuite (0.00€)
```
Burger 10.00€
  + Taille : Choix gratuit (0.00€)
  + Sauce : Choix gratuit (0.00€)
```

### Cas 4 : Remise (négatif)
```
Boisson 5.00€
  - Taille Petite : -1.00€ (promotion)
  = Client paye : 4.00€
```

---

## ⚙️ Configuration avancée

### Options dépendantes (non implémenté actuellement)
_Exemple future feature_ : "Sans gluten" disponible seulement si "Taille = Grande"

### Analytics (non implémenté actuellement)
_Exemple future feature_ : Voir quelle sauce est la plus commandée

---

## 🛒 Comportement en caisse

### 1. Caissier clique sur le produit

```
[Pizza Margherita] 12.00€
```

### 2. Modal affichée

```
╔═══════════════════════════════════════╗
║     Pizza Margherita                  ║
║     Prix de base : 12.00€             ║
╠═══════════════════════════════════════╣
║ Taille ✓ Obligatoire                  ║
║  ◉ Petite       (Inclus)              ║
║  ○ Moyenne      (+2.00€)              ║
║  ○ Grande       (+4.00€)              ║
╠═══════════════════════════════════════╣
║ Sauce   Optionnel                     ║
║  ☐ Ketchup      (Inclus)              ║
║  ☑ Mayonnaise   (Inclus)              ║
║  ☐ Harissa      (+0.50€)              ║
╠═══════════════════════════════════════╣
║ Total : 12.00€                        ║
╠═══════════════════════════════════════╣
║ [Annuler]    [Ajouter au panier]      ║
╚═══════════════════════════════════════╝
```

### 3. Caissier sélectionne

- Clique "Grande" (Taille)
- Clique "Harissa" (Sauce)
- Prix remis à jour : **12.00€ + 4.00€ + 0.50€ = 16.50€**

### 4. Clique "Ajouter au panier"

```
🛒 Panier
Pizza Margherita          16.50€
  › Taille: Grande (+4.00€)
  › Sauce: Harissa (+0.50€)
```

### 5. Paiement & Ticket

```
PIZZA MARGHERITA
  Taille:
    Grande (+4.00€)
  Sauce:
    Harissa (+0.50€)
Sous-total HT: 13.75€
TVA 20%: 2.75€
TOTAL TTC: 16.50€
```

---

## ❌ Erreurs et solutions

### ❌ Erreur : "Ce groupe est lié à des produits"

**Cause** : Vous essayez de supprimer un groupe utilisé par des produits.

**Solution** :
1. Allez dans **📦 Produits**
2. Ouvrez chaque produit lié
3. Cliquez **"Retirer"** le groupe sur chaque produit
4. Attendez la notification de succès
5. Retournez à **Variantes** et supprimez le groupe

### ❌ Bouton "Ajouter au panier" grisé

**Cause** : Un groupe obligatoire n'a aucune sélection.

**Solution** :
1. Regardez le badge rouge "Obligatoire"
2. Faites une sélection dans ce groupe
3. Le bouton se réactivera

### ❌ Un produit sans variantes affichent une modal vide

**Cause** : Le produit n'a pas de groupes assignés.

**Solution** :
1. Allez dans **📦 Produits**
2. Cliquez sur le produit
3. Onglet **"Variantes"**
4. Cliquez **"Ajouter un groupe"**
5. Sélectionnez les groupes souhaités

---

## 📊 Rapports & Analytics

### Voir les groupes disponibles
Allez à **⚙️ Gestion > Variantes** :
- Liste tous les groupes
- Nombre d'options par groupe
- Nombre de produits utilisant le groupe

### Exemple d'affichage

| Groupe | Type | Options | Produits liés |
|--------|------|---------|---------------|
| Taille | Choix unique | 3 | Pizza, Burger, Boisson |
| Sauce | Choix multiple | 4 | Pizza, Burger |
| Cuisson | Choix unique | 3 | Burger, Steak |

---

## 🔒 Permissions

| Action | Admin | Manager | Caissier | Cook |
|--------|-------|---------|----------|------|
| Créer groupe | ✅ | ✅ | ❌ | ❌ |
| Modifier groupe | ✅ | ✅ | ❌ | ❌ |
| Supprimer groupe | ✅ | ✅ | ❌ | ❌ |
| Assigner au produit | ✅ | ✅ | ❌ | ❌ |
| Sélectionner variantes en caisse | ✅ | ✅ | ✅ | ❌ |

---

## 💡 Bonnes pratiques

### ✅ À FAIRE

- ✅ Créez des groupes **réutilisables** (ex: "Taille" pour tous les produits)
- ✅ Marquez **clairement** les groupes **obligatoires**
- ✅ Pré-sélectionnez l'option la plus **courante** (par défaut)
- ✅ Rangez les options par **ordre logique** (Petite → Grande, pas Moyenne → Petite)
- ✅ Utilisez des **prix justes** (pas de surprise pour le client)

### ❌ À ÉVITER

- ❌ Ne créez pas le même groupe deux fois (ex: "Taille1" et "Taille2")
- ❌ Ne mélangez pas les concepts (ex: "Taille ET Cuisson" dans un seul groupe)
- ❌ N'oubliez pas de marquer les groupes **obligatoires** si le produit ne peut pas être commandé sans
- ❌ Ne mettez pas de prix **négatif** déroutant (ex: "-10€" ne signifie rien)

---

## 🔄 Workflow complet

### Semaine 1 : Configuration initiale

1. **Lundi** : Créer groupes "Taille" et "Sauce"
2. **Mardi** : Assigner à tous les pizzas et burgers
3. **Mercredi** : Test en caisse avec un caissier
4. **Jeudi** : Ajustements des prix
5. **Vendredi** : Déploiement en production

### Maintenance régulière

- **Chaque mois** : Vérifier l'utilisation des options (analytics future)
- **Lors d'une promo** : Modifier les prix des options concernées
- **Lors d'un nouveau produit** : Assigner les groupes appropriés

---

## 📞 Support

**Question sur les variantes ?**
- Consultez cette documentation
- Contactez l'administrateur système
- Vérifiez les logs en cas de problème

**Signaler un bug ?**
- Décrivez exactement les étapes pour reproduire
- Fournissez des screenshots
- Mentionnez le produit et le groupe concerné

---

**Document version** : 1.0
**Dernière mise à jour** : 2026-03-08
**Pour** : Co-Caisse v2.0.0+

