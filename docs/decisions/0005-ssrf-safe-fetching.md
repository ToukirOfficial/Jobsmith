# 0005 Fetching job pages safely

**Decision.** Job pages are fetched in the worker by a small in-house fetcher: http/https on ports 80 and 443
only, every DNS answer checked against private, loopback, link-local, CGNAT and metadata ranges (Node's
`net.BlockList`), the connection pinned to the vetted address, at most three redirects each checked again,
10 seconds, 2 MB, HTML only, and robots.txt respected. LinkedIn and Indeed are never fetched.

**Why.** A "paste a link" box on a self-hosted server is an SSRF risk. The same address check guards
user-chosen OpenAI-compatible endpoints, which are refused on private addresses unless the server owner sets
`AI_ALLOW_LOCAL_ENDPOINTS=true` (for Ollama).
