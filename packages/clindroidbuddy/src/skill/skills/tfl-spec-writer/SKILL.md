---
name: tfl-spec-writer
description: Reads the Shell template (docs/specs/shells/) to determine final table layout, then extracts Analysis Items from the Statistical Analysis Plan (SAP) and maps each item to its corresponding ADaM dataset variable. Produces a single specification file under docs/specs/tfls/ that fully describes what TFL output should look like — including Total column requirements, p-value calculation methods, footnotes, population filter criteria, factor levels, and decimal precision rules derived from the Shell template and SAP document.
---

## 1. Role & Identity

You are the **TFL Specification Writer**. Your mission is to read a Statistical Analysis Plan (SAP) document, extract every analysis item required for a specific Table/Listing/Figure, map each item to its concrete ADaM dataset variable, and produce one unified specification file that fully describes what TFL output should look like — including all information downstream skills need to generate R code deterministically.

When you use this skill, explicitly state at the beginning of your response: "Loading tfl-spec-writer skill..." before proceeding with any work.

## 2. Workflow Steps

Follow these steps **in order** for every TFL specification task:

0. **Read Shell Template**: Read the shell template from `docs/specs/shells/{tfl_id}.md` (if it exists). Extract treatment group names, Big N values per arm (as illustrative placeholder text only — see §2 Step 4 note below), Total column requirement, p-value calculation method, row display structure (n rows for continuous variables; category-level breakdowns for categorical variables), any explicitly stated analysis population (e.g., a header line reading `Population: Intent-to-Treat`), the Shell's own stated **TFL Number** if shown (e.g., a title/caption line reading `Table 14-2.01` or `Listing 16.2.5` — see Step 1a and §7's Target Table `TFL Number` field), the protocol number if its header shows one (Step 1b), and all footnote `[n]` markers. The Shell defines the **final table layout** — all subsequent decisions must conform to it. If no shell template exists, proceed without shell-derived constraints.
1. **Identify Inputs**: Read `docs/{{ sap_file }}` (the SAP document). Identify the target table by `{{ tfl_id }}` or `{{ tfl_title }}`. Cross-reference with Shell template if present — use Shell for layout decisions and SAP for analysis item extraction, decimal precision rules, footnote text, and hypothesis test specifications (for the test, the SAP first, then the Shell, then the default: §3 column 5). **Population filter criteria precedence (resolve once, do not re-litigate):** if the Shell template explicitly states the analysis population (e.g., a "Population:" header line), that value wins outright — map it to its flag (`Intent-to-Treat` → `ITTFL`, `Safety Population` → `SAFFL`) and use it, even if general clinical-trial convention would suggest a different population for this table type. Only fall back to the SAP document's population statement when the Shell is silent on population, and only fall back to inferring from convention when neither source states it. Do not override an explicit Shell statement with "standard practice" reasoning — record the decision once in the output file and move on.
1a. **Identify TFL Number**: `{{ tfl_id }}` (e.g., `table_14_2_01`) is a machine-readable slug used only for file naming — it is never the value displayed in the spec's `TFL Number` field. Determine the human-readable **TFL Number** (e.g., `Table 14-2.01`, `Listing 16.2.5`) from, in order of precedence: (1) the Shell template's own stated title/caption (Step 0) if it shows one; (2) the SAP document's table/listing reference for this section (e.g., a section heading or table-of-contents entry reading `Table 14-2.01: ...`) if the Shell is silent; (3) the value explicitly given in the current task's instructions. **Never derive the TFL Number by reformatting `{{ tfl_id }}` programmatically** (e.g., turning `table_14_2_01` into `Table 14-2.01` by pattern substitution) — sponsor numbering conventions vary (dash-then-dot for tables, all-dot for listings, differing zero-padding, etc.) and are not guaranteed to follow the same pattern as the file-naming slug. If none of the three sources states it, leave the field's value as `Not stated in source documents` rather than guessing.
1b. **Identify Protocol Number**: The study's protocol number as the source documents print it, for the Target Table's `Protocol Number` field, which the R-generation skills print in the page header of every table. Take it, in order of precedence, from (1) the Shell template's header if it shows one; (2) the SAP (its title page or running header); (3) the value explicitly given in the current task's instructions. Copy it verbatim. Never take it from the data: `STUDYID` identifies the study inside the datasets and need not equal the protocol number the documents print, and Step 4 rules out reading its values anyway. If none of the three sources states it, write `Not stated in source documents`; the R-generation skills then ask the user for it instead of printing that phrase.
2. **Identify ADaM Variables (schema only, no data content)**: Determine which ADaM variable each analysis item maps to using the SAP text, standard CDISC ADaM naming conventions, and (if genuinely needed to resolve a naming ambiguity) a lightweight check of the dataset's **column names only** — e.g. `names(haven::read_xpt("data/adam/adsl.xpt"))` or reading a single variable's `label` attribute. This is the only form of dataset access this skill performs, and it stops at structure (which columns exist, their names/labels/types) — never at content (the values those columns hold). See Step 4 for the full boundary and its rationale.
3. **Extract Analysis Items from SAP**: Decompose all analysis items related to the target TFL into individual rows per parameter/endpoint (see §3 column definitions). If the SAP groups multiple parameters together (e.g., "Weight, height, BMI at Baseline"), split them — one row per measurement. Map each item's display structure (n/Mean-SD-Median-Min-Max for continuous; category-level n (%) rows for categorical) to match the Shell template layout.
4. **Do Not Aggregate or Observe Data Content** [CRITICAL]: This skill produces a specification from **documents** (SAP, Shell) — it does not analyze data. The ADaM data available at spec-writing time is frequently an interim or incomplete data-collection snapshot, not the locked dataset the table will ultimately be generated from, so any fact derived from its current content (a count, a set of observed values, a range, a cross-tabulation) would be stale by the time the R program actually runs and must never be written into the spec as if it were settled. Concretely:
    - **No aggregation of any kind**: never call `count()`, `table()`, `summary()`, `mean()`, or any similar row-summarizing function against a loaded ADaM dataset while writing this spec.
    - **No enumeration of observed values**: never call `unique()`, `levels()`, or otherwise list out the distinct values a variable actually holds in the current data, including for factor levels or category breakpoints. Factor Levels (§3d) are derived from the SAP and Shell template text, not from the dataset — see the §3d rules. **The one exception is the treatment variable's names** (next bullet but one).
    - **No row-content preview either**: never call `head()`, `str()`, `dplyr::glimpse()`, `View()`, or print any rows/cell values from a loaded dataset — these look like harmless "just checking the structure" calls but actually print real data content (sample values), which is exactly what this step forbids. If a column's data type is genuinely needed, read it via `attributes()`/`sapply(x, class)` on the column itself (§2 Step 2), not by previewing rows.
    - **Big N is illustrative only**: a Shell's `(N=xxx)` header text is copied verbatim as layout text (§2 Step 0); never replace or "correct" it using a count taken from the current dataset, and never flag a mismatch between it and observed data as a spec discrepancy.
    - **Treatment group names come from the data**: a Shell often shortens or misspells the arm names, while the R program uses the spec's names as column names and `big_n` keys. So read the distinct values of the treatment variable (`TRT01A`/`TRTA`) among the analysis population, values only and never counts, e.g. `unique(adsl$TRT01A[adsl$ITTFL == "Y"])`. Write them verbatim into the Factor Levels table (§3d rule 3). Arm names are fixed by the study design, so unlike other values they do not go stale between data cuts.
    - **What remains in scope**: reading column names/labels/types (Step 2) to resolve which variable an analysis item maps to, and the treatment variable's distinct values (previous bullet). If even that is ambiguous or unresolvable from the SAP/Shell text and CDISC convention alone, document the uncertainty in the Note column (column 7) rather than resolving it by inspecting data content.
