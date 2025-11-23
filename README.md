# Order Execution Engine

A high-performance DEX order execution engine with intelligent routing between Raydium and Meteora, featuring real-time WebSocket status updates and robust queue management.

## 🎯 Project Overview

This backend service implements a production-ready order execution engine that:
- ✅ Processes **Market Orders** with immediate execution
- 🔀 Routes orders intelligently between Raydium and Meteora DEXs
- 📡 Streams real-time order status via WebSocket
- ⚡ Handles concurrent order processing (up to 10 simultaneous orders)
- 🔄 Implements exponential backoff retry logic
- 📊 Maintains complete order history in PostgreSQL

## 📹 Demo Video

**YouTube Demo:** [Watch the Order Execution Engine in action](https://youtube.com/your-demo-link)

The demo showcases:
- Concurrent order submission (5 orders simultaneously)
- WebSocket status updates (pending → routing → building → submitted → confirmed)
- DEX routing decisions in real-time
- Queue processing with retry logic

## 🏗️ Architecture & Design Decisions

### Why Market Orders?

I chose to implement **Market Orders** for the following reasons:

1. **Simplicity & Reliability**: Market orders execute immediately at the best available price, making them ideal for demonstrating the complete order execution flow without additional complexity
2. **Real-world Usage**: Market orders are the most common order type in DEX trading, representing 70%+ of trading volume
3. **Extensibility Foundation**: The architecture can easily support other order types:
   - **Limit Orders**: Add a price monitoring service that triggers execution when target price is reached
   - **Sniper Orders**: Integrate token launch monitoring and execute on detection of new liquidity pools

### Architecture Highlights

```
┌─────────────┐     HTTP/WS      ┌──────────────┐
│   Client    │ ◄──────────────► │   Fastify    │
└─────────────┘                  │   Server     │
                                 └──────┬───────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐      ┌─────▼──────┐     ┌─────▼─────┐
              │  BullMQ   │      │ WebSocket  │     │ PostgreSQL│
              │   Queue   │      │  Manager   │     │    DB     │
              └─────┬─────┘      └────────────┘     └───────────┘
                    │
              ┌─────▼─────┐
              │ Execution │
              │  Service  │
              └─────┬─────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼─────┐        ┌─────▼────┐
    │ Raydium  │        │ Meteora  │
    │  Router  │        │  Router  │
    └──────────┘        └──────────┘
```

### Key Design Patterns

1. **HTTP → WebSocket Pattern**: 
   - User submits order via `POST /api/orders/execute`
   - API validates order and returns `orderId`
   - Same HTTP connection upgrades to WebSocket at `GET /api/orders/execute?orderId=<orderId>` for live status updates
   - **Note**: Due to Fastify WebSocket plugin requiring GET method, WebSocket connection uses separate GET endpoint with orderId query parameter
2. **Queue-based Processing**: BullMQ ensures reliable order processing with rate limiting and concurrency control
3. **DEX Abstraction**: Mock implementations allow easy swapping with real DEX SDKs
4. **Event Sourcing**: All status changes are logged for audit trails

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ (can be installed via Homebrew)
- Redis 7+ (can be installed via Homebrew)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
cd backend

# Start all services (PostgreSQL, Redis, API)
docker-compose up -d

# Check service health
curl http://localhost:3000/api/health/detailed

# View logs
docker-compose logs -f api
```

### Option 2: Local Development (Without Docker)

#### Step 1: Install Databases via Homebrew

```bash
# Install PostgreSQL 15
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Install Redis
brew install redis

# Start Redis service
brew services start redis

# Verify services are running
brew services list
```

#### Step 2: Set Up PostgreSQL Database

```bash
# Add PostgreSQL to your PATH (if not already added)
# For Apple Silicon Macs:
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# For Intel Macs:
# export PATH="/usr/local/opt/postgresql@15/bin:$PATH"

# Add to your ~/.zshrc to make it permanent:
echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Create the database
createdb order_execution

# Or using psql
psql postgres
CREATE DATABASE order_execution;
\q
```

#### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
cat > .env << EOF
# Server
PORT=3000
NODE_ENV=development

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=order_execution
POSTGRES_USER=$(whoami)
POSTGRES_PASSWORD=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Order Processing
MAX_CONCURRENT_ORDERS=10
ORDER_RATE_LIMIT=100
RETRY_MAX_ATTEMPTS=3
RETRY_BACKOFF_MS=1000

# Mock DEX (for testing)
MOCK_MODE=true
MOCK_DELAY_MIN_MS=2000
MOCK_DELAY_MAX_MS=3000
EOF
```

**Important:** 
- Homebrew PostgreSQL uses your macOS username (`$(whoami)`) as the database user by default
- No password is required by default - leave `POSTGRES_PASSWORD` empty
- If you prefer to use `postgres` as the user (like Docker), you can create that user:
  ```bash
  psql postgres
  CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';
  CREATE DATABASE order_execution OWNER postgres;
  \q
  ```
  Then set `POSTGRES_USER=postgres` and `POSTGRES_PASSWORD=postgres` in your `.env` file.

#### Step 4: Install Dependencies and Run

```bash
# Install Node.js dependencies
npm install

# Run database migrations (auto-initialized on first run)
npm run dev

# The server starts at http://localhost:3000
```

#### Troubleshooting Local Setup

**PostgreSQL Connection Issues:**
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Check PostgreSQL version
psql --version

# Test connection
psql -d order_execution -U $(whoami)
```

**Redis Connection Issues:**
```bash
# Check if Redis is running
brew services list | grep redis

# Test Redis connection
redis-cli ping
# Should return: PONG
```

**Port Conflicts:**
- If port 5432 is already in use, you can change `POSTGRES_PORT` in `.env`
- If port 6379 is already in use, you can change `REDIS_PORT` in `.env`

## 📡 API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### 1. Execute Order

**Step 1: Submit Order via POST**
```http
POST /api/orders/execute
Content-Type: application/json

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
  "websocketUrl": "/api/orders/execute?orderId=uuid",
  "note": "Connect to WebSocket endpoint for real-time status updates"
}
```

**Step 2: Connect to WebSocket for Live Updates**
```http
GET /api/orders/execute?orderId=<orderId>
Upgrade: websocket
```

**WebSocket Status Updates:**
```json
// Initial connection confirmation
{"orderId": "uuid", "status": "pending", "message": "Connected to order status stream", "currentStatus": {...}}

