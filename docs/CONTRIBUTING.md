# Guide de Contribution - Co-Caisse

Merci de votre intérêt pour contribuer à Co-Caisse! 🎉

## Code de Conduite

Tous les contributeurs doivent respecter notre code de conduite.

## Comment Contribuer

### Signaler un Bug 🐛

1. **Vérifier qu'il n'existe pas déjà**
   - Consulter les [Issues GitHub](../../issues)
   - Utiliser la barre de recherche

2. **Créer une nouvelle issue** avec:
   - **Titre clair** et descriptif
   - **Description détaillée** du problème
   - **Étapes pour reproduire**
   - **Comportement attendu vs réel**
   - **Screenshots/Logs** si pertinent
   - **Environnement** (OS, Node.js v, navigateur)

**Template:**
```
**Décrire le bug**
Une description claire et concise...

**Étapes pour reproduire**
1. Aller à ...
2. Cliquer sur ...
3. Voir le problème

**Comportement attendu**
...

**Capture d'écran**
Ajouter si applicable

**Environnement**
- OS: [ex: Windows 11]
- Node: [ex: 18.14.0]
- Navigateur: [ex: Chrome 110]
```

### Proposer une Amélioration ✨

1. **Vérifier qu'elle n'existe pas**
2. **Créer une issue** avec le label `enhancement`
3. **Décrire:**
   - Le problème actuel
   - Votre solution proposée
   - Alternatives possibles
   - Contexte supplémentaire

### Soumettre un Pull Request 🚀

1. **Forker le repository**
   ```bash
   git clone https://github.com/votre-username/co-caisse.git
   cd co-caisse
   ```

2. **Créer une branche**
   ```bash
   git checkout -b feature/nom-fonctionnalite
   # ou
   git checkout -b fix/description-du-bug
   ```

3. **Développer votre changement**
   - Respecter le style de code existant
   - Ajouter des commentaires si nécessaire
   - Tester localement

4. **Commit avec messages clairs**
   ```bash
   git commit -m "feat: ajouter nouvelle fonctionnalité"
   git commit -m "fix: corriger bug de panier"
   git commit -m "docs: améliorer documentation"
   git commit -m "style: formatter code"
   git commit -m "refactor: restructurer module X"
   ```

5. **Push et créer Pull Request**
   ```bash
   git push origin feature/nom-fonctionnalite
   ```

6. **Remplir la description du PR:**
   ```markdown
   ## Description
   Description brève des changements

   ## Type de changement
   - [ ] Bug fix
   - [ ] Nouvelle fonctionnalité
   - [ ] Breaking change
   - [ ] Documentation

   ## Comment a-t-on testé cela?
   Décrire les tests effectués...

   ## Checklist
   - [ ] J'ai suivi le style de code du projet
   - [ ] J'ai testé les changements
   - [ ] J'ai mis à jour la documentation
   - [ ] Pas de nouveaux warnings
   ```

## Style de Code

### JavaScript/Node.js

```javascript
// ✅ BON
async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products`);
    const products = await response.json();
    return products;
  } catch (error) {
    console.error('Error loading products:', error);
    throw error;
  }
}

// ❌ MAUVAIS
async function getProducts(){
const url = API_URL + "/products"
let resp = await fetch(url)
let d = await resp.json()
return d
}
```

### Conventions

- **Variables**: `camelCase`
- **Classes**: `PascalCase`
- **Constantes**: `UPPER_SNAKE_CASE`
- **Fichiers**: `kebab-case.js` ou `PascalCase.js` pour classes
- **Fonctions**: `camelCase` ou `UPPER_CASE` pour constantes

### Règles Générales

```javascript
// ✅ Toujours utiliser const par défaut
const name = 'Co-Caisse';

// ✅ Destructuring
const { id, name, price } = product;

// ✅ Template literals
const message = `Produit ${name} à ${price}€`;

// ✅ Arrow functions pour callbacks
items.map(item => item.price);

// ✅ Async/await plutôt que .then()
const data = await fetch(url).then(r => r.json());

// ❌ var (jamais)
var name = 'Co-Caisse';

// ❌ Concaténation
const message = 'Produit ' + name + ' à ' + price + '€';

// ❌ Callbacks imbriqués
fetch(url).then(r => r.json()).then(d => { ... });
```

## HTML/Tailwind CSS

```html
<!-- ✅ BON -->
<button onclick="app.addProduct()" 
        class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition">
  ➕ Ajouter
</button>

<!-- ❌ MAUVAIS -->
<button onclick="addProduct()" style="background-color: blue; color: white;">
  Add
</button>
```

## Commits

**Format recommandé:**

```
<type>: <sujet court>

<description détaillée si nécessaire>

Fixes #<numéro issue>
```

**Types:**
- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Changement documentation
- `style`: Formatage (pas de logique)
- `refactor`: Refactoring (pas de feature)
- `perf`: Amélioration performance
- `test`: Tests
- `chore`: Maintenance

**Exemples:**
```
feat: ajouter support des codes-barres
fix: corriger calcul TVA dans panier
docs: améliorer guide administration
refactor: simplifier gestion du panier
```

## Tests

Avant de soumettre un PR:

1. **Tester localement**
   ```bash
   npm run test
   npm run lint
   ```

2. **Tester dans différents navigateurs** (si changement UI)

3. **Tester sur desktop** (Electron)

4. **Tester l'export/import** (si changement données)

## Documentation

Pour toute nouvelle fonctionnalité:

1. Mettre à jour le **README.md**
2. Ajouter exemple dans **API_DOCS.md**
3. Ajouter guide dans **ADMIN_GUIDE.md** si admin feature
4. Documenter le code (commentaires JSDoc)

**Template JSDoc:**

```javascript
/**
 * Charge les produits depuis l'API
 * @async
 * @returns {Promise<Array>} Liste des produits
 * @throws {Error} Si l'API n'est pas accessible
 */
async function loadProducts() {
  // ...
}
```

## Processus de Review

1. ✅ Code review par maintainers
2. ✅ Tests automatisés (GitHub Actions)
3. ✅ Vérification du style
4. ✅ Approbation finale
5. ✅ Merge et déploiement

## Labels Issues

- 🐛 `bug` - Bugs à corriger
- ✨ `enhancement` - Améliorations proposées
- 📚 `documentation` - Documentation
- 🎯 `good first issue` - Bon pour débuter
- 🆘 `help wanted` - Besoin d'aide
- 🚀 `high priority` - Haute priorité
- ❓ `question` - Questions

## Questions?

- 💬 GitHub Discussions
- 📧 Email: contact@cocaisse.fr
- 🐛 Ouvrir une issue

## Licence

En contribuant, vous acceptez que vos changements soient sous licence MIT.

---

**Merci de votre contribution! 🙏**

Ensemble, nous rendons Co-Caisse meilleur!