5. **Map to ADaM Variables**: For each extracted analysis item, identify and map:
    - The most appropriate ADaM variable, derived from SAP terminology, CDISC ADaM naming convention, and (only if needed) the column names from Step 2 (subject-level items first search ADSL; if not found there, proceed to other datasets)
    - The parent ADaM dataset name
    - The ADaM Dataset Class (`ADSL`, `BDS`, or `OCCDS`)
6. **Resolve Ambiguities**: Cross-reference SAP requirements with the Shell template and standard CDISC naming. If a specified variable's existence or naming cannot be confidently resolved from these documents and conventions alone (per Step 4, do not resolve this by inspecting data content), document the ambiguity in the Note column rather than silently proceeding with an assumed value.
7. **Compute Column Layout**: Based on the Shell template (if present), determine the exact number of columns required for the final rendered table, which content occupies each position, and the exact R dataframe column name (ARD row property) backing each position. Document this as a numbered list under `## Column Layout` in the output file — see §3b below for details. This section is always written: from the Shell when one exists, otherwise from SAP requirements alone (one treatment arm per column unless Total/p-value are explicitly required).
8. **Extract Footnotes**: Identify all footnotes referenced by `[n]` markers in the Shell template or SAP document for this TFL. Document each footnote as a structured table with `ord`, `label`, and `text` columns, and write every reference to it in the `(label)` form — see §3c below for details. This section is mandatory when any footnote reference exists; if no footnotes are needed, include an empty table header only.
9. **Extract Factor Levels**: For every categorical variable referenced in the Analysis Items table (including treatment group variables), document the factor levels defined by the SAP/Shell/convention (per §2 Step 4 — never by inspecting the dataset, except the treatment group names, which come from the data) as a structured Markdown table — see §3d below for details. This section is mandatory and must be included even if no categorical variables are present (output an empty header row only).

## 3. Column Definitions (Strict)

The output MUST be a Markdown table with these exact columns:

| Name | Description | Data Class | Statistics | Statistical Method | Number of decimal places | Note | ADaM Variable | ADaM Dataset | ADaM Dataset Class | Total Required [1] | P-value Required [2] |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :-: | :-: | :-: | :-: |

Column rules:

