/**
 * Search Pagination Example Implementation
 *
 * This example shows how to implement cursor-based pagination for a CLI
 * search command that queries the Vellar Bazaar discovery endpoint.
 *
 * Key points:
 * - Uses cursor-based pagination from the facilitator API
 * - Displays pagination hints to users when more results exist
 * - Preserves query and limit parameters in pagination suggestions
 * - Handles both successful searches and error cases gracefully
 */

import { Command } from "commander";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/** One payment option a resource accepts. */
interface Accept {
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
}

/** One searchable catalog entry. */
interface CatalogResource {
  resource?: string;
  serviceName?: string;
  description?: string;
  accepts?: Accept[];
  trust?: { settlements?: number; uniquePayers?: number };
}

/** Pagination metadata from the facilitator. */
interface PaginationInfo {
  limit?: number;
  cursor?: string | null;
}

/** The full search response from /discovery/search. */
interface SearchResponse {
  resources?: CatalogResource[];
  partialResults?: boolean;
  pagination?: PaginationInfo;
}

/** Parsed command-line options. */
interface SearchOptions {
  facilitator: string;
  limit: string;
  cursor?: string;
  json?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FORMATTING & DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single catalog resource for terminal display.
 * Shows: URL, service name, payment options, description, and trust signals.
 */
function renderResource(r: CatalogResource): string {
  const lines: string[] = [];

  // Always show the resource URL (or a placeholder if missing)
  lines.push(r.resource ?? "(no resource URL)");

  // Service name is optional metadata
  if (r.serviceName) {
    lines.push(`  ${r.serviceName}`);
  }

  // Payment options: one line per scheme+network combination
  for (const a of r.accepts ?? []) {
    const scheme = a.scheme ?? "unknown";
    const network = a.network ?? "unknown";
    lines.push(`  ${scheme} on ${network}: ${a.amount ?? "?"} base units of ${a.asset ?? "?"}`);
  }

  // Description is seller-provided, so clamp its length
  if (r.description) {
    const d = r.description.length > 200 ? `${r.description.slice(0, 200)}...` : r.description;
    lines.push(`  ${d}`);
  }

  // Trust signals: observed on-chain, so factual rather than seller-supplied
  const t = r.trust;
  if (t && (t.settlements !== undefined || t.uniquePayers !== undefined)) {
    lines.push(`  trust: ${t.settlements ?? 0} settlements, ${t.uniquePayers ?? 0} unique payers`);
  }

  return lines.join("\n");
}

/**
 * Display a pagination hint to fetch the next page.
 * Preserves query, limit, and cursor in the suggested command.
 */
function displayPaginationHint(query: string, limit: string, cursor: string): void {
  console.log("");
  console.log("More results available. View next page with:");
  console.log(`  vellar search "${query}" --limit ${limit} --cursor "${cursor}"`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. API INTERACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the search URL with query, limit, and optional cursor.
 *
 * The facilitator /discovery/search endpoint accepts:
 * - query (required): search string
 * - limit (optional): max results per page
 * - cursor (optional): pagination cursor for continuation
 */
function buildSearchUrl(facilitatorUrl: string, query: string, limit: string, cursor?: string): URL {
  const url = new URL("/discovery/search", facilitatorUrl);

  // Note: the endpoint parameter is 'query', not 'q'
  url.searchParams.set("query", query);
  url.searchParams.set("limit", limit);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return url;
}

/**
 * Execute a search query and return the parsed response.
 *
 * Throws on network errors or non-OK HTTP status.
 */
async function fetchSearch(url: URL): Promise<SearchResponse> {
  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as SearchResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SEARCH COMMAND IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FACILITATOR_URL = "https://vellar-facilitator.onrender.com";

export function makeSearchCommand(): Command {
  return new Command("search")
    .description("Search the Vellar Bazaar for payable resources")
    .argument("<query>", "Natural language search query")
    .option(
      "--facilitator <url>",
      "Facilitator URL",
      process.env.VELLAR_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL,
    )
    // PAGINATION OPTIONS:
    // --limit controls results per page (default 10)
    .option("--limit <n>", "Maximum results per page", "10")
    // --cursor enables pagination (pass the cursor from a previous response)
    .option("--cursor <cursor>", "Pagination cursor for the next page")
    // JSON output for programmatic use
    .option("--json", "Output raw JSON")
    .action(async (query: string, opts: SearchOptions) => {
      try {
        // 1. BUILD THE URL
        const url = buildSearchUrl(opts.facilitator, query, opts.limit, opts.cursor);

        // 2. FETCH THE RESPONSE
        const data = await fetchSearch(url);

        // 3. OUTPUT: JSON MODE
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        // 4. OUTPUT: FORMATTED MODE
        const results = data.resources ?? [];

        // Handle empty results
        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        // Render each result
        for (const r of results) {
          console.log("");
          console.log(renderResource(r));
        }

        // 5. PARTIAL RESULTS WARNING (Voyage outage)
        if (data.partialResults) {
          console.log("");
          console.log("Note: partial results. Part of the search pipeline was unavailable.");
        }

        // 6. PAGINATION HINT
        // If the response includes a cursor, there are more results available.
        // Display a helpful hint with the exact command to fetch the next page.
        if (data.pagination?.cursor) {
          displayPaginationHint(query, opts.limit, data.pagination.cursor);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. USAGE NOTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EXAMPLE USAGE:
 *
 * First page (default 10 results):
 *   $ vellar search "weather api"
 *
 * Output:
 *   https://weather.example/api
 *     Weather Service
 *     exact on stellar:testnet: 500 base units of USDC
 *     Real-time weather data
 *
 *   https://forecast.example/api
 *     Forecast Service
 *     exact on stellar:testnet: 750 base units of USDC
 *
 *   More results available. View next page with:
 *     vellar search "weather api" --limit 10 --cursor "eyJvZmZzZXQiOjEwfQ=="
 *
 * Next page (using cursor from previous response):
 *   $ vellar search "weather api" --limit 10 --cursor "eyJvZmZzZXQiOjEwfQ=="
 *
 * Custom page size:
 *   $ vellar search "weather api" --limit 25
 *
 * Programmatic use (raw JSON):
 *   $ vellar search "weather api" --json | jq '.resources[].resource'
 */

// ─────────────────────────────────────────────────────────────────────────────
// 6. IMPLEMENTATION CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When implementing cursor-based pagination for a search command:
 *
 * □ Define PaginationInfo interface with limit and cursor fields
 * □ Define SearchResponse interface matching facilitator API
 * □ Register --limit option with sensible default (e.g., "10")
 * □ Register --cursor option (optional)
 * □ Add cursor to URL query params when provided
 * □ Parse pagination.cursor from response
 * □ Display pagination hint when cursor is truthy
 * □ Include query and limit in pagination hint
 * □ Handle null cursor (no more results) gracefully
 * □ Handle empty results array
 * □ Test with mocked responses > 1 page
 * □ Test pagination hint formatting
 * □ Test error handling and retries
 */
