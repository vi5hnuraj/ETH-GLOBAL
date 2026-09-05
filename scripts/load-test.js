import http from 'http';
import { URL } from 'url';

const TARGET_URL = process.argv[2] || 'http://localhost:5550/api/health';
const CONCURRENCY = parseInt(process.argv[3]) || 50;
const DURATION_SECONDS = parseInt(process.argv[4]) || 10;

console.log(`\n⚡ ==================================================`);
console.log(`⚡ GLOBALPAY PERFORMANCE & STRESS TESTING SUITE`);
console.log(`⚡ ==================================================`);
console.log(`🎯 Target URL:      ${TARGET_URL}`);
console.log(`👥 Concurrency:    ${CONCURRENCY} concurrent workers`);
console.log(`⏱️ Duration:       ${DURATION_SECONDS} seconds`);
console.log(`====================================================\n`);

const latencies = [];
let totalRequests = 0;
let successRequests = 0;
let failRequests = 0;

const urlObj = new URL(TARGET_URL);
const options = {
  hostname: urlObj.hostname,
  port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
  path: urlObj.pathname + urlObj.search,
  method: 'GET',
  headers: {
    'User-Agent': 'GlobalPay-Load-Tester/1.0'
  }
};

let keepRunning = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function worker() {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 100 });
  const workerOptions = { ...options, agent };
  
  while (keepRunning) {
    totalRequests++;
    const start = process.hrtime.bigint();
    
    await new Promise((resolve) => {
      const req = http.request(workerOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const durationMs = Number(end - start) / 1e6;
          latencies.push(durationMs);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            successRequests++;
          } else {
            failRequests++;
          }
          resolve();
        });
      });
      
      req.on('error', (err) => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        latencies.push(durationMs);
        failRequests++;
        resolve();
      });
      
      req.end();
    });
    
    // Add micro-sleep to prevent completely blocking the event loop
    await sleep(2);
  }
}

async function run() {
  const startTime = Date.now();
  
  // Start workers
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  
  // Wait for duration
  await sleep(DURATION_SECONDS * 1000);
  keepRunning = false;
  
  // Wait for all workers to finish active requests
  await Promise.all(workers);
  
  const endTime = Date.now();
  const actualDurationMs = endTime - startTime;
  const actualDurationSeconds = actualDurationMs / 1000;
  
  // Calculate benchmarks
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const total = sortedLatencies.length;
  
  if (total === 0) {
    console.error("❌ No requests completed!");
    return;
  }
  
  const sum = sortedLatencies.reduce((acc, val) => acc + val, 0);
  const avg = sum / total;
  const min = sortedLatencies[0];
  const max = sortedLatencies[total - 1];
  
  const getPercentile = (p) => {
    const idx = Math.min(total - 1, Math.ceil((p / 100) * total) - 1);
    return sortedLatencies[Math.max(0, idx)];
  };
  
  const p50 = getPercentile(50);
  const p90 = getPercentile(90);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);
  
  const rps = total / actualDurationSeconds;
  const successRate = (successRequests / total) * 100;
  
  console.log(`📊 BENCHMARK RESULTS:`);
  console.log(`----------------------------------------------------`);
  console.log(`⏱️ Actual Duration:  ${actualDurationSeconds.toFixed(2)}s`);
  console.log(`🚀 Total Requests:  ${total}`);
  console.log(`✅ Success:         ${successRequests} (${successRate.toFixed(2)}%)`);
  console.log(`❌ Failures:        ${failRequests}`);
  console.log(`📈 Throughput:      ${rps.toFixed(2)} requests/sec`);
  console.log(`----------------------------------------------------`);
  console.log(`⏱️ Latency metrics:`);
  console.log(`   Min:             ${min.toFixed(2)} ms`);
  console.log(`   Average:         ${avg.toFixed(2)} ms`);
  console.log(`   50% (Median):    ${p50.toFixed(2)} ms`);
  console.log(`   90%:             ${p90.toFixed(2)} ms`);
  console.log(`   95%:             ${p95.toFixed(2)} ms`);
  console.log(`   99%:             ${p99.toFixed(2)} ms`);
  console.log(`   Max:             ${max.toFixed(2)} ms`);
  console.log(`====================================================\n`);
}

run();