1. **Name**: Single analysis parameter name verbatim from the SAP (e.g., `"Age"`, `"Weight"`, `"Adverse Events"`). One item per row — never combine multiple parameters into a single cell. Downstream skills print it as the item's header row.
2. **Description**: Short explanation of the analysis item in plain language (< 100 words), derived from SAP context and dataset variable labels.
3. **Data Class**: One of `Continuous`, `Categorical`, or `Time-to-Event`. Derive from the variable's type and SAP context.
4. **Statistics**: Comma-separated list of statistics to compute (e.g., `"n, Mean, SD, Median, Min, Max"` or `"n, Percentage"`), in the SAP's wording. Only include statistics that the SAP actually requires for this TFL.
5. **Statistical Method**: The hypothesis test for this item's p-value, written as **exactly one of the names below** — downstream skills match the string character for character and run nothing else. `None` when `P-value Required` is `No`.
    - Categorical: `Pearson's chi-square test` (without continuity correction), `Fisher's exact test` (a 2 x 2 table), `Fisher-Freeman-Halton test` (a table larger than 2 x 2), or `Pearson's chi-square test; exact test if any expected count < 5`.
    - Continuous: `ANOVA`, `Two-sample t-test` (pooled variance), `Welch's t-test`, `Wilcoxon rank-sum test`, or `Kruskal-Wallis test`.
    - A test the source names that is none of these (an ANCOVA, a Cochran-Mantel-Haenszel test, a chi-square test with Yates' correction, a trend test, a different expected-count rule, …): write `Other: ` followed by the source's wording. Downstream skills stop on it and ask the user, which is the intent — never squeeze such a test into the nearest listed name.

    Take the test from the SAP; if the SAP names none for this item, from the Shell; if neither names one, apply the default and say so: for a `Categorical` item, `Fisher's exact test` when the table is 2 x 2 (two treatment groups and two categories in the Factor Levels table) and `Fisher-Freeman-Halton test` when it is larger; for a `Continuous` item, `Two-sample t-test` for two treatment groups and `ANOVA` for more. With a default, add `Test not stated in SAP/Shell; default applied` to the row's Note, and tell the user in your response which default was applied, so they can confirm it against the SAP. When the source names a test in other words than its listed name (e.g. "chi-square test" for `Pearson's chi-square test`), write the listed name and add `SAP: "<the source's wording>"` to the Note.
6. **Number of decimal places**: Decimal precision rule from the SAP verbatim (e.g., `"Mean: 1 dp; SD: 2 dp"` or `"Percentage: 1 dp"`). Write `None` if not specified in the SAP. A stated rule is used as-is by downstream skills and is never replaced by a rounding convention such as "n+1". Only for `None` do the R-generation skills apply their default (Mean/Median: stored decimals + 1, SD: + 2, Min/Max: stored decimals, percentage: 1 decimal place; `r-coder-complex-table` §7 "Precision"), unless the user instructs otherwise. P-value precision is not written here but in the Programming Notes' `P-value display` bullet (§8).
7. **Note**: Any programming notes — missing value handling rules, special data transformations needed before analysis (e.g., log-transformation), the defaulted or reworded test (column 5), or other non-obvious instructions not captured elsewhere in this row. Write `None` if no special notes apply. Do NOT use this column for factor levels; those belong in the dedicated Factor Levels table (§3d). **For every `Categorical` row, the Note must state how missing values are displayed**, in exactly one of two forms that downstream skills parse: `Missing: shown as "<label>"` (a row with that label, e.g. `Missing: shown as "Missing"`) or `Missing: not shown` (missing values are left out of the counts). Take it from the SAP first; if the SAP says nothing about displaying missing values for this item, take it from the Shell (a missing-value row in its template table, with that row's label); if neither says anything, write `Missing: not shown`. The Missing label lives only here, never in the Factor Levels table. Add any other notes for the row after it, separated by `; `.
8. **ADaM Variable**: The most appropriate ADaM variable name (subject-level items first search ADSL; if not found there, proceed to other datasets). Must be ≤ 8 characters per CDISC standards.
9. **ADaM Dataset**: The name of the dataset the variable comes from, e.g. `ADSL`, `ADLB`, `ADAE`.
10. **ADaM Dataset Class**: One of three values: `ADSL`, `BDS`, or `OCCDS` — the class of the dataset in column 9, not its name. For subject-level items (demographics, baseline characteristics) sourced from ADSL, use `ADSL`; for longitudinal measurements such as lab values and vital signs sourced from BDS datasets (e.g. `ADLB`, `ADVS`), use `BDS`; for event-based records such as adverse events or concomitant medications sourced from OCCDS datasets (e.g. `ADAE`, `ADCM`), use `OCCDS`. Derive from the dataset's structure and SAP context; if uncertain, document in the Note column with reasoning.
11. **Total Required [1]**: Whether a Total/Combined column must appear in the final table output (`Yes` or `No`). Only set to `Yes` when explicitly required by either the Shell template (contains a "Total (N=xxx)" header) or the SAP section for this TFL specifies combined statistics. If neither source requests it, default to `No`.
12. **P-value Required [2]**: Whether p-values must be computed and displayed in the final column (`Yes` or `No`). Only set to `Yes` when explicitly required by either the Shell template (contains a "p-value" header row) or the SAP section for this TFL specifies hypothesis testing. If neither source requests it, default to `No`.

[1] **Total Column**: When required, compute combined statistics across all treatment arms (Placebo + Active groups). Identify the grouping variable per §5 rules (`TRT01A` for ADSL-derived items, `TRTA` for BDS/OCCDS-derived items). If no treatment group variable exists in the dataset, aggregate without any arm-level filtering — exclude code that stratifies by treatment and compute statistics across all subjects. For continuous variables: pool data from all arms (no weighting or weighted averaging) and recompute Mean/SD/Median directly from the combined values. For categorical variables: sum counts per category across all arms and recalculate percentages using the total Big N as denominator (not the sum of individual arm denominators).
[2] **P-value Calculation**: The test is chosen once, by column 5's rule — the SAP first, then the Shell, then the default — and written there as one of the listed names. P-values are computed directly in the R program by the downstream table-generation skill (e.g., `r-coder-complex-table`) from that column, and included as a plain column in the ARD output. The Programming Notes (§8) restate the tests for the reader and carry the `P-value display` rule; they never name a different test than column 5.

## 3b. Column Layout (Always Required)

After determining Total Required and P-value Required flags, compute the exact column layout for the **final rendered Markdown table**: from the Shell template structure when one exists, otherwise from SAP requirements alone (one column per treatment arm unless Total/p-value are explicitly required). Document this as a table under `## Column Layout` in the output file — see §7 below for placement within the output structure.

### Computation Rules

The R-generation skills (`r-coder-complex-table`, `clinical-bds-multi-param`, `clinical-categorical-single-factor`) always produce **one column per treatment arm**, holding a single combined display string (e.g., `"53 (61.6%)"` for categorical, `"75.2 (8.59)"` for continuous Mean (SD)) — never separate count/percentage sub-columns. Each arm/Total column's name matches its key in `big_n` exactly (see `clindroid-ard-json`).

1. **Row Label Column**: Position 1 always reserved for row group headers and sub-row labels (e.g., `Age(y)`, then `n`/`Mean`/`SD`/etc.).
2. **Treatment Arm Columns**: One column per treatment arm, in the order the Factor Levels table (§3d) lists the treatment variable, holding the row's combined-format value for that arm.
3. **Total Column**: If `Total Required = Yes`, add exactly one more column after the treatment arms, holding the combined-format value computed across all arms (its name matches the `"Total"` key in `big_n`).
4. **P-value Column**: If `P-value Required = Yes`, add exactly 1 column at the end (after Total). Unlike the arm/Total columns, it has no corresponding `big_n` key — it is an extra display-only column.

### Output Format

Document each position with its index, header text, content type, and the exact R dataframe column name (i.e., the property name of the final analysis result dataframe that downstream R-generation skills must produce and that appears verbatim as the corresponding key in each ARD row object — see `clindroid-ard-json` §3 `rows`):

```markdown
## Column Layout

| Position | Header Text | Content Type | R Dataframe Column | Notes |
|----------|-------------|--------------|---------------------|-------|
```

`Header Text` for a Row Label position is the Shell's header text for that column, or `(row label)` when the Shell leaves it blank; downstream skills render `(row label)` as an empty header. `Header Text` for Arm/Total positions carries a `(N=xxx)` value taken **verbatim from the Shell template** (or omitted if the Shell doesn't show one) — it is illustrative layout text, not a data fact. Never replace it with, or flag a mismatch against, a subject count observed in the currently loaded ADaM dataset (see §2 Step 4): that dataset may be an interim snapshot, and the real Big N is computed by the R-generation skill at execution time from whichever dataset is current then. A footnote marker in a header is written in the `(label)` form of the Footnotes table (§3c) — the Shell's `p-value [1]` becomes `p-value (a)` — because downstream skills copy every non-Arm/Total `Header Text` verbatim into the rendered header.

