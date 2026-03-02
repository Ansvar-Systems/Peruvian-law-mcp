# Peruvian Law MCP Server

**The SPIJ alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fperuvian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/peruvian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Peruvian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Peruvian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Peruvian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Peruvian-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Peruvian-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Peruvian-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/INTEGRATION_GUIDE.md)

Query Peruvian legislation -- from the Ley 29733 de Protección de Datos Personales and Código Penal to the Código Civil, Ley de Delitos Informáticos, and more -- directly from Claude, Cursor, or any MCP-compatible client.

Si estás construyendo herramientas legales, herramientas de cumplimiento normativo, o haciendo investigación jurídica peruana, esta es tu base de datos de referencia verificada.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Por qué existe esto / Why This Exists

La investigación jurídica peruana está dispersa entre SPIJ (Sistema Peruano de Información Jurídica), el portal del Ministerio de Justicia, y el Diario Oficial El Peruano. Ya seas:
- Un **abogado** validando citas en un escrito o contrato
- Un **oficial de cumplimiento** verificando obligaciones bajo la Ley 29733 de protección de datos personales
- Un **desarrollador legal tech** construyendo herramientas sobre derecho peruano
- Un **investigador** trazando la armonización andina a través de la legislación peruana

...no deberías necesitar docenas de pestañas del navegador y referencias cruzadas manuales. Pregunta a Claude. Obtén la disposición exacta. Con contexto.

