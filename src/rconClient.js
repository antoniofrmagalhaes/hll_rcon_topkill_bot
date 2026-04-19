class RconClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async get(endpoint) {
    return this.request(endpoint, "GET");
  }

  async post(endpoint, body = {}) {
    return this.request(endpoint, "POST", body);
  }

  async request(endpoint, method, body) {
    const url = `${this.baseUrl}/api/${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[${method}] ${endpoint} failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (data.failed) {
      throw new Error(`[${method}] ${endpoint} returned failed=true: ${JSON.stringify(data.error)}`);
    }

    this.logCollectionReturn({ endpoint, method, response: data });
    return data;
  }

  logCollectionReturn({ endpoint, method, response }) {
    const result = response?.result;
    const summary = {
      ok: response?.failed === false || response?.failed === undefined,
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
