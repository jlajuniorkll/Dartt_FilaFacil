const url = 'http://127.0.0.1:3000/api/queue/status';

try {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(4000),
  });

  if (!response.ok) {
    console.error(`Healthcheck HTTP ${response.status}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Healthcheck failed:', error.message);
  process.exitCode = 1;
}
