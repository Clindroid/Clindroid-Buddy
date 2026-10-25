---
name: clindroid-ard-json
description: Defines the Clindroid ARD JSON Schema and output standards for clinical trial table data, ensuring machine-readable, traceable, and renderable outputs.
---

# Clindroid ARD JSON Standard

## 1. Output Directory & File Naming

- **Output Directory:** All Clindroid ARD JSON files are written to `tfls/` at the project root (e.g., `tfls/table_14_2_01.json`).
- **File Name Convention:** `{tfl_id}.json` — the value of the `tfl_id` field, with no prefix (e.g., when `tfl_id = "table_14_2_01"`, the output file is `table_14_2_01.json`). The program and the RTF share that stem: `programs/tfls/{tfl_id}.r` and `tfls/{tfl_id}.rtf`. When the user asks for a specific file name, its stem is the `tfl_id`.
- **Lowercase:** Every file name built from `tfl_id` — the program (`programs/tfls/{tfl_id}.r`), this JSON and the RTF — is all lowercase, extension included, because regulatory submissions require lowercase file names. `tfl_id` is therefore lowercase too; when the task gives one with an uppercase letter, lowercase it (and every file name built from it) and say so in the response. `render_ard_rtf()` stops when `tfl_id`, the program path or the RTF file name contains an uppercase letter.
- **Overwrite Policy:** Always overwrite the existing file at the same path (no version suffixes).

## 2. Illustrative Example

The following JSON block is a **schematic illustration only** — it shows the expected structure and field placement using placeholder data (protocol `"XYZ-123"`, treatment groups `Placebo`/`Active`). It must **not** be reproduced verbatim in any output. Replace every value with actual analysis results derived from the study datasets, following the rules defined in Section 3.

```jsonc
{ // Every value below is a placeholder. Replace each __PLACEHOLDER__ with actual analysis results from the study datasets. Do NOT output this JSON verbatim. Treatment group names in big_n MUST match the corresponding property names used in row objects. If "Total" is required by the TFL spec, it must appear in both big_n and as a property in every row object.
  "__PROTOCOL_NUMBER__": "<e.g. XYZ-123>",
  "__TFL_ID__": "<e.g. table_14_2_01>",
  "__TFL_NUMBER__": "<e.g. Table 14-2.01>",
  "__TFL_TITLE__": "<e.g. Summary of Demographics>",
  "__ANALYSIS_POPULATION__": "<e.g. Full Analysis Set (FAS)>",
  "__EXECUTION_DATETIME__": "<ISO 8601, e.g. 2026-07-05T14:30:00+09:00>",
  "__PROGRAM_PATH__": "<e.g. programs/tfls/table_14_2_01.r>",
  "__BIG_N__": { // keys are TREATMENT GROUP names (distinct from a row's `group` key, which names the analysis item), values are subject counts (integers)
    "__GROUP_A_NAME__": <N>,   // e.g. "Placebo": 40
    "__GROUP_B_NAME__": <N>,   // e.g. "Active": 42
    "Total": <SUM>              // sum of all group N values (omit if TFL spec does not require Total)
  },
  "__COLUMNS__": ["<COLUMN_HEADER_A>", "<COLUMN_HEADER_B>", ...], // array of column header strings — exactly ONE per column of the RENDERED table body, in display order. That includes the leading row-label column, whose header is often an empty string "" or a word like "Statistics"; it is a rendered column, so it gets an element. The treatment-group headers follow in the same order as the big_n keys (including "Total" if present), and any display-only column with no big_n key — e.g. a p-value column — gets its own header after them (see tfl-spec-writer §3b Column Layout for how these positions are determined). Structural keys that rows carry but the body never renders — `group`, `ord_group` (see __ROWS__) — get NO header here. length(columns) MUST equal ncol() of the table handed to rtf_body(), since col_rel_width is sized from it. Must be provided.
  "__FOOTNOTES__": [           // array of footnote objects sorted by ord; omit entire field or set to [] when no footnotes are needed
    {                          // first footnote: replace __LABEL__, __TEXT__ with actual values (label must be a single lowercase letter, e.g. "a")
      "__ORD__": 1,            // display order (integer, 1-based)
      "__LABEL__": "<letter>", // superscript label; reference it directly inside a row value's formatted string where needed, e.g. "0.045(a)"
      "__TEXT__": "<description>" // footnote text displayed below the table
    },                         // additional footnotes follow the same structure with incremented ord and next letter as label
  ],
  "__ROWS__": [                // array of row objects; each object is the direct JSON representation of one row of the final R analysis result dataframe. Property names and their meaning (row label, per-treatment-group values, p-values, etc.) are entirely determined by the R program per the TFL Spec — this schema does not fix or reserve any specific key names. Two keys are conventional rather than reserved: `group` (string, the analysis item's name, repeated on every row of that item) and `ord_group` (integer, 1-based, the same item's position) — the section boundaries the renderer rules from, produced by `r-coder-complex-table` §7. They are structural, not body columns: they appear in every row object but NOT in __COLUMNS__, so a row object normally holds two more keys than columns has elements. Omit entire field or set to [] when no rows are needed.
    {                          // schematic only — replace with the actual columns of this table's dataframe
      "__ORD_GROUP__": <N>,                      // e.g. 1 — integer, 1-based; this analysis item's display position. Structural: no entry in __COLUMNS__
      "__GROUP__": "<analysis item name>",       // e.g. "Age(y)" — the ANALYSIS ITEM this row belongs to, repeated identically on every row of that item (header row included). NOT a treatment group; treatment groups are the big_n keys below. Structural: no entry in __COLUMNS__
      "<label column, e.g. \"label\">": "<row description>",
      "__GROUP_A_NAME__": "<formatted value>",   // e.g. "10.5 (2.3)" for Mean (SD); key MUST match a big_n key
      "__GROUP_B_NAME__": "<formatted value>",   // e.g. "12.1 (1.8)"
      "Total": "<formatted value>"               // omit if Total not required by TFL spec
    }                         // additional rows follow the same set of columns as this table's dataframe; keep each analysis item's rows contiguous and sort the dataframe before conversion — array order IS the display order
  ]
}
```


