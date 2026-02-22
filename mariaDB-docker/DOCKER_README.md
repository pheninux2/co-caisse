# Co-Caisse — MariaDB Docker

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et démarré
- Windows : Docker Desktop avec WSL2 recommandé

---

## Installation rapide

### 1. Prépare le fichier .env à la racine du projet

```bash
cp .env.docker.example .env
```

Édite `.env` et remplis les mots de passe :

```env
DB_ROOT_PASSWORD=un_mot_de_passe_root_fort
DB_USER=cocaisse
DB_PASS=un_mot_de_passe_fort
DB_NAME=cocaisse
DB_PORT=3306
```

### 2. Démarre MariaDB

```bash
# Linux / macOS
chmod +x docker-db.sh
./docker-db.sh start

# Windows (PowerShell)
docker compose --env-file .env up -d mariadb
```

### 3. Lance le seed (première fois uniquement)

```bash
cd server
npm install
node src/database/seed.js
```

### 4. Démarre le serveur Express

```bash
npm run dev
```

---

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `./docker-db.sh start` | Démarre MariaDB |
| `./docker-db.sh stop` | Arrête MariaDB (données conservées) |
| `./docker-db.sh logs` | Logs en temps réel |
| `./docker-db.sh adminer` | Interface web sur http://localhost:8080 |
| `./docker-db.sh shell` | Shell MySQL interactif |
| `./docker-db.sh backup` | Crée un dump SQL horodaté |
| `./docker-db.sh reset` | ⚠️ Supprime toutes les données |

---

## Connexion depuis l'extérieur (autre PC sur le réseau local)

MariaDB écoute sur le port **3306** de la machine hôte.  
Depuis un autre PC, utilise l'IP de la machine serveur :

```env
# server/.env sur les postes clients
DB_HOST=192.168.1.10   ← remplace par l'IP réelle du serveur
DB_PORT=3306
```

---

## Structure des fichiers Docker

```
co-caisse/
├── docker-compose.yml          ← configuration Docker
├── .env                        ← variables (non commité)
├── .env.docker.example         ← template à copier
└── docker-db.sh                ← script de gestion
```

---

## Déploiement en production (restaurant/magasin)

1. Installe Docker Desktop sur le **PC serveur**
2. Copie le projet sur ce PC
3. Configure `.env` avec des mots de passe forts
4. Lance `./docker-db.sh start`
5. Configure `server/.env` sur chaque poste client avec `DB_HOST=<IP_serveur>`

> 💡 Pour que MariaDB démarre automatiquement avec Windows, active le démarrage automatique de Docker Desktop dans ses paramètres.