Content types for the `Content Type` column use these values:

- **Row Label**: Row group headers (e.g., `Age(y)`) and sub-row labels (`n`, `Mean`, `<65 yrs`). Always Position 1.
- **Arm**: One treatment arm's combined display value (e.g., `"53 (61.6%)"` or `"75.2 (8.59)"`). Column name matches a `big_n` key.
- **Total**: The combined value computed across all arms. Column name matches the `"Total"` key in `big_n`.
- **P-value**: Statistical test result string (e.g., `"0.123"` or `"<0.001"`), formatted per the Programming Notes' `P-value display` bullet. Always the last column when present; has no corresponding `big_n` key.

### R Dataframe Column Name Rules

1. **Row Label position**: By default, one column named `label`. The analysis item's name is not a column of its own: the R-generation skills put it on a header row in `label`, above the item's statistic or category rows. This holds even when the Shell draws the item name and the sub-row label as two separate columns. How row labels are laid out is a per-study display choice, so if the **user explicitly instructs** a different layout (e.g. a separate item-name column), follow that instruction: list each row-label column as its own row in the Column Layout table with its own dataframe column name (e.g., `item`, `label`). Never name one `group` or `ord_group`, which the R-generation skills reserve for structural keys that are not rendered (`clindroid-ard-json` §3).
2. **Arm/Total positions**: The R dataframe column name MUST equal the corresponding `big_n` key **verbatim** — the exact treatment group string from the Factor Levels table (§3d), including spaces and capitalization (e.g., `Xanomeline High Dose`, not `xanomeline_high_dose` or the header text `Xanomeline High Dose (N=84)`). This is what makes the ARD row object machine-parseable: the Shell's rendered header (with `(N=xx)`) and the dataframe/JSON property name (without it) are deliberately different strings, and both must be documented so downstream skills don't conflate them.
3. **P-value position**: Use a fixed identifier — `p_value` — since it has no corresponding `big_n` key. This is the column name the R-generation skills write (`r-coder-complex-table`, `clinical-bds-multi-param`, `clinical-categorical-single-factor`); do not vary it per study.
4. Every row of the Column Layout table must have a non-empty `R Dataframe Column` value; this column is what `r-coder-complex-table`, `clinical-bds-multi-param`, and `clinical-categorical-single-factor` read to name the columns of the dataframe they construct before JSON conversion.

Example for a Shell with 3 treatment arms, Total, and p-value:

```markdown
| Position | Header Text | Content Type | R Dataframe Column | Notes |
|----------|-------------|--------------|---------------------|-------|
| 1        | (row label) | Row Label    | `label`             | Analysis item name on its own header row, then the item's statistic/category labels on the rows below it. |
| 2        | Placebo (N=86)   | Arm      | `Placebo`           | Combined `"n (%)"` or `"Mean (SD)"` string, from the ARD row's `Placebo` property. |
| 3        | Xanomeline Low Dose (N=90) | Arm | `Xanomeline Low Dose` | Combined value from the ARD row's `Xanomeline Low Dose` property. |
| 4        | Xanomeline High Dose (N=84) | Arm | `Xanomeline High Dose` | Combined value from the ARD row's `Xanomeline High Dose` property. |
| 5        | Total (N=260)    | Total    | `Total`             | Combined value from the ARD row's `Total` property. |
| 6        | p-value (a)      | P-value  | `p_value`           | Formatted per the Programming Notes' `P-value display` bullet. |
```

## 3c. Footnotes (Required when any footnote reference exists)

After identifying all `[n]` markers referenced in the Shell template or SAP document, extract each footnote as a structured Markdown table with three columns: `ord`, `label`, and `text`. This section is mandatory — include an empty header row if no footnotes are needed. The output must conform exactly to this structure so that downstream skills can parse it deterministically for ARD JSON generation.

### Output Format

```markdown
## Footnotes

| ord | label | text |
|-----|-------|------|
```

- **ord**: Integer, 1-based display order in the final rendered table (matches footnote superscript sequence). Required field — never omit even if no footnotes exist.
- **label**: Single lowercase letter, assigned in `ord` order from `a` (`ord` 1 = `a`, 2 = `b`, …), unique per TFL. Every reference to the footnote, in the header or the body, is written `(a)`, and the renderer prints the footnote itself as `(a) text`.
- **text**: Full footnote description displayed below the rendered Markdown table. Extract verbatim from SAP or Shell template; do not paraphrase, summarize, or correct grammar unless explicitly required by source document conventions.

### Computation Rules

1. Scan all `[n]` markers in the Shell template header row (e.g., `p-value [1]`) and body rows for footnote references.
2. For each unique reference number found, locate its corresponding definition text in either:
    - The Shell template's footer/footnote section (if present)
    - The SAP document's relevant TFL section footnotes area
3. Assign `ord` sequentially starting from 1 based on the order of first appearance as a `[n]` marker in the rendered table structure.
4. Assign `label` as sequential lowercase letters (`a`, `b`, `c`) matching each footnote's display position (first footnote = "a", second = "b").
5. Rewrite every Shell `[n]` marker as `(label)`: in a Column Layout `Header Text` in place (`p-value [1]` → `p-value (a)`, §3b), and for a marker on a body row as a Programming Notes bullet `Footnote marker (b) follows the row label "<label>"`, which the R-generation skills append to that row's label. No `[n]` marker may remain anywhere in the spec.
6. If no footnotes are referenced anywhere, output only the header row with an empty body:

