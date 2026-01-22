#!/bin/bash

# ankrshield Database Setup Script
# This script helps setup and manage the database infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  ankrshield Database Setup${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Warning: docker-compose not found. Using 'docker compose' instead.${NC}"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo -e "${YELLOW}Step 1: Building custom PostgreSQL image with TimescaleDB + pgvector...${NC}"
$DOCKER_COMPOSE build postgres

echo ""
echo -e "${YELLOW}Step 2: Starting PostgreSQL and Redis containers...${NC}"
$DOCKER_COMPOSE up -d postgres redis

echo ""
echo -e "${YELLOW}Step 3: Waiting for databases to be ready...${NC}"
sleep 5

# Wait for PostgreSQL to be ready
echo -n "Waiting for PostgreSQL..."
for i in {1..30}; do
    if docker exec ankrshield-postgres pg_isready -U ankrshield > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Wait for Redis to be ready
echo -n "Waiting for Redis..."
for i in {1..30}; do
    if docker exec ankrshield-redis redis-cli -a ankrshield_redis_password ping > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo -e "${YELLOW}Step 4: Verifying PostgreSQL extensions...${NC}"
docker exec ankrshield-postgres psql -U ankrshield -d ankrshield -c "\dx" | grep -E "timescaledb|vector|uuid-ossp|pgcrypto"

echo ""
echo -e "${YELLOW}Step 5: Testing database connection...${NC}"
node scripts/test-db-connection.js

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Database Setup Complete! ✓${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Connection details:"
echo "  PostgreSQL: postgresql://ankrshield:ankrshield_dev_password@localhost:5432/ankrshield"
echo "  Redis: redis://localhost:6379 (password: ankrshield_redis_password)"
echo ""
echo "Management tools (optional):"
echo "  pgAdmin: $DOCKER_COMPOSE --profile tools up -d pgadmin"
echo "  Redis Commander: $DOCKER_COMPOSE --profile tools up -d redis-commander"
echo ""
echo "Useful commands:"
echo "  View logs: $DOCKER_COMPOSE logs -f"
echo "  Stop services: $DOCKER_COMPOSE down"
echo "  Reset database: $DOCKER_COMPOSE down -v && $DOCKER_COMPOSE up -d"
echo ""