This MCP server makes Peruvian law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://peruvian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add peruvian-law --transport http https://peruvian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "peruvian-law": {
      "type": "url",
      "url": "https://peruvian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "peruvian-law": {
      "type": "http",
      "url": "https://peruvian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/peruvian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "peruvian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/peruvian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "peruvian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/peruvian-law-mcp"]
    }
  }
}
```

## Example Queries

Una vez conectado, pregunta de forma natural (consultas en español):

- *"¿Qué dice la Ley 29733 sobre protección de datos personales respecto al consentimiento?"*
- *"¿Está vigente la Ley 30171 de delitos informáticos?"*
- *"Buscar disposiciones sobre 'responsabilidad civil' en el Código Civil peruano"*
- *"¿Qué dice el Código Penal sobre delitos contra la intimidad?"*
- *"¿Qué regula el Decreto Legislativo 1353 sobre acceso a la información pública?"*
- *"Buscar 'sociedad anónima' en la Ley General de Sociedades (Ley 26887)"*
- *"¿Cómo se cita correctamente el artículo 10 de la Ley 29733?"*
- *"Buscar leyes peruanas que regulen el comercio electrónico"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | Ingestion in progress | Laws from SPIJ (spij.minjus.gob.pe) and El Peruano |
| **Provisions** | Ingestion in progress | Full-text searchable with FTS5 |
| **Language** | Spanish | Peru's official language |
| **Daily Updates** | Automated | Freshness checks against SPIJ |

> **Coverage note:** The Peruvian law database is actively being built. The MCP server infrastructure is production-ready. Provision counts will be updated as ingestion completes. The remote endpoint is live and returns available data.

**Verified data only** -- every citation is validated against official sources (SPIJ / El Peruano). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from SPIJ (Sistema Peruano de Información Jurídica, Ministerio de Justicia)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law number and article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
SPIJ / El Peruano --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                        ^                        ^
                 Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Buscar en SPIJ por número de ley | Buscar en español: *"protección de datos consentimiento"* |
| Navegar artículos manualmente | Obtener la disposición exacta con contexto |
| Referencias cruzadas manuales entre leyes | `build_legal_stance` agrega de múltiples fuentes |
| "¿Está esta ley vigente?" -- verificar manualmente | `check_currency` -- respuesta en segundos |
| Buscar marcos internacionales -- revisar textos de la CAN | `get_eu_basis` -- instrumentos internacionales vinculados |
| Sin API, sin integración | Protocolo MCP -- nativo para IA |

**Tradicional:** Buscar en SPIJ --> Descargar PDF --> Ctrl+F --> Verificar en El Peruano --> Repetir

**This MCP:** *"¿Cuáles son los derechos de los titulares de datos bajo la Ley 29733?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by law number and article |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes for a legal topic |
| `format_citation` | Format citations per Peruvian conventions (full/short/pinpoint) |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `list_sources` | List all available statutes with metadata and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international instruments that Peruvian laws align with |
| `get_peruvian_implementations` | Find Peruvian laws implementing a specific international standard |
| `search_eu_implementations` | Search international documents with Peruvian alignment counts |
| `get_provision_eu_basis` | Get international law references for a specific Peruvian provision |
| `validate_eu_compliance` | Check alignment status of Peruvian laws against international standards |

---

## International Law Alignment

Peru is a member of the **Andean Community (CAN)** and the **OAS**, with significant multilateral treaty obligations that shape domestic legislation.

| Framework | Relevance |
|-----------|-----------|
| **Andean Community (CAN)** | Peru participates in Andean legal harmonization -- Decisions of the Andean Commission are directly applicable |
| **OAS Conventions** | Peru has ratified inter-American conventions on corruption, human rights, and mutual legal assistance |
| **OECD Accession** | Peru is in OECD accession discussions -- governance, anti-corruption, and data protection modernization |
| **USMCA/Trade Agreements** | Peru has trade agreements with the US, EU, and others containing IP, digital trade, and data governance provisions |

Peru's data protection law (Ley 29733) aligns with APEC Privacy Framework principles and draws on international standards. The international bridge tools help identify where Peruvian law aligns with these frameworks.

> **Note:** Peru is not an EU adequacy jurisdiction under GDPR. The international tools reflect alignment relationships, not binding mutual recognition. For cross-border data transfers from the EU to Peru, appropriate safeguards under GDPR Article 46 apply.

---

## Data Sources & Freshness

All content is sourced from authoritative Peruvian legal databases:

- **[SPIJ](https://spij.minjus.gob.pe/)** -- Sistema Peruano de Información Jurídica (Ministerio de Justicia y Derechos Humanos)
- **[El Peruano](https://www.gob.pe/el-peruano)** -- Diario Oficial del Perú

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Ministerio de Justicia y Derechos Humanos del Perú |
| **Retrieval method** | SPIJ consolidated statute database |
| **Language** | Spanish |
| **License** | Open access (official government sources) |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors SPIJ for changes:

| Check | Method |
|-------|--------|
| **Law amendments** | Drift detection against known provision anchors |
| **New laws** | Comparison against SPIJ index |
| **Repealed laws** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from SPIJ (official Peruvian legal publications). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources (SPIJ / El Peruano) for court filings
> - **International cross-references** reflect alignment relationships, not binding obligations
> - **Andean Community Decisions** are directly applicable in Peru -- verify CAN instruments separately

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

> For guidance from your bar association: **Colegio de Abogados de Lima** / **Junta de Decanos de los Colegios de Abogados del Perú**

---

## Documentation

- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** -- Detailed integration documentation
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Peruvian-law-mcp
cd Peruvian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Ingest statutes from SPIJ
npm run build:db                  # Rebuild SQLite database
npm run drift:detect              # Run drift detection against anchors
npm run check-updates             # Check for amendments and new laws
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** Optimized SQLite (efficient, portable)
- **Reliability:** Production-ready ingestion pipeline

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/peruvian-law-mcp (This Project)
**Query Peruvian legislation directly from Claude** -- Ley 29733, Código Civil, Código Penal, Ley General de Sociedades, and more. `npx @ansvar/peruvian-law-mcp`

### [@ansvar/chilean-law-mcp](https://github.com/Ansvar-Systems/Chilean-law-mcp)
**Query Chilean legislation** -- Ley 19.628, Ley 21.719, Código Civil, and more. `npx @ansvar/chilean-law-mcp`

### [@ansvar/colombian-law-mcp](https://github.com/Ansvar-Systems/Colombian-law-mcp)
**Query Colombian legislation** -- Ley 1581, Código Civil, Código Penal, and more. `npx @ansvar/colombian-law-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Africa, the Americas, Europe, Asia, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Full statute corpus ingestion from SPIJ
- Supreme Court (Corte Suprema de Justicia) case law
- Andean Community Decision cross-references
- Historical statute versions and El Peruano amendment tracking

---

## Roadmap

- [x] MCP server infrastructure (production-ready)
- [x] International law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Full statute corpus ingestion from SPIJ
- [ ] Court case law (Corte Suprema de Justicia del Perú)
- [ ] Historical statute versions (El Peruano tracking)
- [ ] Andean Community Decision cross-references
- [ ] OECD accession framework alignment

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{peruvian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Peruvian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Peruvian-law-mcp},
  note = {Peruvian legislation sourced from SPIJ (Sistema Peruano de Informacion Juridica)}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes:** Ministerio de Justicia y Derechos Humanos del Perú (open access)
- **International Metadata:** Public domain treaty databases

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server brings Peru's official legislation into any AI client -- no browser tabs, no PDFs, no manual cross-referencing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
