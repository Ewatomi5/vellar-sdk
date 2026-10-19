# Search Pagination Implementation Guide

This guide documents how to implement cursor-based pagination for the Vellar Bazaar search feature, as implemented in `packages/cli/src/commands/search.ts`.

## Overview

The facilitator's `/discovery/search` endpoint supports cursor-based pagination to handle large result sets. Instead of truncating results silently, the implementation provides users with an explicit hint to fetch the next page.

## API Response Schema

The search endpoint returns:

```json
{
  "x402Version": 2,
  "resources": [
    {
      "resource": "https://example.test/api",
      "serviceName": "Example API",
      "description": "An example resource",
      "accepts": [
        {
          "scheme": "exact",
          "network": "stellar:testnet",
          "amount": "1000",
          "asset": "USDC"
        }
      ],
      "trust": {
        "settlements": 5,
        "uniquePayers": 3
      }
    }
  ],
  "partialResults": false,
  "pagination": {
    "limit": 10,
    "cursor": "next_page_cursor_abc123"
  }
}
```

### Key Fields

- **`resources`** - Array of catalog entries found (may be empty)
- **`partialResults`** - Boolean indicating if results are degraded (semantic search unavailable)
- **`pagination.limit`** - The limit used for this page
- **`pagination.cursor`** - Cursor for fetching next page, or `null` if no more results

## Implementation Steps

### 1. Add Pagination Interfaces

Define TypeScript interfaces to match the API response:

```typescript
interface PaginationInfo {
  limit?: number;
  cursor?: string | null;
}

interface SearchResponse {
  resources?: CatalogResource[];
  partialResults?: boolean;
  pagination?: PaginationInfo;
}
```

### 2. Add Command Options

Register `--limit` and `--cursor` options:

```typescript
.option("--limit <n>", "Maximum results per page", "10")
.option("--cursor <cursor>", "Pagination cursor for the next page")
```

### 3. Build URL with Pagination Parameters

When constructing the API request, include both `limit` and `cursor`:

```typescript
const url = new URL("/discovery/search", facilitatorUrl);
url.searchParams.set("query", query);
url.searchParams.set("limit", opts.limit);
if (opts.cursor) {
  url.searchParams.set("cursor", opts.cursor);
}
```

### 4. Display Pagination Hint

When the response includes a non-null cursor, display a hint to the user:

```typescript
if (data.pagination?.cursor) {
  console.log("");
  console.log("More results available. View next page with:");
  console.log(`  vellar search "${query}" --limit ${opts.limit} --cursor "${data.pagination.cursor}"`);
}
```

## Usage Examples

### First Page

```bash
vellar search "weather api"
```

Output:
```
https://example.test/weather
  Weather Service API
  exact on stellar:testnet: 500 base units of USDC

https://example.test/forecast
  Forecast API
  exact on stellar:testnet: 750 base units of USDC

More results available. View next page with:
  vellar search "weather api" --limit 10 --cursor "eyJvZmZzZXQiOjEwfQ=="
```

### Next Page

```bash
vellar search "weather api" --limit 10 --cursor "eyJvZmZzZXQiOjEwfQ=="
```

### Custom Page Size

```bash
vellar search "weather api" --limit 25
```

## Testing Pagination

### Unit Tests to Implement

1. **Cursor Registration**: Verify `--cursor` option exists
2. **URL Building**: Confirm cursor is added to URL when provided
3. **Pagination Hint Display**: Check hint appears when `pagination.cursor` is present
4. **No Hint When Done**: Verify no hint when cursor is `null`
5. **Large Result Sets**: Test handling of responses exceeding one page
6. **Empty Results**: Verify graceful handling of empty searches
7. **Error Cases**: Test failed search responses
8. **Parameter Preservation**: Confirm query and limit are preserved in hints

### Mock Response for Testing

```typescript
const mockResponse = {
  resources: [
    {
      resource: "https://example.test/api1",
      serviceName: "API 1",
      accepts: [{ scheme: "exact", network: "stellar:testnet", amount: "1000", asset: "USDC" }]
    },
    {
      resource: "https://example.test/api2",
      serviceName: "API 2",
      accepts: [{ scheme: "exact", network: "stellar:testnet", amount: "2000", asset: "USDC" }]
    }
  ],
  partialResults: false,
  pagination: { limit: 10, cursor: "abc123def456" }
};
```

## Key Design Decisions

### Cursor-Based vs Offset-Based

The implementation uses **cursor-based pagination** (not offset-based `--page` flag) because:
- The facilitator API supports cursors directly
- Cursors are stable across catalog updates
- Offset pagination is fragile when data changes between requests

### Explicit Hints Over Silent Truncation

The feature displays an explicit hint instead of silently truncating:
- Users know when more results exist
- The exact command to fetch the next page is provided
- Query and limit are preserved in the suggestion

### No Automatic Continuation

The implementation does not automatically fetch all pages:
- Users maintain control over when to fetch next page
- Prevents unexpected large data transfers
- Aligns with CLI conventions for pagination

## Integration with Existing Code

The implementation integrates with existing patterns:

- **Error handling** matches other command implementations
- **Output formatting** uses the existing `renderResource()` function
- **Voyage outage detection** preserves existing `partialResults` behavior
- **Code style** follows surrounding directory conventions

## Implementation Checklist

- [ ] Add `PaginationInfo` and `SearchResponse` interfaces
- [ ] Add `--limit` option with default "10"
- [ ] Add `--cursor` option
- [ ] Include cursor in API URL when provided
- [ ] Display pagination hint when `pagination.cursor` is truthy
- [ ] Add unit test for cursor registration
- [ ] Add unit test for pagination hint display
- [ ] Add unit test for no hint when no more results
- [ ] Add unit test for large result sets
- [ ] Add unit test for error handling
- [ ] Verify backward compatibility (cursor optional)
- [ ] Test with real facilitator instance