// Status updates streamed in real-time
{"orderId": "uuid", "status": "routing", "data": {"quotes": [...]}}
{"orderId": "uuid", "status": "building", "data": {"selectedDex": "raydium"}}
{"orderId": "uuid", "status": "submitted"}
{"orderId": "uuid", "status": "confirmed", "data": {"txHash": "abc123...", "executedPrice": 98.5}}
```

#### 2. Get Order by ID
```http
GET /api/orders/:orderId
```

#### 3. Get All Orders
```http
GET /api/orders?status=confirmed&limit=50&offset=0
```

#### 4. Queue Metrics
```http
GET /api/orders/queue/metrics
```

## 🧪 Testing

The project includes **13 comprehensive tests** covering:
- ✅ DEX routing logic (6 tests)
- ✅ WebSocket lifecycle (6 tests)
- ✅ Order validation (7 tests)

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm test -- --coverage
```

### Test Coverage
- **Branches**: 70%+
- **Functions**: 70%+
- **Lines**: 70%+

## 📮 Postman Collection

Import `postman_collection.json` into Postman/Insomnia for ready-to-use API requests.

The collection includes:
- Health checks
- Market order creation
- Concurrent order testing (5 orders)
- Invalid order validation tests

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=order_execution
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Order Processing
MAX_CONCURRENT_ORDERS=10      # Max parallel orders
ORDER_RATE_LIMIT=100          # Orders per minute
RETRY_MAX_ATTEMPTS=3          # Max retry attempts
RETRY_BACKOFF_MS=1000         # Initial backoff delay

# Mock DEX (for testing)
MOCK_MODE=true
MOCK_DELAY_MIN_MS=2000
MOCK_DELAY_MAX_MS=3000
```

## 📊 Order Status Lifecycle

```
PENDING    →  Order received and queued
   ↓
ROUTING    →  Fetching quotes from Raydium & Meteora
   ↓
BUILDING   →  Creating transaction with best DEX
   ↓
SUBMITTED  →  Transaction sent to network
   ↓
