# PostgreSQL Connection Pool Optimization Guide

This guide explains the connection pool optimization for handling high concurrent traffic efficiently.

## Overview

The Stellar Payment API uses a PostgreSQL connection pool to manage database connections efficiently. The pool is optimized to handle concurrent traffic while staying within Supabase's connection limits.

## Pool Configuration

### Current Settings

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Maximum connections
  min: 2,               // Minimum connections
  idleTimeoutMillis: 30_000,        // 30 seconds
  connectionTimeoutMillis: 5_000,   // 5 seconds
  statement_timeout: 30_000,        // 30 seconds
  ssl: { rejectUnauthorized: false },
});
```

### Configuration Explanation

- **max: 20**: Maximum number of connections in the pool
  - Optimized for concurrent traffic
  - Stays well below Supabase free-tier limit of 60 connections
  - Adjust based on your traffic patterns

- **min: 2**: Minimum number of connections to maintain
  - Ensures faster response times for initial requests
  - Reduces connection establishment overhead
  - Adjust based on baseline traffic

- **idleTimeoutMillis: 30_000**: Release idle connections after 30 seconds
  - Prevents connection leaks
  - Frees up resources
  - Adjust based on your traffic patterns

- **connectionTimeoutMillis: 5_000**: Fail fast if connection takes >5 seconds
  - Prevents indefinite queuing
  - Allows quick error handling
  - Adjust based on network latency

- **statement_timeout: 30_000**: Cancel queries running >30 seconds
  - Prevents long-running queries from blocking the pool
  - Protects against runaway queries
  - Adjust based on your query patterns

## Pool Monitoring

### Enable Monitoring

Pool monitoring is disabled by default. Enable it with environment variables:

```bash
# Enable pool monitoring
POOL_MONITORING_ENABLED=true

# Optional: Set monitoring interval (default: 60000ms)
POOL_MONITORING_INTERVAL_MS=60000
```

### Monitoring Output

When enabled, the pool logs statistics every minute:

```
Pool stats: {
  timestamp: '2024-03-28T12:34:56.789Z',
  totalConnections: 15,
  idleConnections: 8,
  waitingRequests: 0,
  maxConnections: 20,
  minConnections: 2,
  utilizationPercent: '35.00'
}
```

### Metrics Explained

- **totalConnections**: Current number of active connections
- **idleConnections**: Connections available for use
- **waitingRequests**: Requests waiting for a connection
- **maxConnections**: Maximum pool size
- **minConnections**: Minimum pool size
- **utilizationPercent**: Percentage of pool in use

## Performance Tuning

### Identifying Bottlenecks

Monitor these metrics to identify issues:

1. **High waitingRequests**: Pool is exhausted
   - Increase `max` connections
   - Optimize slow queries
   - Reduce query volume

2. **Low idleConnections**: Connections are being held
   - Reduce `idleTimeoutMillis`
   - Check for connection leaks
   - Optimize query duration

3. **High totalConnections**: Many connections in use
   - Increase `max` if needed
   - Optimize query performance
   - Implement caching

### Tuning Recommendations

#### For High Traffic

```javascript
const pool = new Pool({
  max: 30,              // Increase max connections
  min: 5,               // Increase minimum
  idleTimeoutMillis: 20_000,  // Reduce idle timeout
  connectionTimeoutMillis: 3_000,  // Reduce connection timeout
  statement_timeout: 20_000,  // Reduce statement timeout
});
```

#### For Low Traffic

```javascript
const pool = new Pool({
  max: 10,              // Reduce max connections
  min: 1,               // Reduce minimum
  idleTimeoutMillis: 60_000,  // Increase idle timeout
  connectionTimeoutMillis: 10_000,  // Increase connection timeout
  statement_timeout: 60_000,  // Increase statement timeout
});
```

#### For Balanced Performance

```javascript
const pool = new Pool({
  max: 20,              // Balanced max
  min: 2,               // Balanced minimum
  idleTimeoutMillis: 30_000,  // Balanced idle timeout
  connectionTimeoutMillis: 5_000,  // Balanced connection timeout
  statement_timeout: 30_000,  // Balanced statement timeout
});
```

## Monitoring with Prometheus

The pool statistics are available via Prometheus metrics:

```
# HELP pg_pool_total_connections Total connections in pool
# TYPE pg_pool_total_connections gauge
pg_pool_total_connections 15

# HELP pg_pool_idle_connections Idle connections in pool
# TYPE pg_pool_idle_connections gauge
pg_pool_idle_connections 8

# HELP pg_pool_waiting_requests Requests waiting for connection
# TYPE pg_pool_waiting_requests gauge
pg_pool_waiting_requests 0

