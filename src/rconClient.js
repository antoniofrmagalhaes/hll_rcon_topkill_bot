class RconClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async get(endpoint, query = null) {
    return this.request(endpoint, "GET", null, query);
  }

  async post(endpoint, body = {}) {
    return this.request(endpoint, "POST", body);
  }

  async request(endpoint, method, body, query = null) {
    const startedAt = Date.now();
    const url = new URL(`${this.baseUrl}/api/${endpoint}`);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const durationMs = Date.now() - startedAt;
    const responseBytes = Buffer.byteLength(text, "utf8");

    if (!response.ok) {
      this.logCollectionReturn({
        endpoint,
        method,
        response: null,
        status: response.status,
        durationMs,
        responseBytes,
      });
      throw new Error(`[${method}] ${endpoint} failed (${response.status}): ${text}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      this.logCollectionReturn({
        endpoint,
        method,
        response: null,
        status: response.status,
        durationMs,
        responseBytes,
      });
      throw err;
    }
    if (data.failed) {
      this.logCollectionReturn({
        endpoint,
        method,
        response: data,
        status: response.status,
        durationMs,
        responseBytes,
      });
      throw new Error(`[${method}] ${endpoint} returned failed=true: ${JSON.stringify(data.error)}`);
    }

    this.logCollectionReturn({
      endpoint,
      method,
      response: data,
      status: response.status,
      durationMs,
      responseBytes,
    });
    return data;
  }

  logCollectionReturn({ endpoint, method, response, status, durationMs, responseBytes }) {
    const result = response?.result;
    const summary = {
      status,
      durationMs,
      responseBytes,
      ok:
        status >= 200 &&
        status < 300 &&
        (response?.failed === false || response?.failed === undefined),
      hasResult: Boolean(result && typeof result === "object"),
      resultKeys: result && typeof result === "object" ? Object.keys(result) : [],
      statsCount: Array.isArray(result?.stats) ? result.stats.length : null,
      playersCount: Array.isArray(result?.players) ? result.players.length : null,
      logsCount: Array.isArray(result?.logs) ? result.logs.length : null,
    };

    console.log(`[rcon] [${method}] ${endpoint} return`, summary);
  }
}

module.exports = { RconClient };
