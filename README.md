# Order Execution Engine

A high-performance DEX order execution engine with intelligent routing between Raydium and Meteora, featuring real-time WebSocket status updates and robust queue management.

## 🌐 Live Demo

**Deployed URL:** `https://eterna-labs-backend.kalkikgp.tech`

**API Base URL:** `https://eterna-labs-backend.kalkikgp.tech/api`

**Note:** This is running on Render's free tier, so if it's been idle for a while, the first request might take 30-60 seconds to wake up. After that it should be pretty quick until it goes to sleep again.

## 📹 Demo Video

**YouTube Demo:** [Watch the Order Execution Engine in action](https://youtu.be/buXtjDKSvvM)

**Testing:** A `demo.html` file is included in this repository for testing the backend API interactively with real-time WebSocket updates.

## 🏗️ Design Decisions

### Why Market Orders?

I chose to implement **Market Orders** because they execute immediately at the best available price, making them ideal for demonstrating the complete order execution flow. Market orders are also the most common order type in DEX trading, representing 70%+ of trading volume.

### Extending to Other Order Types

The same engine can be extended to support **Limit Orders** by adding a price monitoring service that triggers execution when the target price is reached, and **Sniper Orders** by integrating token launch monitoring to execute on detection of new liquidity pools.

## 🚀 Setup Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Quick Start with Docker

```bash
# Clone the repository
cd backend

# Start all services (PostgreSQL, Redis, API)
docker-compose up -d

# Check service health
curl http://localhost:3000/api/health/detailed
```

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file:
   ```bash
   PORT=3000
   NODE_ENV=development
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=order_execution
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   REDIS_HOST=localhost
   REDIS_PORT=6379
   MAX_CONCURRENT_ORDERS=10
   ORDER_RATE_LIMIT=100
   RETRY_MAX_ATTEMPTS=3
   RETRY_BACKOFF_MS=1000
   MOCK_MODE=true
   MOCK_DELAY_MIN_MS=2000
   MOCK_DELAY_MAX_MS=3000
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

## 📡 API Documentation

### Execute Order

**POST** `/api/orders/execute`

```json
{
  "type": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 100,
  "slippage": 0.01
}
```

**Response:**
```json
{
  "orderId": "uuid",
  "status": "pending",
  "message": "Order created successfully",
  "websocketUrl": "/api/orders/execute?orderId=uuid"
}
```

**WebSocket:** Connect to `GET /api/orders/execute?orderId=<orderId>` for real-time status updates.

**Status Flow:**
- `pending` → Order received and queued
- `routing` → Comparing DEX prices
- `building` → Creating transaction
- `submitted` → Transaction sent to network
- `confirmed` → Transaction successful (includes txHash)
- `failed` → Error occurred (includes error details)

## 🧪 Testing

The project includes **28 comprehensive tests** covering DEX routing logic, WebSocket lifecycle, and order validation.

```bash
# Run all tests
npm test

# Generate coverage report
npm test -- --coverage
```

## 📮 Postman Collection

Import `postman_collection.json` into Postman/Insomnia for ready-to-use API requests.

## 🛠️ Tech Stack

- **Runtime:** Node.js 18 + TypeScript
- **Web Server:** Fastify (HTTP/WebSocket)
- **Queue:** BullMQ + Redis
- **Database:** PostgreSQL 15
- **Testing:** Jest

## 🚢 Deployment

Deploy to any platform supporting Node.js, PostgreSQL, and Redis. The project includes configuration files for Render, Railway, Fly.io, and Heroku.

**Required Environment Variables:**
- `NODE_ENV=production`
- `PORT=3000`
- PostgreSQL connection variables
- Redis connection variables