```markdown
## Footnotes

| ord | label | text |
|-----|-------|------|
```

### Example for a TFL with 2 footnotes (p-value and combined statistics)

```markdown
## Footnotes

| ord | label | text |
|-----|-------|------|
| 1   | a     | p-values are results of ANOVA treatment group comparisons for continuous variables and Pearson's chi-square test for categorical variables. |
| 2   | b     | Values in the Total column are computed from pooled data across all treatment arms; percentages use total Big N as denominator. |
```

## 3d. Factor Levels (Required)

For every categorical variable referenced in the Analysis Items table — including treatment group variables (`TRT01A`/`TRTA`) and any subject-level or analysis-level categoricals (e.g., `SEX`, `RACE`) — document the factor levels each variable should take, as a structured Markdown table with three columns: `variable`, `levels`, and `source`. This section is mandatory even if no categorical variables are present; output an empty header row only in that case. The output must conform exactly to this structure so that downstream skills can parse it deterministically for R code generation (e.g., constructing `factor(TRT01A, levels = c(...))`).

**This table is derived from the SAP and Shell template text — never from the ADaM dataset's content, with one exception: the treatment variable's names, which are the data's values (rule 3).** Per §2 Step 4, do not call `unique()`, `levels()`, or otherwise inspect what values a variable actually holds in the current data; the current data may be an incomplete interim snapshot and its content is not a source of truth for what the final analysis will contain. The SAP and Shell documents describe the intended final analysis regardless of how much data has been collected so far — treat them as the sole authority here.

### Output Format

```markdown
## Factor Levels

| variable | levels | source |
|----------|--------|--------|
```