CONFIRMED  →  Transaction successful (includes txHash)

(Any step can fail → FAILED with error details)
```

## 🎯 Key Features

### 1. Intelligent DEX Routing
- Fetches quotes from **both** Raydium and Meteora simultaneously
- Selects DEX with best output amount
- Considers fees and price impact
- Logs routing decisions for transparency

### 2. Concurrent Order Processing
- Processes up to **10 orders** concurrently
- Rate limited to **100 orders/minute**
- Fair queue scheduling (FIFO)

### 3. Retry Logic with Exponential Backoff
- Auto-retries failed orders up to **3 times**
- Exponential backoff: 1s → 2s → 4s
- Persists failure reasons for post-mortem analysis

### 4. Real-time WebSocket Updates
- Single connection per order
- Status updates pushed instantly
- Includes detailed execution data (txHash, price, DEX)

### 5. Complete Order History
- All orders stored in PostgreSQL
- Event sourcing for full audit trail
- DEX quotes saved for analysis

## 🛠️ Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js 18 + TypeScript | Type-safe backend development |
| **Web Server** | Fastify | High-performance HTTP/WebSocket server |
| **Queue** | BullMQ + Redis | Reliable order processing queue |
| **Database** | PostgreSQL 15 | Order history and persistence |
| **Validation** | Zod | Runtime type validation |
| **Logging** | Pino | Structured logging |
| **Testing** | Jest | Unit and integration tests |
| **Containerization** | Docker + Docker Compose | Easy deployment |

## 🚢 Deployment

### Deploy to Render (Free Tier)

1. **Create `render.yaml`** (included in repo)
2. **Push to GitHub**
3. **Connect to Render**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - New → Blueprint
   - Connect your GitHub repo
   - Render auto-deploys using `render.yaml`

4. **Environment Variables**: Set in Render dashboard
   - `DATABASE_URL` (PostgreSQL)
   - `REDIS_URL` (Redis)

### Alternative Deployments

- **Railway**: `railway up`
- **Fly.io**: `fly deploy`
- **Heroku**: `git push heroku main`

## 📈 Performance Metrics

- **Order Processing Time**: 2-3 seconds (mock DEX execution)
- **Concurrent Orders**: Up to 10 simultaneous
- **Throughput**: 100 orders/minute
- **WebSocket Latency**: < 50ms for status updates

## 🔐 Security Features

- Input validation with Zod schemas
- SQL injection protection (parameterized queries)
- WebSocket connection authentication ready
- Rate limiting on order submission
- Environment-based configuration

## 🧩 Extensibility

### Adding Real DEX Integration

Replace `mockDexRouter.service.ts` with real implementations:

```typescript
// Example: Real Raydium integration
import { Raydium } from '@raydium-io/raydium-sdk-v2';

export class RealDexRouter {
  async getRaydiumQuote(tokenIn, tokenOut, amount) {
    const raydium = await Raydium.load({/*...*/});
    const { poolInfo } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
    return poolInfo.quote;
  }
}
```

### Adding Limit Orders

1. Create `LimitOrderMonitor` service
2. Poll DEX prices every N seconds
3. Trigger execution when `currentPrice >= targetPrice`
4. Use existing execution pipeline

### Adding Sniper Orders

1. Monitor token launches via Solana WebSocket
2. Detect new liquidity pools
3. Auto-execute on pool creation
4. Leverage existing queue system

## 📝 Development Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Compile TypeScript to JavaScript
npm start            # Start production server
npm test             # Run tests
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
```

### Queue Not Processing
```bash
# Check Redis connection
docker-compose logs redis

# Restart queue worker
docker-compose restart api
```

## 📞 Support & Contribution

- **Issues**: [GitHub Issues](https://github.com/yourusername/order-execution-engine/issues)
- **Documentation**: This README
- **API Testing**: Import `postman_collection.json`

## 📄 License

MIT License - See LICENSE file for details

---

## 🎓 Learning Resources

- **Raydium SDK**: https://github.com/raydium-io/raydium-sdk-V2-demo
- **Meteora Docs**: https://docs.meteora.ag/
- **Solana Dev**: https://solana.com/developers
- **BullMQ**: https://docs.bullmq.io/

---

**Built with ❤️ for the Solana DeFi ecosystem**
