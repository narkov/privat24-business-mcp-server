# Privat24 Business MCP Server

Unofficial Model Context Protocol server for the [Privat24 Business API](https://smebank.privatbank.ua/ua/developers).

This project exposes practical MCP tools for account statements, balances, transactions, payment creation, and exchange-rate lookups so an MCP-compatible client can work with Privat24 Business through structured tool calls instead of custom glue code.

This repository is not affiliated with, endorsed by, or maintained by PrivatBank.

## What It Covers

- token-authenticated access to the Privat24 Business Autoclient API
- account and card discovery through statement settings
- balances and transactions for date ranges
- interim and final statement endpoints
- payment creation through the business API
- current and historical exchange-rate lookups through PrivatBank's public API
- a raw API tool for unsupported endpoints

## Real Use Cases

- finance copilots that answer "show the balances for yesterday and flag accounts with low cash"
- treasury assistants that collect statement activity for a date range and summarize outgoing payments
- operations bots that fetch interim transactions during the day and compare them with final statements later
- internal accounting workflows that prepare payment drafts from natural-language requests and send them to `/payment/create`
- support or back-office agents that need a safe MCP layer instead of direct API scripting
- multi-tool automations that combine Privat24 Business data with ERP, CRM, BI, or reconciliation systems

## Official References

- PrivatBank SME developer portal: <https://smebank.privatbank.ua/ua/developers>
- Privat24 Business API integration docs: <https://integration.privatbank.ua/ua/docs/p24business/>
- Autoclient API overview: <https://integration.privatbank.ua/ua/docs/p24business/autoclient.html>
- Statement settings: <https://integration.privatbank.ua/ua/docs/p24business.html#api-StatementSettings>
- Balances and statements: <https://integration.privatbank.ua/ua/docs/p24business.html#api-Istoriyaizmenenijnabalanse>
- Payment creation: <https://integration.privatbank.ua/ua/docs/p24business.html#api-Sozdanieplatezha>
- Public exchange rates API: <https://api.privatbank.ua/#p24/exchange>
- Model Context Protocol: <https://modelcontextprotocol.io/introduction>

## Tools

- `privat24_business_auth`: verifies that the configured token can access the business API
- `privat24_business_get_settings`: returns statement settings, cards, and related metadata
- `privat24_business_get_balances`: returns balances from `/statements/balance`
- `privat24_business_get_transactions`: returns statement transactions from `/statements`
- `privat24_business_get_interim_balances`: returns data from `/statements/interim/balance`
- `privat24_business_get_interim_transactions`: returns data from `/statements/interim/transactions`
- `privat24_business_get_final_balances`: returns data from `/statements/final/balance`
- `privat24_business_get_final_transactions`: returns data from `/statements/final/transactions`
- `privat24_business_create_payment`: posts a JSON payment payload to `/payment/create`
- `privat24_business_get_exchange_rates`: returns current rates from the public PrivatBank API
- `privat24_business_get_exchange_rate_history`: returns historical rates for a `DD.MM.YYYY` date
- `privat24_business_call_api`: raw authenticated business API call for unsupported endpoints

## Environment

Copy `.env.example` to `.env` and configure:

- `PRIVAT24_BUSINESS_TOKEN`: required token from Privat24 Business / Autoclient API access
- `PRIVAT24_BUSINESS_BASE_URL`: defaults to `https://acp.privatbank.ua/api`
- `PRIVATBANK_PUBLIC_API_BASE_URL`: defaults to `https://api.privatbank.ua`

## Install

```bash
npm install
```

## Run

```bash
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

## MCP Configuration Example

```json
{
  "mcpServers": {
    "privat24-business": {
      "command": "node",
      "args": [
        "D:/usr/www/mcp-dev/privat24-business-mcp-server/dist/index.js"
      ],
      "env": {
        "PRIVAT24_BUSINESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Example Workflows

### 1. Verify access

Ask your MCP client:

`Verify my Privat24 Business token and show the available statement settings.`

The client should call `privat24_business_auth` or `privat24_business_get_settings`.

### 2. Summarize outgoing cash movement

`Get transactions from 2026-03-01 to 2026-03-15 and summarize the largest outgoing payments.`

The client should call `privat24_business_get_transactions` with:

```json
{
  "from": "2026-03-01",
  "to": "2026-03-15"
}
```

### 3. Compare interim and final activity

`Show the interim transactions for 2026-03-15, then compare them with the final transactions for the same day.`

The client should call:

- `privat24_business_get_interim_transactions`
- `privat24_business_get_final_transactions`

### 4. Create a payment draft

`Create a payment using this business API payload.`

The client should call `privat24_business_create_payment` with a payload shaped to your Privat24 Business integration requirements.

Example:

```json
{
  "payload": {
    "payerAccount": "26000000000000",
    "recipientAccount": "26000000000001",
    "recipientCode": "12345678",
    "recipientName": "Example LLC",
    "amount": 1500.25,
    "purpose": "Invoice 42"
  }
}
```

Use the official payment documentation above to adapt field names to your integration profile.

### 5. Reach an unsupported endpoint

`Call the raw business API endpoint /some/custom/path with these query parameters.`

The client should call `privat24_business_call_api`.

## Notes

- The business API implementation in this repository assumes the documented Autoclient base URL `https://acp.privatbank.ua/api`.
- Current and historical FX tools use PrivatBank's public API, which does not require the business token.
- Payment payload requirements can vary by workflow. This server intentionally leaves the payload flexible and forwards your JSON as-is.
- If you need more endpoints, start with `privat24_business_call_api`, validate the request shape against the official docs, and then add a dedicated tool.

## License

MIT