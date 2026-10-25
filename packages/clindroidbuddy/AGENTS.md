# Clinical Statistical Programming Guide

## Directory Standards

All clinical data projects must adhere to the following structure to ensure automated traceability and consistent path management:

| Directory | Purpose | Contents |
|---|---|---|
| `docs/` | General study documents | Protocol, Statistical Analysis Plan (SAP), etc. |
| `dict/` | Dictionaries | CDISC Terminology files and other dictionaries |
| `docs/specs/adam/` | ADaM specifications | define.xml, adrg.pdf, analysis datasets documentation |
| `docs/specs/sdtm/` | SDTM specifications | define.xml, acrf.pdf, csdrg.pdf, domain mappings |
| `docs/specs/tfls/` | TFL Specs | TFL specifications |
| `docs/specs/shells/` | TFL Shell templates | TFL Shell templates |
| `docs/standards/adam/` | ADaM IG source documents | PDF/DOCX indexed by `standard_doc_search` for cited IG lookups |
| `docs/standards/sdtm/` | SDTM IG source documents | PDF/DOCX indexed by `standard_doc_search` for cited IG lookups |
| `data/sdtm/` | SDTM datasets (`.xpt`, `.json`) + related files (`acrf.pdf`, `define.xml`, etc.) | Stored SDTM datasets with related files |
| `data/adam/` | ADaM datasets (`.xpt`, `.json`) + related files (`define.xml`, `adrg.pdf`, etc.) | Stored ADaM datasets with related files |
| `programs/sdtm/` | SDTM R programs | Dataset generation scripts (e.g., `ae.r`) |
| `programs/adam/` | ADaM R programs | Dataset generation scripts (e.g., `adadsl.r`) |
| `programs/tfls/` | TFL R programs | Tables, Figures, and Listings generation scripts |
| `tfls/` | Generated outputs & TFL metadata | JSON, PDF, and other generated output files |

**File names are lowercase.** Every file a project produces that may be submitted to a regulator — datasets (`.xpt`, `.json`), `define.xml`, programs (`.r`) and TFL outputs (`.json`, `.rtf`, `.pdf`) — has an all-lowercase file name, extension included (e.g. `data/adam/adsl.xpt`, `programs/adam/adadsl.r`, `tfls/table_14_2_01.rtf`). This is a submission requirement, not a style preference: when a name requested by the user or given in a spec contains an uppercase letter, write the file under the lowercased name and say so in the response.

## CDISC Standards Versions

Declares the exact CDISC standard versions this project must comply with. Skills that build
ADaM/SDTM datasets or specifications (e.g. `adam-spec-creator`, `adam-dataset-inventory`) read
these values directly and must never assume "latest" — populate every field below before running
them. Terminology fields take one or more package versions, as dates in `yyyy-mm-dd` format,
comma-separated.

| Field | SDTM | ADaM |
|---|---|---|
| `version` (Model version) | 2.0 | 2.1 |
| `ig-version` (Implementation Guide version) | 3.4 | 1.3 |
| `define-xml-version` | 2.1 | 2.1 |
| `{std}-terminology` (Controlled Terminology package(s)) | 2026-03-27 | 2026-03-27 |
| `define-xml-terminology` (Define-XML CT package(s)) | 2026-03-27 | 2026-03-27 |


## Dataset Standards

**Coverage: SDTM, ADaM**

- **Naming Conventions**
    - Enforce domain prefixes (`DM`, `AE`, `EX`, `LB`, `ADSL`, `ADAE`, `ADPP`, etc.)
    - Variable names must be uppercase and conform to CDISC standard names (`USUBJID`, `AVAL`, `ASTDTM`, `PARAMCD`, etc.)
    - Column order must match CDISC-defined ordering
- **Dataset Joining**
    - Join keys must use CDISC standard keys (`USUBJID`, `SUBJID`, `VISITNUM`, `PARAMCD`, etc.)
    - Join types must be explicit per domain definition (`one-to-one`, `one-to-many`, etc.)
- **Variable Attributes**
    - Every variable must define label, length, and format (e.g., `label='Analysis Value'`)
    - Missing value representation must be standardized using R's `NA`, `NA_character_`, etc.
- **Validation**
    - Define per-domain integrity check functions
    - Validate consistency against CDISC define.xml via automated checks

## Module Shape

**Target: R**

- **R Module Organization**
    - Split per-domain into package-level or function files (e.g., `programs/sdtm/ae.r`, `programs/adam/adadsl.r`)
    - Declare dependencies explicitly with `library()` / `require()`
    - All public functions must carry `roxygen2`-style documentation
- **Shared Patterns**
    - Separate data input → preprocessing → analysis → output into distinct pipeline stages
    - Consolidate constants (date formats, missing value codes, etc.) into shared modules

## Statistical Rules

- **Reproducibility**
    - R: Mandatory `set.seed()` calls; use `renv` for dependency version pinning
- **Data Processing**
    - R: Unified `dplyr` / `tidyr` pipeline style; use `mutate` for immutable-style updates
    - Minimize mutable state updates
- **Date & Time Handling**
    - R: Unified `POSIXct` timestamps; use only `hms` / `lubridate`
- **Analysis Function Design**
    - Input and output dataset names must be explicit arguments
    - Return value structures must be documented
    - Errors must produce clear messages and halt execution using `stop()`

## TFL Generation Rules

- **Tables**
    - Standardize output formats (JSON)
    - R: Use the appropriate table-generation skill (`r-coder-complex-table`, `clinical-bds-multi-param`, or `clinical-categorical-single-factor`) to generate Clindroid ARD JSON output.
    - Headers, footnotes, and overall annotations must follow the SAP and Mock-shell specifications.
- **Output Management**
    - Version multiple outputs from the same analysis (`_v1`, `_v2` suffixes)
    - Centralize all TFL output paths via a shared config

## Audit Trail & Traceability

- **Traceability**
    - Each dataset's generation logic must be documented with traceability comments (e.g., `# Derived from RM001; ADaM IG v1.4`)
    - R: Log package versions and dependency histories
- **Code Change History**
    - Each file header must contain a change history comment (`# Rev: Date, Author, Change`)
    - Map analysis procedures to the SAP (Statistical Analysis Plan) via comments or metadata
- **Audit-Ready Outputs**
    - Every TFL must include: `Generated by [script] on [timestamp]`
    - R version and key package versions must be logged
    - Verify input vs. output row and variable counts as a reconciliation check

# Agent Rules for Avoiding Loops
- **[Declaration of Completion]** When you determine a task is complete, always output a summary, explicitly declare the completion of the task, and stop executing tools completely.
- **[Error Limit]** If the same error occurs twice in a row, immediately stop attempting to fix it yourself and ask the user for further instructions.
- **[Change of Approach]** If the previous approach fails, never repeat the exact same code or command.
