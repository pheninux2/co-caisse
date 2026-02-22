#!/bin/bash
# ====================================================
# Co-Caisse — Script de gestion Docker MariaDB
# Usage: ./docker-db.sh [commande]
# ====================================================

set -e

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
CONTAINER="co-caisse-db"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

check_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Fichier .env introuvable à la racine.${NC}"
    echo -e "${YELLOW}👉 Copie .env.docker.example en .env et remplis les valeurs.${NC}"
    exit 1
  fi
}

case "$1" in
  start)
    echo -e "${GREEN}🚀 Démarrage de MariaDB...${NC}"
    check_env
    docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d mariadb
    echo -e "${GREEN}✅ MariaDB démarré. En attente de disponibilité...${NC}"
    docker compose -f $COMPOSE_FILE exec mariadb healthcheck.sh --connect --innodb_initialized 2>/dev/null || sleep 5
    echo -e "${GREEN}✅ MariaDB prêt sur le port 3306${NC}"
    ;;

  stop)
    echo -e "${YELLOW}🛑 Arrêt de MariaDB...${NC}"
    docker compose -f $COMPOSE_FILE stop mariadb
    echo -e "${GREEN}✅ MariaDB arrêté (données conservées)${NC}"
    ;;

  restart)
    $0 stop
    $0 start
    ;;

  reset)
    echo -e "${RED}⚠️  Suppression TOTALE des données MariaDB !${NC}"
    read -p "Confirme (oui/non) : " confirm
    if [ "$confirm" = "oui" ]; then
      docker compose -f $COMPOSE_FILE down -v
      echo -e "${GREEN}✅ Volume supprimé. Lance './docker-db.sh start' pour repartir proprement.${NC}"
    else
      echo "Annulé."
    fi
    ;;

  logs)
    docker compose -f $COMPOSE_FILE logs -f mariadb
    ;;

  adminer)
    echo -e "${GREEN}🌐 Démarrage Adminer (interface web DB)...${NC}"
    check_env
    docker compose --env-file $ENV_FILE -f $COMPOSE_FILE --profile tools up -d adminer
    echo -e "${GREEN}✅ Adminer disponible sur http://localhost:8080${NC}"
    echo -e "${YELLOW}   Serveur: $CONTAINER | User: \$DB_USER | DB: \$DB_NAME${NC}"
    ;;

  shell)
    echo -e "${GREEN}🐚 Connexion shell MySQL...${NC}"
    docker compose -f $COMPOSE_FILE exec mariadb mariadb -u cocaisse -p cocaisse
    ;;

  status)
    docker compose -f $COMPOSE_FILE ps
    ;;

  backup)
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    echo -e "${GREEN}💾 Sauvegarde en cours → $BACKUP_FILE${NC}"
    docker compose -f $COMPOSE_FILE exec mariadb \
      mariadb-dump -u cocaisse -pcocaisse cocaisse > "$BACKUP_FILE"
    echo -e "${GREEN}✅ Backup créé : $BACKUP_FILE${NC}"
    ;;

  restore)
    if [ -z "$2" ]; then
      echo -e "${RED}❌ Usage : ./docker-db.sh restore <fichier.sql>${NC}"
      exit 1
    fi
    echo -e "${YELLOW}♻️  Restauration depuis $2...${NC}"
    docker compose -f $COMPOSE_FILE exec -T mariadb \
      mariadb -u cocaisse -pcocaisse cocaisse < "$2"
    echo -e "${GREEN}✅ Restauration terminée${NC}"
    ;;

  *)
    echo ""
    echo -e "${GREEN}Co-Caisse — Gestion Docker MariaDB${NC}"
    echo ""
    echo "Usage: ./docker-db.sh [commande]"
    echo ""
    echo "Commandes disponibles :"
    echo "  start     Démarre MariaDB"
    echo "  stop      Arrête MariaDB (données conservées)"
    echo "  restart   Redémarre MariaDB"
    echo "  reset     Supprime TOUTES les données (irréversible)"
    echo "  logs      Affiche les logs en temps réel"
    echo "  adminer   Démarre l'interface web Adminer (port 8080)"
    echo "  shell     Ouvre un shell MySQL interactif"
    echo "  status    Affiche l'état des conteneurs"
    echo "  backup    Crée un dump SQL horodaté"
    echo "  restore   Restaure depuis un fichier SQL"
    echo ""
    ;;
esac
