#!/bin/bash

echo "🚀 Démarrage de SafePath..."

# Vérifier si Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé. Veuillez installer Docker."
    exit 1
fi

# Vérifier si Docker Compose est installé
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose n'est pas installé. Veuillez l'installer."
    exit 1
fi

# Copier le fichier d'environnement si nécessaire
if [ ! -f .env ]; then
    echo "📝 Création du fichier .env..."
    cp .env.example .env
    echo "⚠️  Veuillez configurer vos variables d'environnement dans le fichier .env"
fi

# Démarrer les conteneurs
echo "🐳 Lancement des conteneurs Docker..."
docker-compose up -d

# Attendre que les services soient prêts
echo "⏳ Attente du démarrage des services..."
sleep 10

# Initialiser la base de données
echo "🗄️  Initialisation de la base de données..."
docker-compose exec backend python manage.py migrate
docker-compose exec backend python initialize_data.py

echo "✅ SafePath est prêt !"
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:8000/api"
echo "📊 Admin Django: http://localhost:8000/admin"

echo ""
echo "Commandes utiles:"
echo "  docker-compose logs -f     # Voir les logs"
echo "  docker-compose down        # Arrêter les services"
echo "  docker-compose restart     # Redémarrer les services"  
