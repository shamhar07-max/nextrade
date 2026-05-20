#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
heading() { echo -e "\n${BOLD}$1${NC}"; }

heading "═══════════════════════════════════════"
heading "     NexTrade — Deployment Script"
heading "═══════════════════════════════════════"

# ─── Pre-checks ─────────────────────────────────────────────────────────────
command -v docker  >/dev/null || error "Docker not installed. Visit https://docs.docker.com/get-docker/"
command -v docker  >/dev/null && docker compose version >/dev/null 2>&1 || error "Docker Compose v2 not found."

# ─── Environment Setup ───────────────────────────────────────────────────────
heading "1. Setting up environment..."

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  # Generate a random JWT secret
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
  sed -i "s/nextrade_super_secret_jwt_key_change_in_production_2024/$JWT_SECRET/" backend/.env
  info "Created backend/.env with random JWT secret"
else
  info "backend/.env already exists — skipping"
fi

mkdir -p nginx/ssl
info "Created nginx/ssl directory (add your SSL certs here later)"

# ─── Build & Start ───────────────────────────────────────────────────────────
heading "2. Building and starting containers..."
docker compose pull nginx 2>/dev/null || true
docker compose build --no-cache
docker compose up -d
info "Containers started"

# ─── Wait for backend ────────────────────────────────────────────────────────
heading "3. Waiting for backend to be healthy..."
MAX=30; N=0
until docker compose exec -T backend wget -qO- http://localhost:4000/api/health >/dev/null 2>&1; do
  N=$((N+1))
  [ $N -ge $MAX ] && error "Backend didn't become healthy after 30 attempts."
  echo -n "."
  sleep 2
done
echo ""
info "Backend healthy"

# ─── Seed Database (first run only) ─────────────────────────────────────────
heading "4. Seeding database..."
if docker compose exec -T backend test -f /app/data/.seeded 2>/dev/null; then
  warn "Database already seeded — skipping"
else
  docker compose exec -T backend node src/db/seed.js
  docker compose exec -T backend touch /app/data/.seeded
  info "Database seeded"
fi

# ─── Done ────────────────────────────────────────────────────────────────────
heading "═══════════════════════════════════════"
echo -e "${GREEN}${BOLD}  NexTrade is live!${NC}"
heading "═══════════════════════════════════════"
echo ""
echo -e "  🌐 Web App:    ${BOLD}http://localhost${NC}"
echo -e "  📡 API:        ${BOLD}http://localhost/api/health${NC}"
echo -e "  🔌 WebSocket:  ${BOLD}ws://localhost/ws${NC}"
echo ""
echo -e "  Demo Login:"
echo -e "    Email:     ${BOLD}demo@nextrade.com${NC}"
echo -e "    Password:  ${BOLD}Demo1234!${NC}"
echo ""
echo -e "  Manage: ${BOLD}docker compose ps${NC} | ${BOLD}docker compose logs -f${NC} | ${BOLD}docker compose down${NC}"
echo ""
