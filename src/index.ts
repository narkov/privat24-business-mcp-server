import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type HttpMethod = "GET" | "POST";

class Privat24ApiError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = "Privat24ApiError";
  }
}

class Privat24BusinessClient {
  private readonly businessBaseUrl: string;
  private readonly publicBaseUrl: string;
  private readonly token: string;

  constructor() {
    this.businessBaseUrl = this.normalizeBaseUrl(
      process.env.PRIVAT24_BUSINESS_BASE_URL ?? "https://acp.privatbank.ua/api",
    );
    this.publicBaseUrl = this.normalizeBaseUrl(
      process.env.PRIVATBANK_PUBLIC_API_BASE_URL ?? "https://api.privatbank.ua",
    );
    this.token = process.env.PRIVAT24_BUSINESS_TOKEN ?? "";

    if (!this.token) {
      throw new Error("PRIVAT24_BUSINESS_TOKEN is required");
    }
  }

  async getSettings(): Promise<Json> {
    return this.requestBusiness("GET", "/statements/settings");
  }

  async getBalances(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements/balance", params);
  }

  async getTransactions(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements", params);
  }

  async getInterimBalances(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements/interim/balance", params);
  }

  async getInterimTransactions(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements/interim/transactions", params);
  }

  async getFinalBalances(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements/final/balance", params);
  }

  async getFinalTransactions(params: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("GET", "/statements/final/transactions", params);
  }

  async createPayment(payload: Record<string, Json>): Promise<Json> {
    return this.requestBusiness("POST", "/payment/create", undefined, payload);
  }

  async callBusinessApi(args: {
    method: HttpMethod;
    path: string;
    query?: Record<string, Json>;
    body?: Record<string, Json>;
  }): Promise<Json> {
    return this.requestBusiness(args.method, args.path, args.query, args.body);
  }

  async getCurrentExchangeRates(coursid = 5): Promise<Json> {
    return this.requestPublic("/p24api/pubinfo", {
      json: "",
      exchange: "",
      coursid,
    });
  }

  async getExchangeRateHistory(date: string): Promise<Json> {
    return this.requestPublic("/p24api/exchange_rates", {
      json: "",
      date,
    });
  }

  private async requestBusiness(
    method: HttpMethod,
    path: string,
    query?: Record<string, Json>,
    body?: Record<string, Json>,
  ): Promise<Json> {
    return this.request({
      method,
      baseUrl: this.businessBaseUrl,
      path,
      headers: {
        token: this.token,
      },
      query,
      body,
    });
  }

  private async requestPublic(
    path: string,
    query?: Record<string, Json>,
  ): Promise<Json> {
    return this.request({
      method: "GET",
      baseUrl: this.publicBaseUrl,
      path,
      query,
    });
  }

  private async request(args: {
    method: HttpMethod;
    baseUrl: string;
    path: string;
    headers?: Record<string, string>;
    query?: Record<string, Json>;
    body?: Record<string, Json>;
  }): Promise<Json> {
    const url = new URL(`${args.baseUrl}${this.normalizePath(args.path)}`);

    if (args.query) {
      for (const [key, value] of Object.entries(args.query)) {
        if (value === undefined || value === null) {
          continue;
        }

        if (Array.isArray(value) || typeof value === "object") {
          url.searchParams.set(key, JSON.stringify(value));
          continue;
        }

        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method: args.method,
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "content-type": "application/json; charset=utf-8",
        ...args.headers,
      },
      body: args.body ? JSON.stringify(args.body) : undefined,
    });

    const text = await response.text();
    const data = text ? this.tryParseJson(text) : null;

    if (!response.ok) {
      throw new Privat24ApiError(
        `Privat24 API request failed with HTTP ${response.status}`,
        data ?? text,
      );
    }

    if (this.looksLikeApiError(data)) {
      throw new Privat24ApiError("Privat24 API returned an error payload", data);
    }

    return data;
  }

  private looksLikeApiError(data: Json): boolean {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return false;
    }

    const record = data as Record<string, Json>;
    return Boolean(record.error || record.errors || record.status === "error");
  }

  private normalizeBaseUrl(value: string): string {
    return value.replace(/\/+$/g, "");
  }

  private normalizePath(value: string): string {
    const normalized = value.replace(/^\/+/, "");
    return `/${normalized}`;
  }

  private tryParseJson(value: string): Json {
    try {
      return JSON.parse(value) as Json;
    } catch {
      return value;
    }
  }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const historyDateSchema = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Use DD.MM.YYYY");
