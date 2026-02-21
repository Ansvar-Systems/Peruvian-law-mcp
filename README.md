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

Official legal text from Diario Oficial El Peruano (`busquedas.elperuano.pe`), ingested from the public
HTML endpoint `https://busquedas.elperuano.pe/api/visor_html/{op}` for a curated set of cybersecurity,
digital-governance, and personal-data-protection norms.

## License

Apache-2.0
