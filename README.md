# E-Commerce App (microservices)

```
Frontend (React, :5173)
      │  HTTP + JWT
      ▼
API Gateway (YARP, :5000) ── vérifie JWT + clé Redis ──► Redis (:6379)
      ├─ /api/auth/*       → identity-service (.NET, :5180)   signUp / signIn, MongoDB identitydb, tokens dans Redis
      ├─ /api/products/*   → product-service  (.NET, :5165)   GET public, écriture authentifiée
      ├─ /api/customers/*  → customer-service (.NET, :5157)
      └─ /api/orders/*     → order-service    (Node, :3100)

RabbitMQ (exchange topic `ecommerce.events`)
  user.registered  identity  → customer   crée le profil client (id = id utilisateur)
  order.created    order     → customer   compte la commande / total dépensé
                             → product    décrémente le stock
  order.cancelled  order     → customer   annule le compte
                             → product    restitue le stock
```

## Démarrage

```bash
# 1. Infra : MongoDB, RabbitMQ (UI :15672), Redis
docker compose -f Infrastructure_ECommApp/docker-compose.yml up -d

# 2. Services (un terminal chacun)
cd services/identity-service && dotnet run --launch-profile http
cd services/product-service  && dotnet run --launch-profile http
cd services/customer-service && dotnet run --launch-profile http
cd services/order-service    && npm install && npm start
cd services/ApiGateWay       && dotnet run --launch-profile http

# 3. Frontend
cd frontend && npm install && npm run dev      # http://localhost:5173
```

Le frontend ne parle qu'au gateway (`VITE_API_URL`, défaut `http://localhost:5000`).

## Tokens

`signup`/`signin` renvoient un JWT (HS256, 60 min). Son `jti` est stocké dans Redis (`auth:token:{jti}`, TTL = durée du token).
Le gateway refuse tout token dont la clé a disparu : supprimer la clé = révoquer la session.
`Jwt:Key` est partagée entre identity-service et gateway : à remplacer en production (variable d'environnement `Jwt__Key`).

## Ports

Le port 3000 est souvent pris (Grafana…), l'order-service utilise donc **3100**.