# HELP pg_pool_utilization_percent Pool utilization percentage
# TYPE pg_pool_utilization_percent gauge
pg_pool_utilization_percent 35.00
```

### Prometheus Query Examples

```promql
# Current pool utilization
pg_pool_utilization_percent

# Average utilization over 5 minutes
avg_over_time(pg_pool_utilization_percent[5m])

# Waiting requests
pg_pool_waiting_requests

# Connection count trend
rate(pg_pool_total_connections[5m])
```

## Connection Pooling Best Practices

### 1. Use Connection Pooling

Always use connection pooling, never create connections directly:

```javascript
// ✓ CORRECT - Use pool
const result = await pool.query('SELECT * FROM merchants');

// ✗ WRONG - Direct connection
const client = new pg.Client();
await client.connect();
const result = await client.query('SELECT * FROM merchants');
await client.end();
```

### 2. Release Connections Promptly

Ensure connections are released after use:

```javascript
// ✓ CORRECT - Connection released automatically
const result = await pool.query('SELECT * FROM merchants');

// ✗ WRONG - Connection not released
const client = await pool.connect();
const result = await client.query('SELECT * FROM merchants');
// Forgot to call client.release()
```

### 3. Avoid Long-Running Queries

Long-running queries block connections:

```javascript
// ✓ CORRECT - Efficient query
const result = await pool.query(
  'SELECT id, name FROM merchants WHERE status = $1 LIMIT 100',
  ['active']
);

// ✗ WRONG - Inefficient query
const result = await pool.query(
  'SELECT * FROM payments WHERE created_at > NOW() - INTERVAL 1 YEAR'
);
```

### 4. Use Prepared Statements

Prepared statements improve performance and security:

```javascript
// ✓ CORRECT - Prepared statement
const result = await pool.query(
  'SELECT * FROM merchants WHERE id = $1',
  [merchantId]
);

// ✗ WRONG - String concatenation
const result = await pool.query(
  `SELECT * FROM merchants WHERE id = '${merchantId}'`
);
```

### 5. Implement Connection Pooling at Application Level

Use a single pool instance across the application:

```javascript
// ✓ CORRECT - Singleton pool
export { pool } from './db.js';

// In routes
import { pool } from './lib/db.js';
const result = await pool.query('SELECT * FROM merchants');

// ✗ WRONG - Multiple pool instances
const pool1 = new Pool({ ... });
const pool2 = new Pool({ ... });
// This defeats the purpose of pooling
```

## Troubleshooting

### Connection Pool Exhausted

**Symptom**: Requests timeout with "no more connections available"

**Solutions**:
1. Increase `max` connections
2. Reduce query duration
3. Implement query caching
4. Check for connection leaks

### Slow Queries

**Symptom**: High response times, high pool utilization

**Solutions**:
1. Add database indexes
2. Optimize query logic
3. Reduce `statement_timeout` to fail fast
4. Implement query caching

### Connection Leaks

**Symptom**: Connections never released, pool fills up

**Solutions**:
1. Ensure all queries use `await`
2. Check for uncaught exceptions
3. Use try/finally to ensure cleanup
4. Monitor pool statistics

### High Memory Usage

**Symptom**: Memory usage increases over time

**Solutions**:
1. Reduce `max` connections
2. Reduce `idleTimeoutMillis`
3. Check for memory leaks in queries
4. Monitor pool statistics

## Load Testing

### Using autocannon

Test pool performance under load:

```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon -c 100 -d 30 http://localhost:4000/api/payments

# With custom concurrency
autocannon -c 50 -d 60 http://localhost:4000/api/payments
```

### Interpreting Results

```
Requests/sec: 1000      # Throughput
Latency avg: 50ms       # Average response time
Latency p99: 200ms      # 99th percentile response time
Errors: 0               # Failed requests
```

### Load Test Scenarios

1. **Baseline**: 10 concurrent connections
2. **Normal**: 50 concurrent connections
3. **Peak**: 100 concurrent connections
4. **Stress**: 200+ concurrent connections

## Monitoring Checklist

- [ ] Enable pool monitoring in production
- [ ] Set up Prometheus metrics collection
- [ ] Create alerts for high pool utilization
- [ ] Monitor query performance
- [ ] Track connection count trends
- [ ] Review logs for connection errors
- [ ] Test pool under load
- [ ] Document pool configuration
- [ ] Plan for scaling

## Environment Variables

```bash
# Pool Configuration
DATABASE_URL=postgresql://user:pass@host:6543/db

# Monitoring
POOL_MONITORING_ENABLED=true
POOL_MONITORING_INTERVAL_MS=60000

# Logging
LOG_LEVEL=info
```

## References

- [node-postgres Documentation](https://node-postgres.com/)
- [PostgreSQL Connection Pooling](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Database Performance Tuning](https://www.postgresql.org/docs/current/performance.html)