## 3. Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protocol_number` | string | Yes | Protocol number of the clinical study (e.g., `"XYZ-123"`) |
| `tfl_id` | string | Yes | Machine-readable TFL identifier used for output file naming only (e.g., `"table_14_2_01"`, per §1). This is **not** displayed in the rendered RTF title — see `tfl_number` |
| `tfl_number` | string | Yes | Human-readable TFL number as it appears in the rendered RTF title (e.g., `"Table 14-2.01"`, `"Listing 16.2.5"`), sourced from the TFL Spec's `TFL Number` field (`tfl-spec-writer` §7). Never derived by reformatting `tfl_id` |
| `tfl_title` | string | Yes | Title of the table |
| `analysis_population` | string | Yes | Analysis population label (e.g., `"Full Analysis Set"`, `"Safety Population"`) |
| `execution_datetime` | string (ISO 8601) | Yes | Timestamp when the R program was executed. Use `format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")` |
| `program_path` | string | Yes | Relative file path of the R program that generated this TFL (e.g., `"programs/tfls/demography.r"`) |
| `big_n` | object | Yes | Total number of subjects per treatment group derived from ADSL. Keys are treatment group names, values are integers. **The set of keys in `big_n` MUST exactly match the union of all treatment-group property names used across every row object.** If a `"Total"` key is required by the TFL spec, it must appear in both `big_n` and as a property in every row object. |
| `columns` | array of string | Yes | Column header labels for the table body — exactly one element per **rendered** column, in display order (e.g., `"Treatment group"`, `"Active total"`, `"Comparator total"`, `"Total"`, `"Statistics"`, `"Estimates"`). The row-label column counts as a rendered column and takes an element of its own, commonly `""`. Structural row keys that are never rendered as body columns (`group`, `ord_group` — see `rows`) take no element. The number, order, and names MUST follow the TFL Spec for this table, and `length(columns)` MUST equal `ncol()` of the dataframe passed to `rtf_body()` — `col_rel_width` is sized from it in both `rtf_colheader()` and `rtf_body()`, and a mismatch misaligns the table silently (`clindroid-rtf-rendering` §2). |
| `footnotes` | array | Yes | Array of footnote objects sorted by `ord`. Each item has: `ord` (integer, 1-based display order), `label` (single lowercase letter, e.g., `"a"` for superscript reference in table body), `text` (footnote description displayed below the table). Empty array `[]` is valid when no footnotes are needed |
| `rows` | array | Yes | Table Body. Array of row objects, where **each object is the direct JSON representation of one row of the final R analysis result dataframe** (e.g., produced by converting the dataframe to JSON directly). Property names and their meaning (sort columns, row label, per-treatment-group formatted values, p-values, etc.) are entirely determined by the R program per the TFL Spec — this schema does **not** reserve or require any specific key names (there is no dedicated `p_value` field; a p-value, if needed, is just another column). Two keys are conventional: `group` (string) names the analysis item the row belongs to and repeats on every row of that item, and `ord_group` (integer, 1-based) is that item's display position — together they mark where each item's rows begin, which the renderer rules each section from, since array position alone cannot tell a renderer where one item ends. `r-coder-complex-table` §7 defines how they are built. Both are **structural, not body columns**: they appear in every row object but take no element in `columns`, so a row object normally holds two more keys than `columns` has elements. The renderer must handle both before sizing `col_rel_width`, exactly as `clindroid-rtf-rendering` §3 writes the call. Any property holding a treatment group's displayed value MUST use the exact same string as that group's key in `big_n`. Sort the dataframe before conversion — array order is the display order. Empty array `[]` is valid |

