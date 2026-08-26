const baseUrl = process.env.LOAD_TEST_URL ?? 'http://localhost:3001'
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 50)
const startedAt = performance.now()
const responses = await Promise.all(Array.from({ length: requests }, () => fetch(`${baseUrl}/api/v1/feed?limit=20`)))
const elapsed = performance.now() - startedAt
console.log(
  JSON.stringify({
    requests,
    elapsedMs: Math.round(elapsed),
    successful: responses.filter((response) => response.ok).length,
  }),
)