const querySchema = z.record(z.any()).optional();

const server = new McpServer({
  name: "privat24-business-mcp-server",
  version: "0.1.0",
});

const client = new Privat24BusinessClient();

function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function asRecord(value: Record<string, Json> | undefined): Record<string, Json> {
  return value ?? {};
}

server.registerTool(
  "privat24_business_auth",
  {
    title: "Verify Privat24 Business token",
    description: "Calls the statements settings endpoint to verify token access.",
    inputSchema: {},
  },
  async () => {
    const data = await client.getSettings();
    return jsonResponse({
      authenticated: true,
      settings_preview: data,
    });
  },
);

server.registerTool(
  "privat24_business_get_settings",
  {
    title: "Get statement settings",
    description: "Returns available cards, accounts, and statement-related settings.",
    inputSchema: {},
  },
  async () => jsonResponse(await client.getSettings()),
);

server.registerTool(
  "privat24_business_get_balances",
  {
    title: "Get balances",
    description: "Returns balances from /statements/balance for a date range or filtered cards.",
    inputSchema: {
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ from, to, card, filters }) => {
    return jsonResponse(
      await client.getBalances({
        ...asRecord(filters),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_get_transactions",
  {
    title: "Get transactions",
    description: "Returns statement transactions from /statements for a date range or filtered cards.",
    inputSchema: {
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ from, to, card, filters }) => {
    return jsonResponse(
      await client.getTransactions({
        ...asRecord(filters),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_get_interim_balances",
  {
    title: "Get interim balances",
    description: "Returns interim balances from /statements/interim/balance.",
    inputSchema: {
      date: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ date, card, filters }) => {
    return jsonResponse(
      await client.getInterimBalances({
        ...asRecord(filters),
        ...(date ? { date } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_get_interim_transactions",
  {
    title: "Get interim transactions",
    description: "Returns interim transactions from /statements/interim/transactions.",
    inputSchema: {
      date: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ date, card, filters }) => {
    return jsonResponse(
      await client.getInterimTransactions({
        ...asRecord(filters),
        ...(date ? { date } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_get_final_balances",
  {
    title: "Get final balances",
    description: "Returns end-of-day balances from /statements/final/balance.",
    inputSchema: {
      date: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ date, card, filters }) => {
    return jsonResponse(
      await client.getFinalBalances({
        ...asRecord(filters),
        ...(date ? { date } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_get_final_transactions",
  {
    title: "Get final transactions",
    description: "Returns end-of-day transactions from /statements/final/transactions.",
    inputSchema: {
      date: dateSchema.optional(),
      card: z.string().optional(),
      filters: querySchema,
    },
  },
  async ({ date, card, filters }) => {
    return jsonResponse(
      await client.getFinalTransactions({
        ...asRecord(filters),
        ...(date ? { date } : {}),
        ...(card ? { card } : {}),
      }),
    );
  },
);

server.registerTool(
  "privat24_business_create_payment",
  {
    title: "Create a payment",
    description: "Posts an arbitrary payment payload to /payment/create.",
    inputSchema: {
      payload: z.record(z.any()),
    },
  },
  async ({ payload }) => jsonResponse(await client.createPayment(payload)),
);

server.registerTool(
  "privat24_business_get_exchange_rates",
  {
    title: "Get current exchange rates",
    description: "Returns current PrivatBank exchange rates using the public API.",
    inputSchema: {
      coursid: z.number().int().optional(),
    },
  },
  async ({ coursid }) => jsonResponse(await client.getCurrentExchangeRates(coursid ?? 5)),
);

server.registerTool(
  "privat24_business_get_exchange_rate_history",
  {
    title: "Get historical exchange rates",
    description: "Returns exchange rates for a specific date using DD.MM.YYYY format.",
    inputSchema: {
      date: historyDateSchema,
    },
  },
  async ({ date }) => jsonResponse(await client.getExchangeRateHistory(date)),
);

server.registerTool(
  "privat24_business_call_api",
  {
    title: "Call Privat24 Business API",
    description: "Calls any business endpoint with arbitrary query parameters or JSON body.",
    inputSchema: {
      method: z.enum(["GET", "POST"]),
      path: z.string().min(1),
      query: querySchema,
      body: querySchema,
    },
  },
  async ({ method, path, query, body }) => {
    return jsonResponse(
      await client.callBusinessApi({
        method,
        path,
        query: asRecord(query),
        body: method === "POST" ? asRecord(body) : undefined,
      }),
    );
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Unknown startup error";
  console.error(message);
  process.exit(1);
});