## 4. Clindroid ARD JSON Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Clindroid ARD JSON for Tables",
  "description": "Clindroid Analysis Result Data for clinical table output",
  "type": "object",
  "required": [
    "protocol_number",
    "tfl_id",
    "tfl_number",
    "tfl_title",
    "analysis_population",
    "execution_datetime",
    "program_path",
    "big_n",
    "columns",
    "footnotes",
    "rows"
  ],
  "properties": {
    "protocol_number": {
      "type": "string",
      "description": "Protocol number of the clinical study (e.g., \"XYZ-123\")"
    },
    "tfl_id": {
      "type": "string",
      "description": "Machine-readable TFL identifier used for output file naming only (e.g., \"table_14_2_01\"); not displayed in the rendered RTF title"
    },
    "tfl_number": {
      "type": "string",
      "description": "Human-readable TFL number as it appears in the rendered RTF title (e.g., \"Table 14-2.01\", \"Listing 16.2.5\"); never derived by reformatting tfl_id"
    },
    "tfl_title": {
      "type": "string",
      "description": "Title of the table"
    },
    "analysis_population": {
      "type": "string",
      "description": "Analysis population label (e.g., \"Full Analysis Set\", \"Safety Population\")"
    },
    "execution_datetime": {
      "type": "string",
      "format": "date-time",
      "description": "Timestamp when the R program was executed (ISO 8601)"
    },
    "program_path": {
      "type": "string",
      "description": "Relative file path of the R program that generated this TFL"
    },
    "big_n": {
      "type": "object",
      "description": "Total number of subjects per treatment group (from ADSL)",
      "additionalProperties": { "type": "integer", "minimum": 0 }
    },
    "columns": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Column header labels for the table body: exactly one element per rendered column, in display order, including the row-label column (commonly \"\"). Structural row keys such as \"group\" and \"ord_group\" are not rendered columns and take no element. length(columns) must equal ncol() of the table passed to rtf_body()."
    },
    "footnotes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ord", "label", "text"],
        "properties": {
          "ord": {
            "type": "integer",
            "description": "Footnote display order (1-based)"
          },
          "label": {
            "type": "string",
            "pattern": "^[a-z]$",
            "description": "Superscript label used in the table body (e.g., \"a\", \"b\")"
          },
          "text": {
            "type": "string",
            "description": "Footnote text displayed below the table"
          }
        },
        "additionalProperties": false
      }
    },
    "rows": {
      "type": "array",
      "description": "Table Body. Each item is the direct JSON representation of one row of the final R analysis result dataframe. Property names (row label, per-treatment-group values, p-values, etc.) are defined by the R program per the TFL Spec — this schema intentionally does not fix or reserve specific key names. By convention every row also carries \"group\" (string: the analysis item the row belongs to) and \"ord_group\" (integer, 1-based: that item's display position), which supply the section boundaries the renderer rules from; both are structural and take no element in \"columns\".",
      "items": {
        "type": "object",
        "additionalProperties": {
          "type": ["string", "number", "null"]
        }
      }
    }
  },
  "additionalProperties": false
}
```

## 5. RTF Rendering

**Generating this JSON is not the final step for a TFL.** After writing the Clindroid ARD JSON, you **must** also call the **`clindroid-rtf-rendering`** skill to render it into the mandatory `.rtf` deliverable via `r2rtf` — call it with `skill(name: "clindroid-rtf-rendering")` the same way you loaded this skill. Do not attempt to hand-write the RTF rendering step from memory or skip it: that skill documents the exact field mapping (§2 there) and several non-obvious r2rtf pitfalls (silent subscript/superscript corruption, missing brace/backslash escaping, non-ASCII text handling) that have already caused real defects. A delivered table without its `.rtf` file, or with a hand-rolled RTF renderer instead of `r2rtf`, is an incomplete/non-compliant deliverable.