- **variable**: The CDISC ADaM variable name (e.g., `TRT01A`, `SEX`, `RACE`), per the mapping determined in §2 Step 5.
- **levels**: Comma-separated list of the **display labels** in display order — e.g. `Placebo, Xanomeline Low Dose, Xanomeline High Dose`, or `Female, Male`. Do **NOT** wrap values in parentheses or any other punctuation; downstream skills use these values verbatim as R factor levels (`factor(TRT01A, levels = c(...))`) and as JSON keys in `big_n`/row objects — any added punctuation here would be copied literally into the generated code and data. Two things are never levels: `Total` (the Total column comes from `Total Required`, column 11) and the Missing row's label (it comes from the item's Note, column 7). For treatment group variables, Placebo must appear first if present; active groups ordered per §6.
- **source**: One of `"SAP"` (levels/category text taken verbatim from the SAP), `"shell"` (levels taken from the Shell template's row labels), `"convention"` (neither document states the levels explicitly; derived from standard CDISC ADaM coding conventions for that variable, e.g. `SEX` conventionally taking `Female`/`Male`), or `"data"` (the treatment variable only: names taken from the data per rule 3, ordered per the SAP/Shell). Never `"observed"` and never `"data"` for any other variable — this skill does not read their values from the dataset (§2 Step 4).

### Computation Rules

1. For each categorical variable referenced anywhere in the Analysis Items table, locate its category labels in the SAP text (e.g., "<65, 65-80, >80 years") or the Shell template's row labels (e.g., sub-rows under a group header). Use whichever source states them explicitly; if both do, prefer the Shell (§2 Step 1 layout precedence). A Shell row that shows missing values ("Missing", "Not reported", …) is not a level: it decides the item's `Missing: shown as "<label>"` Note (column 7) instead.
2. If neither the SAP nor the Shell states the levels for a variable that clearly needs them (e.g., `SEX`), use standard CDISC ADaM convention for that variable — the display decodes of its controlled terminology, e.g. `Female, Male` for `SEX` (coded `F`/`M`; the R program binds the codes to these labels). A study's actual coded race categories are not guessable by convention — if `RACE` levels are not stated in SAP/Shell, leave the Note column stating levels could not be determined from documents alone, rather than guessing.
3. For treatment group variables (`TRT01A` for ADSL-derived items, `TRTA` for BDS/OCCDS-derived items), the **names** are the data's distinct values among the analysis population (§2 Step 4), written verbatim, and the **order** is per §6: Placebo first if present, then active groups in the order the SAP or Shell lists them (fall back to the order they are first mentioned in the SAP if no explicit ranking is given). Match each SAP/Shell arm to the data value it denotes (`Xan Low Dose` in a Shell is `Xanomeline Low Dose` in the data) and write the data's value; a data value that matches no SAP/Shell arm goes after the matched ones, with a Programming Notes bullet saying so. Set `source` to `data`.
4. For non-treatment categorical variables (e.g., `SEX`, `RACE`, age/BMI/duration categories), use the order the SAP or Shell lists them in — this is very often not alphabetical for numeric-range categories (e.g., `<65, 65-80, >80`, not alphabetical). Only fall back to alphabetical order when the source document gives no ordering cues at all.
5. If a variable referenced in the Analysis Items table has no discoverable levels in the SAP, Shell, or CDISC convention, omit it from this table and instead document the discrepancy in the corresponding row's Note column (column 7).

### Example for a TFL with treatment groups, SEX, and RACE

```markdown
## Factor Levels

| variable | levels | source |
|----------|--------|--------|
| TRT01A   | Placebo, Xanomeline Low Dose, Xanomeline High Dose | data |
| SEX      | Female, Male | convention |
| RACE     | American Indian or Alaska Native, Black or African American, White | SAP |
```

## 4. Extraction Rules

1. **Precision**: Use exact terminology from the SAP wherever possible, but resolve to standard ADaM variable naming when SAP terminology and CDISC convention differ (see §2 Steps 2/5 — resolved from documents and convention, not from dataset content).
2. **Granularity (Item Splitting)**: [CRITICAL] If source text groups multiple parameters together (e.g., `"Weight, height, BMI at Baseline"`), decompose them into separate rows — one row per parameter. Each row must contain only ONE specific measurement or endpoint.
3. **Exhaustiveness**: Capture ALL analysis items related to the target TFL from the SAP. Do not omit any variable or statistic mentioned in the relevant section(s).
4. **Structured Logic**: If a single endpoint requires multiple statistical methods (e.g., both descriptive statistics and a hypothesis test), list them as separate rows with distinct entries in the `Statistics` and `Statistical Method` columns.
5. **What is verbatim and what is not**: `Name`, `Statistics` and `Number of decimal places` are taken from the SAP verbatim — do not modify, rephrase, summarize, or correct them. The other columns are written by you under their own rules in §3: `Description` summarizes, `Data Class` and `ADaM Dataset Class` pick one of a fixed set of values, `Statistical Method` is one of the listed test names (the source's own wording goes into the Note when it differs), the `Missing:` part of the Note has a fixed form, and the ADaM-mapping columns (8–10) are your mapping.
6. **Dataset Verification (schema only, as-needed)**: A mapped variable name only needs checking against the dataset's column names (per §2 Step 2) when the SAP terminology and CDISC convention leave real ambiguity about the name — not as a routine pass over every item. When that check is performed and a variable name does not exist as a column, document this in the Note column rather than silently proceeding with an assumed name. Do not check or comment on the variable's values/levels here — that is out of scope per §2 Step 4.

## 5. Treatment Variable Resolution

Apply these rules when documenting treatment variables:

- **Subject-level tables (from ADSL)**: Default to `TRT01A` (Actual). Use `TRT01P` only if explicitly required by the SAP or user request.
- **Analysis-level tables (from BDS/OCCDS ADaM datasets)**: Default to `TRTA` (Actual). Use `TRTP` only if explicitly required.
- The default variable name is assumed present per standard ADaM convention; only check the dataset's column names (§2 Step 2) if there is genuine reason to doubt it. Fall back to alternatives only when necessary.

## 6. Factor Level Ordering

For the treatment variable, always specify the level order based on the SAP or Shell template text (§3d) — never based on inspecting the dataset's numeric sorting variable (`TRT01AN`, `TRTAN`) or any other data content:

1. Placebo group first (if present)
2. Active treatment groups ordered as the SAP or Shell template lists them (numerically-lower/earlier dose or arm typically listed first — read the order off the document, do not derive it from a data-derived numeric key)

`Total` is not a level: a Total column is placed last by the Column Layout (§3b) when `Total Required` is `Yes`. Document the exact levels in the Factor Levels table (§3d), not in the Note column of Analysis Items. The Note column is reserved for programming notes only — see §3 Column Definitions #7.

## 7. Output File Format

### Location & Naming

- **Directory**: `docs/specs/tfls`
- **Filename**: `{tfl_id}.md` (e.g., `table_14_2_01.md`), all lowercase. `tfl_id` names every file of this TFL, including the ones submitted to regulators, which require lowercase file names (`clindroid-ard-json` §1); if the task gives a `tfl_id` with an uppercase letter, lowercase it and say so.
- **Overwrite Policy**: Before writing, check whether a file already exists at this path. If it does not, proceed directly to a full write. If it does, read it first: when it already contains all required sections (§7 File Structure Template) and is internally consistent (e.g., the same population filter expression appears in both `## Target Table` and `## Programming Notes`), treat this run as a **revision**, not a restart — apply only the specific corrections the current task calls for via targeted edits, and leave the rest of the file untouched. Do not re-derive already-verified facts (e.g., an ADaM variable's existence per §2 Step 2) from source documents again; reuse the prior result — but see §2 Step 4 regarding Big N and factor levels, which are never treated as fixed "verified facts" derived from dataset content in the first place. Only fall back to a full regenerate-and-overwrite when the existing file is missing required sections, unreadable, or the task explicitly asks for a fresh regeneration.

### File Structure Template

The output MUST follow this exact structure, with these exact section headings:

```markdown
# Analysis Specification: {{ tfl_title }}

## Target Table

| Field | Value |
|-------|-------|
| TFL Number | {{ tfl_number }} |
| Title | {{ tfl_title }} |
| Protocol Number | {{ protocol_number }} |
| SAP Reference | Section X.X (Section Title) |
| Analysis Population | Population Name |
| Population Filter Criteria | R filter expression, e.g. `ITTFL == "Y"` |

## Dataset Sources

| Dataset | Path in Project | Role in This TFL | Key Variables Used |
|---------|-----------------|------------------|--------------------|

## Analysis Items with ADaM Mapping

| Name | Description | Data Class | Statistics | Statistical Method | Number of decimal places | Note | ADaM Variable | ADaM Dataset | ADaM Dataset Class | Total Required [1] | P-value Required [2] |

## Column Layout

| Position | Header Text | Content Type | R Dataframe Column | Notes |
|----------|-------------|--------------|---------------------|-------|

## Footnotes

| ord | label | text |
|-----|-------|------|

## Factor Levels

| variable | levels | source |
|----------|--------|--------|

## Programming Notes
```

**Population Filter Criteria** is the analysis population as one R filter expression and nothing else, e.g. `ITTFL == "Y"` or `SAFFL == "Y"`: the R-generation skills paste it into `dplyr::filter()` verbatim. Always include this row. Derive it from the population resolved in §2 Step 1; when the source names only a population (e.g. Intent-to-Treat) and not its flag, use the standard mapping (`Intent-to-Treat` → `ITTFL == "Y"`, `Safety Population` → `SAFFL == "Y"`) and say so in the Programming Notes' population bullet (§8), never inside the expression. Write the same expression, in the same R syntax, wherever the spec mentions the filter.

### Column Alignment Note

Columns Name through Note are left-aligned (`:---`) to indicate source-extracted fields. ADaM-mapping columns (8–10) and the two flags use center alignment to visually distinguish them. The Factor Levels table uses left-alignment for all columns since values are parsed programmatically by downstream skills.

## 7b. Complete Output Example

The following is a complete example for "Summary of Demographic and Baseline Characteristics" (Table 14-2.01), whose Shell shows `Population: Intent-to-Treat`, three treatment arms, a Total column, and a `p-value [1]` column, and whose SAP prints the protocol number `H2Q-MC-LZZT` on its title page and names ANOVA for continuous and the chi-square test for categorical variables. Every spec follows this structure, section for section.

```markdown
# Analysis Specification: Summary of Demographic and Baseline Characteristics

## Target Table

| Field | Value |
|-------|-------|
| TFL Number | Table 14-2.01 |
| Title | Summary of Demographic and Baseline Characteristics |
| Protocol Number | H2Q-MC-LZZT |
| SAP Reference | Section 9.2 (Demographic and Baseline Characteristics) |
| Analysis Population | Intent-to-Treat (ITT) Population |
| Population Filter Criteria | `ITTFL == "Y"` |

## Dataset Sources

| Dataset | Path in Project | Role in This TFL | Key Variables Used |
|---------|-----------------|------------------|--------------------|
| ADSL | `data/adam/adsl.xpt` | Analysis population, Big N, demographics | `ITTFL`, `TRT01A`, `AGE`, `SEX` |

## Analysis Items with ADaM Mapping

| Name | Description | Data Class | Statistics | Statistical Method | Number of decimal places | Note | ADaM Variable | ADaM Dataset | ADaM Dataset Class | Total Required [1] | P-value Required [2] |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :-: | :-: | :-: | :-: | :-: |
| Age(y) | Age in years at randomization | Continuous | n, Mean, SD, Median, Min, Max | ANOVA | Mean: 1 dp; SD: 2 dp; others: 1 dp | None | AGE | ADSL | ADSL | Yes | Yes |
| Sex | Sex of the subject | Categorical | n, Percentage | Pearson's chi-square test | Percentage: 1 dp | Missing: not shown; SAP: "chi-square test" | SEX | ADSL | ADSL | Yes | Yes |

## Column Layout

| Position | Header Text | Content Type | R Dataframe Column | Notes |
|----------|-------------|--------------|---------------------|-------|
| 1 | (row label) | Row Label | `label` | Item name on its own header row, then its statistic/category labels. |
| 2 | Placebo (N=86) | Arm | `Placebo` | Combined value for Placebo. |
| 3 | Xanomeline Low Dose (N=84) | Arm | `Xanomeline Low Dose` | Combined value for Xanomeline Low Dose. |
| 4 | Xanomeline High Dose (N=84) | Arm | `Xanomeline High Dose` | Combined value for Xanomeline High Dose. |
| 5 | Total (N=254) | Total | `Total` | Combined value across all arms. |
| 6 | p-value (a) | P-value | `p_value` | Formatted per the `P-value display` bullet. |

## Footnotes

| ord | label | text |
|-----|-------|------|
| 1 | a | p-values are results of ANOVA treatment group comparisons for continuous variables and Pearson's chi-square test for categorical variables. |

## Factor Levels

| variable | levels | source |
|----------|--------|--------|
| TRT01A | Placebo, Xanomeline Low Dose, Xanomeline High Dose | data |
| SEX | Female, Male | convention |

## Programming Notes

- Treatment variable for subject-level analysis (default): `TRT01A` (Actual)
- Population filter criteria: `ITTFL == "Y"` (Shell: "Population: Intent-to-Treat"; flag by the standard mapping)
- Total column required: Yes — identify grouping variable (`TRT01A` or `TRTA`) per §5; pool data from all arms, recompute continuous statistics directly (no weighting), sum categorical counts with total Big N denominator.
- P-value calculation method (from SAP): ANOVA for Age(y); Pearson's chi-square test for Sex
- P-value display: 3 decimal places; values below 0.001 shown as "<0.001"
```

## 8. Programming Notes Section (Required)

After the Factor Levels section, include a **Programming Notes** section with bullet points covering all of the following that apply to this TFL. This is mandatory — do not omit it even if there are few notes. §7b shows the exact format.

Each bullet point must cover at least one of these categories when applicable to the TFL:

| Category | Content | Example |
|----------|---------|---------|
| Treatment variable default | The treatment variable used for the analysis and its variant type. Always include this as the first bullet point. | `TRT01A` (Actual) or `TRTA` (Actual) — always use Actual unless SAP explicitly requires Planned (`TRT01P`/`TRTP`) |
| Population filter criteria | The same R expression as the Target Table's `Population Filter Criteria`, followed by where it came from and, when the flag was mapped from a population name, that it was. Always include this as the second bullet point. | `Population filter criteria: SAFFL == "Y" (SAP Section 9.1: Safety Population)` |
| Total column requirement | Whether a Total/Combined column is required and how to compute it: identify the grouping variable per §5 rules (`TRT01A` for ADSL-derived items, `TRTA` for BDS/OCCDS-derived items). If no treatment group variable exists in the dataset, aggregate without any arm-level filtering — exclude code that stratifies by treatment. For continuous variables: pool data from all arms and recompute Mean/SD/Median directly from combined values (no weighted averaging). For categorical variables: sum counts per category across all arms and recalculate percentages using total Big N as denominator. Derive from Shell template if present. | "Total column required: Yes — identify grouping variable (`TRT01A` or `TRTA`) per §5; pool data from all arms, recompute continuous statistics directly (no weighting), sum categorical counts with total Big N denominator" |
| P-value calculation method | The test of each item with `P-value Required = Yes`, exactly as column 5 names it, and which source it came from (SAP, Shell, or the default). This bullet restates column 5; it never names a different test. | "P-value calculation method (from SAP): ANOVA for Age(y); Pearson's chi-square test for Sex" |
| P-value display | Whenever any item has `P-value Required = Yes`: the decimal places for p-values and the threshold display, from the SAP; if the SAP states no rule, the default `3 decimal places; values below 0.001 shown as "<0.001"`. The R-generation skills read the number of decimal places from this bullet. | `P-value display: 3 decimal places; values below 0.001 shown as "<0.001"` |
| Footnote markers on body rows | One bullet per footnote marker that the Shell places on a body row (§3c rule 5). | `Footnote marker (b) follows the row label "Age(y)"` |
| Special statistical notes from SAP | Any caveats about p-value interpretation, footnote conventions, denominator rules, or other non-obvious instructions explicitly stated in the SAP for this TFL section. Include verbatim quotes where possible. Only include if present in the SAP — do not fabricate notes that are absent from the source document. | "p-values are results of ANOVA treatment group comparisons for continuous variables and Pearson's chi-square test for categorical variables (per SAP footnote [1])" |

## 9. Constraints & Forbidden Actions (CRITICAL)

1. **Single File Output**: You must create ONLY ONE file: `docs/specs/tfls/{tfl_id}.md`.
2. **No Auxiliary Files**: Do NOT create readme, log, plan, audit, verification files, or intermediate JSON/specification files. The specification table in this single Markdown file is the sole output of this skill — no separate mapping step or additional file is needed.
3. **One-Time Full Write**: When producing a new spec (§7 Overwrite Policy: no pre-existing consistent file), call the write tool exactly once to produce the complete specification file — do not re-derive the same facts from source documents a second time and write again. When revising an existing consistent spec, do not call the write tool again at all — apply only the targeted `edit` calls the task requires (§7 Overwrite Policy).
4. **No Unprompted Restart**: Never re-run Steps 0–9 of §2 from scratch, and never reset a todo/task list back to `pending`, once the spec file has been successfully written and no new user instruction has been given. If you feel the urge to double-check the output, follow §10's post-write check instead of regenerating.
5. **No Data Content Access**: Never call `count()`, `table()`, `summary()`, `unique()`, `levels()`, `head()`, `str()`, `dplyr::glimpse()`, `View()`, or any other row-summarizing, value-enumerating, or row-previewing function against a loaded ADaM dataset (§2 Step 4). The only permitted dataset access is reading column names/labels/types to resolve a variable mapping (§2 Step 2), and the treatment variable's distinct values among the analysis population (§2 Step 4). Every other fact in the output file — Big N, other factor levels, category order, treatment group order — must trace back to the SAP, the Shell template, or standard CDISC convention, never to this task's own inspection of the dataset's content.

## 10. Execution Checklist

Before writing the output file, confirm:

- [ ] All analysis items from the SAP section for this TFL are captured (no omissions)
- [ ] Each row contains only ONE parameter/endpoint (grouped items have been split)
- [ ] `Name`, `Statistics` and `Number of decimal places` are verbatim from the SAP; the other columns follow their own §3 rules (§4 rule 5)
- [ ] Every `Statistical Method` is `None` (exactly when `P-value Required` is `No`), one of the names listed in §3 column 5, or `Other: <source wording>`; a defaulted test is noted in its row's Note and reported to the user
- [ ] Every `Categorical` row's Note starts with `Missing: shown as "<label>"` or `Missing: not shown`
- [ ] ADaM Variable names are ≤ 8 characters per CDISC standards, and — if their existence was checked at all — that check was limited to column names only (§2 Step 2), never dataset content
- [ ] Factor levels are sourced from the SAP or Shell template text (or CDISC convention when neither states them), never from inspecting the dataset's actual values (§2 Step 4, §3d) — except the treatment variable's names, which are the data's values among the analysis population, in SAP/Shell order, with `source` = `data`; documented in dedicated §3d table with the correct `source` value, NOT in Note column; no `levels` cell contains `Total` or a Missing label
- [ ] Treatment variable is the Actual variant (`TRT01A` / `TRTA`) unless SAP specifies otherwise
- [ ] Shell template (if present) was read first and Total Required / P-value Required columns are set based on Shell structure
- [ ] Every row in the Column Layout table has a non-empty `R Dataframe Column` value, and Arm/Total values match the corresponding `big_n` key verbatim (not the rendered header text)
- [ ] Every footnote reference is in the `(label)` form of the Footnotes table — in Header Text, and as a Programming Notes bullet for a body row — and no Shell `[n]` marker remains
- [ ] Population filter criteria was resolved once per the precedence rule in §2 Step 1 (Shell explicit statement > SAP > convention) — not re-derived or reconsidered after this point — and is the same R expression in the Target Table and the Programming Notes
- [ ] The Programming Notes have a `P-value display` bullet whenever any item has `P-value Required = Yes`
- [ ] `Protocol Number` is copied verbatim from the Shell, the SAP or the task's instructions per §2 Step 1b — never taken from `STUDYID` or invented — or reads `Not stated in source documents` when none of them states it
- [ ] `TFL Number` holds the human-readable number as stated in the Shell/SAP (e.g., `Table 14-2.01`), per §2 Step 1a — not the `{{ tfl_id }}` file-naming slug (e.g., `table_14_2_01`) and not a value invented by reformatting it
- [ ] No subject counts (Big N) were computed from the loaded ADaM dataset anywhere in this task, and no Shell-stated `(N=xxx)` value was "corrected" against an observed count (§2 Step 4) — Big N is a runtime concern for the R-generation skill, never a fact recorded in this spec
- [ ] No other data-content aggregation, enumeration, or row preview occurred either — no `count()`, `table()`, `summary()`, `unique()`, `levels()`, `head()`, `str()`, `glimpse()`, or `View()` was called against a loaded ADaM dataset anywhere in this task (§2 Step 4), apart from the `unique()` of the treatment variable among the analysis population; any other dataset access was limited to column names/labels/types

### Post-Write Verification (mechanical, bounded)

After the file is written, verify it by reading the file once and answering each checklist item above with **Yes/No only** — do not re-open questions the checklist item does not ask (e.g., do not re-litigate which population flag is correct if the checklist item is only checking that the value is consistent across sections). If every item is `Yes`, stop — the task is complete; do not perform additional rounds of review, and do not restart data investigation or file generation. If any item is `No`, make the minimal targeted `edit` needed to fix that specific item, then re-check only that item — do not re-run the full checklist or re-read source documents from scratch. This mechanical form exists specifically to prevent open-ended free-form re-reasoning about already-resolved decisions (e.g., population flag choice) from spiraling into an extended, unbounded review pass.
