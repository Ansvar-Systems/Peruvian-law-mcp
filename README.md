# Peruvian Law MCP

Peruvian law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add peruvian-law --transport http https://peruvian-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/peruvian-law-mcp
```

## Data Sources

Official legal text from Diario Oficial El Peruano (`busquedas.elperuano.pe`).

- Discovery/indexing: `https://busquedas.elperuano.pe/api/graphql` via `getGenericPublication`
- Full text: `https://busquedas.elperuano.pe/api/visor_html/{op}`

Current ingestion mode targets full law corpus categories (e.g., `LEY`, `DECRETO LEGISLATIVO`,
`DECRETO DE URGENCIA`, `RESOLUCION LEGISLATIVA`) within the configured date range.

## License

Apache-2.0
