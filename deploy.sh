#!/bin/bash
# LiveMaid Ubuntu Docker Deployment Script

set -e

echo "🚀 Starting LiveMaid Deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first: https://docs.docker.com/engine/install/ubuntu/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "📦 Pulling latest LiveMaid image from GHCR..."
# Make sure to login first: docker login ghcr.io -u <your_github_username>
# This will pull the public or private image (if authenticated)
docker pull ghcr.io/peter6055/livemaid:latest

# Ensure data directory exists
mkdir -p ./data
# Set permissions so the nodejs user in container can read/write
chmod 777 ./data

echo "🚀 Starting containers with Docker Compose..."
# Support both docker-compose and docker compose
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

echo "✅ LiveMaid is now running!"
echo "🌐 Access it at: http://localhost:3000"
echo "📁 Your diagrams are safely stored in the ./data directory."
