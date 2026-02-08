# Guide d'Administration Co-Caisse

## 👨‍💼 Gestion des Utilisateurs

### Créer un Nouvel Utilisateur

1. Aller dans **👥 Utilisateurs**
2. Cliquer sur **➕ Nouvel utilisateur**
3. Remplir le formulaire:
   - **Nom d'utilisateur**: identifiant unique
   - **Email**: adresse e-mail
   - **Mot de passe**: mot de passe sécurisé
   - **Rôle**: 
     - `Admin` - Accès complet
     - `Manager` - Gestion produits/rapports
     - `Caissier` - Encaissement uniquement
4. Cliquer sur **Enregistrer**

### Modifier un Utilisateur

1. Dans **👥 Utilisateurs**
2. Cliquer sur l'icône ✏️
3. Modifier les informations
4. Enregistrer

### Supprimer un Utilisateur

1. Dans **👥 Utilisateurs**
2. Cliquer sur l'icône 🗑️
3. Confirmer la suppression

## 🏷️ Gestion des Catégories

### Créer une Catégorie

1. Aller dans **🏷️ Catégories**
2. Cliquer sur **➕ Nouvelle catégorie**
3. Remplir:
   - **Nom**: ex "Boissons"
   - **Description**: optionnel
   - **Couleur**: sélectionner une couleur pour l'interface
   - **Image**: optionnel (pour l'affichage)
4. **Enregistrer**

### Bonnes Pratiques

- **Utilisez des couleurs distinctes** pour facile identification
- **Nommez clairement** (ex: "Petits-déjeuners", "Snacks", "Boissons chaudes")
- **Ajoutez des images** pour meilleure expérience visuelle
- **Limitez à 10-15 catégories** pour ne pas surcharger l'interface

### Exemples de Catégories

Pour un **café/boulangerie**:
- ☕ Boissons chaudes
- 🧊 Boissons froides
- 🥐 Viennoiseries
- 🥪 Sandwiches
- 🍰 Pâtisseries
- 📖 Journaux/Magazines

Pour un **commerce général**:
- 👕 Vêtements
- 👞 Chaussures
- 👜 Accessoires
- 🧴 Hygiène
- 📚 Fournitures

## 📦 Gestion des Produits

### Créer un Produit

1. Aller dans **📦 Produits**
2. Cliquer sur **➕ Nouveau produit**
3. Remplir les champs:
   - **Nom**: nom du produit
   - **Description**: optionnel
   - **Catégorie**: sélectionner la catégorie
   - **Prix**: prix TTC ou HT selon configuration
   - **Coût**: prix de revient (pour marges)
   - **TVA**: taux TVA (20% par défaut)
   - **Code-barres**: ex "5412345678901"
   - **Stock**: quantité disponible
   - **Image**: optionnel

### Champs Obligatoires
- Nom ✅
- Catégorie ✅
- Prix ✅

### Tips pour les Codes-Barres

- Utiliser les vrais codes EAN-13 si possible
- Format: `5412345678901` (13 chiffres)
- Permet la recherche rapide à la caisse
- Utile pour la gestion de stock

### Gérer les Prix

**Calcul du prix de vente** (avec TVA 20%):
```
Prix HT: 10,00 €
TVA (20%): 2,00 €
Prix TTC: 12,00 €
```

Dans l'app, entrer le **prix de vente** (TTC).

## 💰 Configuration Générale

### ⚙️ Paramètres de Base

1. Aller dans **⚙️ Paramètres**
2. Remplir les informations:

#### Informations Entreprise
- **Nom**: nom à afficher sur les tickets
- **Adresse**: adresse complète
- **Téléphone**: numéro de contact
- **Email**: adresse e-mail
- **Numéro TVA/SIRET**: identifiant fiscal

#### Configuration Fiscale
- **TVA par défaut**: 20% (modifiable par produit)
- **Devise**: EUR (€) par défaut

#### Tickets
- **En-tête**: texte à afficher au début du ticket
  - Ex: "BOULANGERIE MARTIN"
- **Pied de page**: texte de clôture
  - Ex: "Merci de votre visite !"

### Recommandations

```
En-tête recommandé:
==========================
        BOULANGERIE
          MARTIN
  12, rue de la Paix
       75000 PARIS
Tel: 01 23 45 67 89
==========================

Pied de page recommandé:
Merci de votre visite !
À bientôt ! ☕

SIREN: 123456789
TVA: FR12345678901
```

## 📊 Utilisation de la Caisse

### Encaissement Étape par Étape

1. **Cliquer sur les produits** pour les ajouter au panier
   - Cliquer plusieurs fois = augmenter quantité
   - Utiliser la recherche (🔍) pour trouver rapidement

2. **Vérifier le panier**
   - Quantités affichées
   - Prix individuels
   - Modifier quantités si besoin

3. **Appliquer une remise** (optionnel)
   - Cliquer sur 🏷️ Remise
   - Montant fixe OU pourcentage
   - Motif optionnel (pour justification)

4. **Vérifier les totaux**
   - Sous-total
   - TVA (20%)
   - Remise
   - **Total final**

5. **Sélectionner moyen de paiement**
   - 💵 **Espèces**: saisir montant reçu → automatique rendu
   - 💳 **Carte**: confirmation paiement
   - 📋 **Chèque**: numéro si nécessaire
   - 🏦 **Virement**: numéro de virement

6. **Cliquer "Encaisser"**
   - Ticket généré automatiquement
   - Option d'impression
   - Panier vidé automatiquement

### Gestion de la Monnaie (Espèces)

Exemple:
```
Total: 23,45 €
Montant reçu: 50,00 €
Reste à rendre: 26,55 €
```

L'application calcule automatiquement!

## 📈 Consulter les Rapports

### 📊 Tableau de Bord

Affiche:
- **Ventes du jour** en euros
- **Nombre de transactions**
- **TVA collectée**
- **Total des remises**
- **Dernières transactions** (5 dernières)
- **Répartition des moyens de paiement**

### 📜 Historique Complet

1. Aller dans **📜 Historique**
2. Optionnel: filtrer par dates
3. Voir tous les détails:
   - Date/heure
   - Numéro de reçu
   - Montant
   - Moyen de paiement
   - Nombre d'articles

4. Cliquer 👁️ pour revoir un ticket

### 📈 Rapports Détaillés

Dans **📈 Rapports**:

1. **Rapport des ventes** - Ventes journalières sur 7 jours
2. **Top produits** - Les 10 produits les plus vendus
3. **Répartition paiements** - Espèces vs Carte vs Chèque

## 💾 Sauvegardes & Export

### Exporter les Données

1. Aller dans **⚙️ Paramètres** (ou cliquer ⬇️ en bas)
2. Cliquer **⬇️ Exporter**
3. Choisir le dossier de destination
4. Fichier `cocaisse-export-TIMESTAMP.json` créé

**Contenu de l'export:**
- Toutes les catégories
- Tous les produits
- Tous les paramètres
- Horodatage de l'export

### Importer les Données

1. Cliquer **⬆️ Importer**
2. Sélectionner un fichier JSON précédemment exporté
3. Les données sont fusionnées (pas de suppression)

### Sauvegardes Régulières

**Recommandations:**
- ✅ Exporter chaque semaine
- ✅ Garder 4 semaines d'exports
- ✅ Stocker sur USB/Cloud
- ✅ Avant major update

## 🔐 Sécurité & Bonnes Pratiques

### Droits d'Accès

| Fonction | Admin | Manager | Caissier |
|----------|-------|---------|----------|
| Encaissement | ✅ | ❌ | ✅ |
| Produits CRUD | ✅ | ✅ | ❌ |
| Catégories CRUD | ✅ | ✅ | ❌ |
| Utilisateurs | ✅ | ❌ | ❌ |
| Rapports | ✅ | ✅ | ❌ |
| Paramètres | ✅ | ❌ | ❌ |
| Export/Import | ✅ | ❌ | ❌ |

### Recommandations Sécurité

1. **Mots de passe**
   - Minimum 8 caractères
   - Mélange de majuscules, minuscules, chiffres
   - Changer régulièrement
   - Jamais partager

2. **Utilisateurs**
   - Un compte par personne
   - Désactiver les comptes inutilisés
   - Supprimer après 6 mois d'inactivité

3. **Sauvegardes**
   - Exporter régulièrement
   - Stocker en lieu sûr (USB, Cloud)
   - Tester les imports (avant besoin réel)

4. **Accès Caisse**
   - Caissiers = droits limités
   - Managers = gestion produits
   - Admins = tout

## 🆘 Dépannage Courant

### "Produit déjà existant"
→ Vérifier le nom exact, utiliser code-barres unique

### "Catégorie non trouvée"
→ Créer la catégorie avant d'ajouter produit

### "Erreur lors de l'encaissement"
→ Vérifier que l'API tourne: consulter logs

### "Export échoue"
→ Vérifier l'espace disque, les permissions

### "Importation sans effet"
→ Vérifier format JSON valide, structure correcte

## 📞 Support

- **Bugs**: Signaler avec captures d'écran
- **Questions**: Consulter README.md
- **Améliorations**: Proposer via Issues GitHub

---

**Version**: 1.0.0  
**Dernière mise à jour**: Février 2026

