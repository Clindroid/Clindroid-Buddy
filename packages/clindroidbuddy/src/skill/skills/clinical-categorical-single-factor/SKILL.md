---
name: clinical-categorical-single-factor
description: Generates clinical trial tables for categorical variables (e.g., Sex, Race, Age Group) using OCCDS-type datasets where each row is a category count with n (%). Handles pivot_wider-based ARD construction with treatment group columns and p-value computation by the spec's test (Pearson's chi-square, Fisher's exact, or Fisher-Freeman-Halton test). Outputs Clindroid ARD JSON files conforming to the `clindroid-ard-json` skill definitions.
---

## 1. Role & Identity

You are the **Clinical Categorical Single-Factor Generator**. Your mission is to generate regulatory-compliant Tables for categorical variables (demographics, adverse event summaries, etc.) from OCCDS-type or ADSL datasets where each row represents a category count with `n (%)`. You use a `pivot_wider()` approach to spread treatment groups into columns and produce Clindroid ARD JSON output.

## 2. Workflow Steps

Follow these steps **in order** for every categorical table generation task:

1. **Read TFL Spec**: Read the relevant TFL specification file from `docs/specs/tfls/{tfl_id}.md`. This is the primary and most authoritative document — all decisions about row structure, statistics, treatment groups, footnotes, headers, population filter, decimal precision, factor level ordering (category order), and TFL number/title must come from this spec first. Read its Column Layout table too: it fixes the order, dataframe names and headers of the body columns, and the program transcribes it (`r-coder-complex-table` §10.2). If no spec file exists for the requested table, stop and inform the user that a TFL specification is required before generation can proceed.
2. **Investigate Datasets**: Load ADSL and any relevant OCCDS ADaM dataset using `haven::read_xpt()`. Inspect variable names, labels (SAS labels preserved as R attributes), levels of categorical variables, treatment group values, and population flags (e.g., `SAFFL`, `ITTFL`). Use actual data to verify the spec's assumptions — if a discrepancy is found, document it in comments but follow the TFL spec for output decisions. There are exactly two exceptions, and in both the table follows the data with a `warning()` naming the difference so the spec can be corrected: the treatment-group names (§6 "Treatment Group Levels"), and a category value the spec's Factor Levels do not list, which is rendered as its own row (§4.3 rule 2). When you check values from the shell, follow "Running R from the Shell" in the R Function Reference (§3): single-quoted `Rscript -e`, `dplyr::count()` for a variable's values, and never a whole dataset printed.
3. **Determine Table Structure**: Based on the TFL spec and dataset content:
    1. **Identify Categorical Variables**: Extract all categorical variables from the spec (e.g., `SEX`, `RACE`, `AGEGR`). These define which factor-level breakdowns to produce as rows in the table.
    2. **Establish Treatment Group Order**: The order is exactly the order the TFL Spec's Factor Levels table (§3d) lists for the treatment variable — do not reorder it by any rule of your own (e.g. Placebo first); placing the groups is the spec's job. The dataset's numeric sorting variable (e.g., `TRT01AN` for ADSL), when available, is used only to place a data value the spec does not list; it never overrides the spec's stated order. The group **names** come from the data: build `trt_levels` with `reconcile_trt_levels()` (§6 "Treatment Group Levels") on the population-filtered ADSL, so the treatment columns and `big_n` keys are exactly the data's values, and a mismatch with the spec is reported in a warning instead of turning an arm into `NA`.
    3. **Define Denominator Source**: Identify the Big N source and denominator population as defined by the spec.
4. **Calculate Big N**: Derive subject counts per treatment group from ADSL using the appropriate population flag (as specified in the TFL Spec). Store as a named integer vector — these are fixed denominators for all percentage calculations across every categorical variable in this table.
5. **Generate Statistics per Categorical Variable**: For each categorical item of the spec's Analysis Items table, call `categorical_block()` once (§4.2), with the item's display map, Missing Note, percentage decimals and — when its `P-value Required` is `Yes` — its `Statistical Method`. The function counts, computes percentages on the Big N from step 4, formats `"n (%)"` and computes the p-value; never do any of it by hand.
6. **Build ARD Dataframe**: Collect the blocks in `ard_blocks`, check their columns, then `dplyr::bind_rows()` and `dplyr::arrange(ord_group)` them (§5, §8). Each block already carries its header row, the `n` row, `group` (the item's name, on every row) and `ord_group` (the item's 1-based position in the spec's Analysis Items table); both are kept in the output.
7. **Assemble JSON Payload**: Wrap the ARD rows in the full Clindroid ARD JSON structure conforming to the `clindroid-ard-json` skill definitions.
8. **Write Output Files**: Write the R program to `programs/tfls/{tfl_id}.r` and the JSON file to `tfls/{tfl_id}.json` (`clindroid-ard-json` §1: no prefix, e.g. `programs/tfls/table_14_2_01.r`). **Every file name — program, JSON and RTF — is all lowercase, extension included** (`clindroid-ard-json` §1: a regulatory submission requirement); a `tfl_id` or requested name with an uppercase letter is lowercased, and the response says so. **Do NOT attempt to read any `.r` files from `programs/tfls/` — these are generated outputs, not inputs.** The same R program must then render `tfls/{tfl_id}.rtf` from that JSON: its **last line** is `render_ard_rtf(json_payload, "tfls/{tfl_id}.rtf")` — the same `json_payload` list just passed to `write_json()`, whose `rows` is the ARD data frame, so nothing is read back from the JSON file — using the function copied verbatim from the Shared Helpers block (§3). **Never build the r2rtf pipeline yourself and never call `r2rtf::write_rtf()` directly**: given anything other than `rtf_encode()` output — the JSON payload list, a data frame — `write_rtf()` writes a plain-text file that no RTF reader can open, without an error. `render_ard_rtf()` stops if the file it wrote is not RTF. **RTF generation is mandatory for every TFL** — do not deliver a program that stops at the JSON file. `clindroid-rtf-rendering` explains what the function does; read it when an RTF looks wrong.

9. **Run R Program & Verify Execution**: After writing the R program, execute it using `Rscript programs/tfls/{tfl_id}.r` and verify that:
    - The script runs without errors (exit code 0). If an error occurs, read the error output, fix the corresponding section in the R program, save it, and re-run until execution succeeds. Do not proceed to Step 10 unless the script executes cleanly.
    - The output JSON file is created at `tfls/{tfl_id}.json`. If missing after a successful run, investigate and fix before proceeding.
    - The output RTF file is created at `tfls/{tfl_id}.rtf` and passes `clindroid-rtf-rendering` §5 verification (starts with `{\rtf1`, not a suspiciously tiny file — a run that skipped `rtf_encode()` still "succeeds" with no error, see §4 there). If missing or malformed after a successful run, investigate and fix before proceeding.

10. **Verify ARD Output Against TFL Spec & Shell Template**: After writing the R program and JSON output, perform a verification pass by reading back both the TFL spec (`docs/specs/tfls/{tfl_id}.md`) and the Shell template (if present at `docs/specs/shells/{tfl_id}.md`). Check every item below before declaring generation complete. If any check fails, fix the R program and regenerate — do not deliver incomplete output.

    ### 10a. TFL Spec Compliance Checks
    - [ ] **Analysis Items**: Every categorical variable listed in the spec's Analysis Items table is present as rows in the ARD JSON (one group of category-rows per variable). No variables from the spec are missing; no extra variables exist that were not specified.
    - [ ] **Category Coverage**: All factor levels for each categorical variable appear as separate ARD rows, including zero-count categories rendered as `"0 (0.0%)"`, with labels as the spec's Factor Levels table writes them (e.g., `<65 yrs`, `65-80 yrs`, `>80 yrs`). The Shell's wording is not a criterion for row labels.
    - [ ] **Decimal Precision**: Percentage formatting follows 1 decimal place by default; if the spec states a different rule, apply it verbatim via `sprintf()`.
    - [ ] **Treatment Group Order**: The order of treatment-group properties in each row object matches the order the spec's Factor Levels table (§3d) lists for the treatment variable, with Total last if present. This comes from the final dataframe's column order — control it via `trt_levels` factor levels, not manual key reordering.
    - [ ] **Big N Values**: Each value in `big_n` matches subject counts from ADSL using the population flag defined in the spec.
    - [ ] **Column Layout**: The written JSON's `columns` equals the headers transcribed from the spec's Column Layout, and the body keys of each row object (every key except `group`/`ord_group`) are its R Dataframe Columns in Position order (`r-coder-complex-table` §10.2).
    - [ ] **Footnote Markers**: Every footnote marker in `columns` or in a row label is the `(a)`-form label of an entry in the spec's Footnotes table, and the JSON `footnotes` array is that table (`r-coder-complex-table` §10.2 "Footnote markers"). No Shell-style `[1]` marker remains.
    - [ ] **No Duplicate Vocabulary**: For each categorical variable, list the row labels that are not in the spec's Factor Levels. Each one must be a category the spec genuinely omits (it is also named in the run log's "rendered verbatim" warning), or the Missing row the item's Note asks for. If any of them is another spelling of a spec label that shows `0 (0.0%)` in Total (`BLACK OR AFRICAN AMERICAN` beside a zero `Black`, `M` beside a zero `Male`), the map is mis-keyed (§4.3): fix the keys and regenerate.

    ### 10b. Shell Template Compliance Checks (if shell exists)
    - [ ] **Total Column**: If the TFL Spec's `Total Required` column is `Yes`, verify that a `"Total"` property exists in every row object AND as a key in the `big_n` object. The Total Big N must equal the sum of all individual arm Big N values. If it is `No`, neither exists.
    - [ ] **P-value Column**: For every item whose `P-value Required` is `Yes`, the p-value comes from `categorical_p_value()` with that item's `Statistical Method` copied character for character (§7 "P-value Input"), is formatted by `format_p_value()` per the Programming Notes' `P-value display` bullet (default: 3 decimal places, `<0.001` below that), and sits as a plain column/property on the variable's header row (there is no dedicated `p_value` schema field — see `clindroid-ard-json`). Items with `P-value Required = No` carry no p-value.

    ### 10c. Internal Consistency Checks
    - [ ] **n + % Reconciliation**: For each category row (not the `n` row, which has no percentage), parse the value string to extract n and percentage. Verify: `(n / Big N for that arm) * 100` equals the displayed percentage (within rounding tolerance of ±0.1%). Flag any mismatches.
    - [ ] **Zero-Count Handling**: If any treatment group has zero subjects in a category, verify it is rendered as `"0 (0.0%)"` and not omitted from the output.
    - [ ] **Schema Compliance**: The JSON file conforms to the Clindroid ARD JSON Schema (`clindroid-ard-json` §4). All required top-level fields are present with correct types (`protocol_number`: string, `big_n`: object of integers, `rows`: array of row objects mirroring the final dataframe, etc.). Specifically confirm `tfl_number` holds the human-readable value from the TFL Spec's `TFL Number` field (e.g., `"Table 14-2.01"`) and is distinct from `tfl_id` (e.g., `"table_14_2_01"`) — the rendered RTF title uses `tfl_number`, never `tfl_id` (`clindroid-rtf-rendering` §2) — and that `protocol_number` and `analysis_population` are the Target Table's `Protocol Number` and `Analysis Population` values, not an example value such as `"XYZ-123"`.
    - [ ] **RTF Output**: `tfls/{tfl_id}.rtf` exists, was rendered by `render_ard_rtf()` from the same `json_payload` written to the JSON (no other r2rtf call or `write_rtf()` in the program), starts with `{\rtf1`, and is not a suspiciously tiny file.

## 3. Technical Stack

- **Language:** R (Native pipe `|>` is preferred).
- **Core Packages:** `tidyverse` (dplyr, tidyr, purrr), **`haven`**, **`jsonlite`**, and **`r2rtf`** (mandatory for RTF rendering — see the `clindroid-rtf-rendering` skill).
- **Constraint:** **Strictly avoid** Pharmaverse-specific high-level wrappers (e.g., `admiral`, `rtables`, `tern`). Use Tidyverse and Haven for all logic to ensure transparency and flexibility in Clindroid Buddy environments.

### Coding Rules

- After importing packages with `library()`, always call functions using the `package::function` syntax (e.g., `dplyr::summarise()`). This prevents namespace conflicts and makes dependencies explicit.
- Compute p-values only through `categorical_p_value()` (§7 "P-value Input"), never by calling `stats::chisq.test()`/`stats::fisher.test()` directly.

### Shared Helpers
The Shared Helpers block below holds the functions every generated program needs: `reconcile_trt_levels()` (§6), `bind_display_factor()` (§4.3), `categorical_p_value()` and `format_p_value()` (§7), and `stored_decimals()`/`continuous_p_value()`, which a purely categorical table does not call. It also holds `render_ard_rtf()`, which writes the RTF (Step 8), and `rtf_escape()`, which that function uses. Copy **the whole block, verbatim**, into the program right after its `library()` calls. Do not edit them, and do not reimplement any of their logic inline: they carry the decisions that must be the same in every table, and the same block appears, identical, in `r-coder-complex-table` and `clinical-bds-multi-param`. When one of them stops with a message that says to ask the user, ask; do not work around it.

```r
# ==============================================================================
# Clindroid table helpers
#
# Copy this whole block, verbatim, into each generated table program, right after its
# library() calls. Do not edit the functions inside a program and do not reimplement any
# of them inline: they hold the decisions that must be identical in every table.
#
# The same block appears, identical, in the "Shared Helpers" section of
# r-coder-complex-table, clinical-categorical-single-factor and clinical-bds-multi-param;
# a test (test/skill/table-helpers.test.ts) fails when the copies differ, so change all
# three together.
# ==============================================================================

# Treatment-group levels: the spec's Factor Levels order, reconciled with the data.
# The data is the authority on the names, because a Shell often shortens them. A spec
# name the data does not hold is dropped. A data value the spec does not list is added
# after the spec's names, ordered by the numeric sort variable (TRT01AN/TRTAN) when one
# is given, alphabetically otherwise. Either case is reported in a warning so the spec
# can be corrected. total: TRUE when the spec's Total Required is Yes, which appends
# "Total" as the last level. A "Total" in spec_levels is ignored, because it is not a
# data value. Call it on the population-filtered ADSL: arms outside the population
# (e.g. a screen-failure arm) must not become columns.
reconcile_trt_levels <- function(values, spec_levels, var_name, sort_values = NULL, total) {
  spec_levels <- setdiff(spec_levels, "Total")
  values      <- as.character(values)
  keep        <- !is.na(values) & trimws(values) != ""
  observed    <- unique(values[keep])
  absent      <- setdiff(spec_levels, observed)
  extra       <- setdiff(observed, spec_levels)
  if (length(extra) > 0) {
    extra <- if (is.null(sort_values)) sort(extra) else
      extra[order(tapply(sort_values[keep], values[keep], min)[extra], extra)]
  }
  if (length(absent) > 0 || length(extra) > 0) {
    warning(sprintf(paste0(
      "%s: spec treatment group(s) [%s] are not in the data and were dropped; data value(s) ",
      "[%s] are not in the spec and were added. Update the spec's Factor Levels to the data's values."),
      var_name, paste(absent, collapse = ", "), paste(extra, collapse = ", ")))
  }
  c(intersect(spec_levels, observed), extra, if (total) "Total")
}

# Decimal places a continuous variable is stored with: the most decimals among its
# non-missing values. A value stored unrounded (e.g. an un-rounded derivation) shows up
# as 10 decimals at the 10-digit probe; "stored + 1" is meaningless then, so stop and
# ask the user for the decimal places instead of guessing.
stored_decimals <- function(x, var_name) {
  x <- x[!is.na(x)]
  if (length(x) == 0) return(0L)
  dec <- max(nchar(sub("0+$", "", sub("^[^.]*[.]?", "", formatC(x, format = "f", digits = 10)))))
  if (dec >= 10) stop(sprintf("%s is not stored at a fixed number of decimals; ask the user for its decimal places", var_name))
  as.integer(dec)
}

# Binds a categorical variable's coded data values to the TFL Spec's display labels and
# returns them as a factor whose levels are in display order.
# spec_map: coded value (as the data holds it, copied from dplyr::count() output) ->
# display label from the spec's Factor Levels, in the spec's display order.
# missing_label: the label from the spec's `Missing: shown as "<label>"` Note, or NULL
# when the Note says `Missing: not shown`. NA and blank values are the missing values.
# Observed values the spec does not list are appended verbatim, sorted, after the spec's
# levels, with a warning. Stops when spec keys and data values fail to meet on both
# sides, which means the keys are mis-written, not that the spec is incomplete.
# confirmed_absent: spec keys that dplyr::count() shows truly have no subjects in this
# data cut, while some other unlisted value is present.
bind_display_factor <- function(values, spec_map, var_name, missing_label = NULL,
                                confirmed_absent = character(0)) {
  values   <- as.character(values)
  is_miss  <- is.na(values) | trimws(values) == ""
  observed <- unique(values[!is_miss])
  extra    <- sort(setdiff(observed, names(spec_map)))
  unbound  <- setdiff(names(spec_map), c(observed, confirmed_absent))
  if (length(unbound) > 0 && length(extra) > 0) {
    stop(sprintf(paste0(
      "%s: spec key(s) [%s] match no value in the data, while data value(s) [%s] match no ",
      "spec key. The map's keys must be the data's coded values exactly as ",
      "dplyr::count() prints them; re-pair them with the spec's labels. Only if count() shows ",
      "a spec level truly has no subjects, pass its key in confirmed_absent."),
      var_name, paste(unbound, collapse = ", "), paste(extra, collapse = ", ")))
  }
  if (length(extra) > 0) {
    warning(sprintf("%s holds value(s) absent from the spec's Factor Levels; rendered verbatim: %s",
                    var_name, paste(extra, collapse = ", ")))
  }
  display_map <- c(spec_map, stats::setNames(extra, extra))
  if (!is.null(missing_label) && missing_label %in% display_map) {
    stop(sprintf(paste0(
      "%s: the missing-value label \"%s\" is also a category label. A Missing row comes from ",
      "the item's Note only; remove it from the spec's Factor Levels and from spec_map."),
      var_name, missing_label))
  }
  display <- unname(display_map[values])   # missing values come out as NA here
  if (any(is_miss) && is.null(missing_label)) {
    warning(sprintf("%s holds missing value(s); excluded from the counts, as the spec shows no Missing row",
                    var_name))
  }
  if (!is.null(missing_label)) display[is_miss] <- missing_label
  factor(display, levels = c(unname(display_map), missing_label))
}

# p-value of a categorical item. tab: the contingency table of treatment group x display
# category, with the Total copy and missing values removed. All-zero rows and columns (the
# empty "Total" level, a spec category with no subjects) are dropped here, because
# chisq.test() returns NaN on them. method: the item's Statistical Method in the spec,
# which is one of these names
# exactly (tfl-spec-writer §3 column 5):
#   "Pearson's chi-square test"  (no continuity correction, as the name says)
#   "Fisher's exact test"        (a 2 x 2 table)
#   "Fisher-Freeman-Halton test" (a table larger than 2 x 2)
#   "Pearson's chi-square test; exact test if any expected count < 5"
# Anything else stops: choosing a test is the spec's job, never this program's.
# stats::fisher.test() computes both exact tests. When the spec's exact-test name does not
# fit the table's size (a category the spec does not list made it larger), the p-value is
# still the exact test's, and a warning asks for the spec and its footnote to be corrected.
# The exact algorithm can fail on a large table; that stops the run, because changing
# `workspace` or simulating the p-value is the user's call.
categorical_p_value <- function(tab, method, var_name) {
  tab <- tab[rowSums(tab) > 0, colSums(tab) > 0, drop = FALSE]
  if (nrow(tab) < 2 || ncol(tab) < 2) {
    stop(sprintf(paste0(
      "%s: no test is possible on a %d x %d table; it needs at least two treatment groups and ",
      "two categories with subjects. Ask the user how to show the p-value."),
      var_name, nrow(tab), ncol(tab)))
  }
  exact_name <- if (nrow(tab) == 2 && ncol(tab) == 2) "Fisher's exact test" else "Fisher-Freeman-Halton test"
  exact_p <- function() {
    tryCatch(stats::fisher.test(tab)$p.value, error = function(e) stop(sprintf(
      "%s: the exact test failed (%s); ask the user how to proceed (a different `workspace`, or `simulate.p.value = TRUE`)",
      var_name, conditionMessage(e))))
  }
  if (method %in% c("Fisher's exact test", "Fisher-Freeman-Halton test")) {
    if (method != exact_name) {
      warning(sprintf("%s: the spec names the %s, but the table is %d x %d, so this is the %s. Correct the spec's Statistical Method and footnote.",
                      var_name, method, nrow(tab), ncol(tab), exact_name))
    }
    return(exact_p())
  }
  if (method == "Pearson's chi-square test") return(stats::chisq.test(tab, correct = FALSE)$p.value)
  if (method == "Pearson's chi-square test; exact test if any expected count < 5") {
    expected <- suppressWarnings(stats::chisq.test(tab, correct = FALSE))$expected
    if (any(expected < 5)) return(exact_p())
    return(stats::chisq.test(tab, correct = FALSE)$p.value)
  }
  stop(sprintf("%s: no categorical test is implemented for the spec's Statistical Method '%s'; ask the user",
               var_name, method))
}

# p-value of a continuous item. values: the analysis variable; groups: the treatment
# factor, both from the population-filtered data WITHOUT the Total copy. Missing values
# and empty levels (e.g. "Total") are dropped here. method: the item's Statistical Method
# in the spec, one of these names exactly (tfl-spec-writer §3 column 5):
#   "ANOVA"                  (two or more groups)
#   "Two-sample t-test"      (two groups, pooled variance)
#   "Welch's t-test"         (two groups, unequal variances)
#   "Wilcoxon rank-sum test" (two groups; R's default: exact p-value for fewer than 50
#                             values without ties, otherwise the normal approximation
#                             with continuity correction)
#   "Kruskal-Wallis test"    (two or more groups)
# Anything else stops: choosing a test is the spec's job, never this program's.
continuous_p_value <- function(values, groups, method, var_name) {
  keep     <- !is.na(values) & !is.na(groups)
  values   <- values[keep]
  groups   <- droplevels(factor(groups[keep]))
  n_groups <- nlevels(groups)
  two_only <- c("Two-sample t-test", "Welch's t-test", "Wilcoxon rank-sum test")
  if (n_groups < 2 || (method %in% two_only && n_groups != 2)) {
    stop(sprintf("%s: the %s cannot be run on %d treatment group(s) with data; ask the user",
                 var_name, method, n_groups))
  }
  if (method == "ANOVA") return(summary(stats::aov(values ~ groups))[[1]][["Pr(>F)"]][1])
  if (method == "Two-sample t-test") return(stats::t.test(values ~ groups, var.equal = TRUE)$p.value)
  if (method == "Welch's t-test") return(stats::t.test(values ~ groups)$p.value)
  if (method == "Wilcoxon rank-sum test") return(stats::wilcox.test(values ~ groups)$p.value)
  if (method == "Kruskal-Wallis test") return(stats::kruskal.test(values ~ groups)$p.value)
  stop(sprintf("%s: no continuous test is implemented for the spec's Statistical Method '%s'; ask the user",
               var_name, method))
}

# One analysis item's block of the ARD: a header row carrying the item's name (and its
# p-value), then the item's rows, with `group` (the item's name) and `ord_group` (its
# 1-based position in the spec's Analysis Items table) on every row. Build every block
# with continuous_block() or categorical_block() below; never assemble one by hand, and
# never put a p-value on any row but the header row. header_row = FALSE only when the
# user has asked for the item name as a column of its own (then the p-value goes on the
# item's first row and the program adds that column itself).
finish_block <- function(body, item_name, ord_group, p_value, header_row) {
  body <- dplyr::mutate(body, dplyr::across(dplyr::everything(), as.character))
  if (header_row) body <- dplyr::bind_rows(tibble::tibble(label = item_name), body)
  body <- dplyr::mutate(body, dplyr::across(-label, ~ tidyr::replace_na(.x, "")))
  if (!is.null(p_value)) body <- dplyr::mutate(body, p_value = dplyr::if_else(dplyr::row_number() == 1, p_value, ""))
  dplyr::mutate(body, ord_group = as.integer(ord_group), group = item_name, .before = 1)
}

# The item's values with their treatment group as a factor over trt_levels, plus a copy
# relabelled "Total" when "Total" is in trt_levels. Stops on a treatment value outside
# trt_levels, which would otherwise drop out of every column silently.
block_data <- function(data, var, trt_var, trt_levels) {
  arms <- setdiff(trt_levels, "Total")
  base <- tibble::tibble(trt = as.character(data[[trt_var]]), value = data[[var]])
  bad  <- setdiff(unique(stats::na.omit(base$trt)), trt_levels)
  if (length(bad) > 0) stop(sprintf("%s holds value(s) outside trt_levels: %s", trt_var, paste(bad, collapse = ", ")))
  base <- dplyr::filter(base, trt %in% arms)
  dplyr::bind_rows(base, if ("Total" %in% trt_levels) dplyr::mutate(base, trt = "Total")) |>
    dplyr::mutate(trt = factor(trt, levels = trt_levels))
}

# Block of a continuous item. data: the population-filtered data (for BDS, the item's
# records), WITHOUT a Total copy — the Total column is computed here when "Total" is in
# trt_levels. stats: the spec's Statistics tokens, in order, each its own row labelled
# with the token: "n", "Mean", "SD", "Median", "Min", "Max", or the combined tokens
# "Mean (SD)" and "Median [Min-Max]" when the spec writes them. digits: decimal places
# per statistic from the spec's Number of decimal places, e.g.
# c(Mean = 1, SD = 2, Median = 1, Min = 1, Max = 1); NULL when the spec says None, which
# applies the defaults (Mean/Median stored + 1, SD stored + 2, Min/Max stored).
# method: the item's Statistical Method when its P-value Required is Yes, else NULL.
# n counts non-missing values; a statistic with no value prints "NA".
continuous_block <- function(data, var, item_name, ord_group, trt_levels, trt_var = "TRT01A",
                             stats = c("n", "Mean", "SD", "Median", "Min", "Max"), digits = NULL,
                             method = NULL, p_digits = 3L, header_row = TRUE) {
  all_stats <- c("Mean", "SD", "Median", "Min", "Max")
  combined  <- list("Mean (SD)" = c("Mean", "SD"), "Median [Min-Max]" = c("Median", "Min", "Max"))
  unknown   <- setdiff(stats, c("n", all_stats, names(combined)))
  if (length(unknown) > 0) stop(sprintf("%s: statistic(s) %s are not implemented; ask the user", item_name, paste(unknown, collapse = ", ")))
  df <- block_data(data, var, trt_var, trt_levels)
  if (is.null(digits)) {
    d      <- stored_decimals(df$value, var)
    digits <- c(Mean = d + 1L, SD = d + 2L, Median = d + 1L, Min = d, Max = d)
  }
  needed <- intersect(all_stats, unlist(c(stats, combined[intersect(stats, names(combined))])))
  if (length(setdiff(needed, names(digits))) > 0) {
    stop(sprintf("%s: no decimal places given for %s", item_name, paste(setdiff(needed, names(digits)), collapse = ", ")))
  }
  digits <- c(digits, stats::setNames(rep(0L, length(setdiff(all_stats, names(digits)))), setdiff(all_stats, names(digits))))
  fmt <- function(v, s) dplyr::if_else(is.na(v), "NA", sprintf("%.*f", as.integer(digits[[s]]), v))
  body <- df |>
    dplyr::group_by(trt, .drop = FALSE) |>
    dplyr::summarise(
      n      = sum(!is.na(value)),
      Mean   = if (n > 0) base::mean(value, na.rm = TRUE) else NA_real_,
      SD     = if (n > 1) stats::sd(value, na.rm = TRUE) else NA_real_,
      Median = if (n > 0) stats::median(value, na.rm = TRUE) else NA_real_,
      Min    = if (n > 0) base::min(value, na.rm = TRUE) else NA_real_,
      Max    = if (n > 0) base::max(value, na.rm = TRUE) else NA_real_,
      .groups = "drop"
    ) |>
    dplyr::mutate(
      n = sprintf("%d", n), Mean = fmt(Mean, "Mean"), SD = fmt(SD, "SD"),
      Median = fmt(Median, "Median"), Min = fmt(Min, "Min"), Max = fmt(Max, "Max"),
      `Mean (SD)` = sprintf("%s (%s)", Mean, SD),
      `Median [Min-Max]` = sprintf("%s [%s-%s]", Median, Min, Max)
    ) |>
    tidyr::pivot_longer(-trt, names_to = "label", values_to = "value") |>
    dplyr::filter(label %in% stats) |>
    dplyr::mutate(ord_row = match(label, stats)) |>
    tidyr::pivot_wider(id_cols = c(ord_row, label), names_from = trt, values_from = value) |>
    dplyr::arrange(ord_row) |>
    dplyr::select(-ord_row)
  p <- NULL
  if (!is.null(method)) {
    real <- dplyr::filter(df, trt != "Total")
    p    <- format_p_value(continuous_p_value(real$value, real$trt, method, item_name), item_name, p_digits)
  }
  finish_block(body, item_name, ord_group, p, header_row)
}

# Block of a categorical item: a header row, an `n` row (subjects with a non-missing
# value; show_n = FALSE only on the user's explicit instruction), then one row per
# category as "n (%)", zero counts included. data: the population-filtered data WITHOUT
# a Total copy. spec_map, missing_label, confirmed_absent: as for bind_display_factor(),
# which this calls. big_n: the Big N from ADSL (big_n_list), the denominator of every
# percentage. method: the item's Statistical Method when its P-value Required is Yes,
# else NULL; the test runs on the real treatment groups and the non-missing categories.
categorical_block <- function(data, var, item_name, ord_group, spec_map, trt_levels, big_n,
                              trt_var = "TRT01A", missing_label = NULL, method = NULL,
                              pct_digits = 1L, p_digits = 3L, show_n = TRUE, header_row = TRUE,
                              confirmed_absent = character(0)) {
  big_n <- unlist(big_n)
  if (length(setdiff(trt_levels, names(big_n))) > 0) {
    stop(sprintf("%s: big_n has no entry for %s", item_name, paste(setdiff(trt_levels, names(big_n)), collapse = ", ")))
  }
  df <- block_data(data, var, trt_var, trt_levels) |>
    dplyr::mutate(cat = bind_display_factor(value, spec_map, var, missing_label, confirmed_absent))
  shown <- setdiff(levels(df$cat), missing_label)
  n_row <- df |>
    dplyr::filter(cat %in% shown) |>
    dplyr::count(trt, .drop = FALSE) |>
    dplyr::mutate(ord_row = 0L, label = "n", value = sprintf("%d", n))
  cat_rows <- df |>
    dplyr::filter(!is.na(cat)) |>
    dplyr::count(trt, cat, .drop = FALSE) |>
    dplyr::mutate(ord_row = as.integer(cat), label = as.character(cat),
                  value = sprintf("%d (%.*f%%)", n, as.integer(pct_digits), 100 * n / big_n[as.character(trt)]))
  body <- dplyr::bind_rows(if (show_n) n_row, cat_rows) |>
    dplyr::select(ord_row, label, trt, value) |>
    tidyr::pivot_wider(id_cols = c(ord_row, label), names_from = trt, values_from = value) |>
    dplyr::arrange(ord_row) |>
    dplyr::select(-ord_row)
  p <- NULL
  if (!is.null(method)) {
    test <- dplyr::filter(df, trt != "Total", cat %in% shown)
    p    <- format_p_value(categorical_p_value(table(test$trt, test$cat), method, item_name), item_name, p_digits)
  }
  finish_block(body, item_name, ord_group, p, header_row)
}

# Escapes free text for RTF: r2rtf never escapes RTF's own `\`, `{`, `}`, and writes
# non-ASCII characters (Japanese, `±`, `°`, ...) as raw bytes that RTF readers garble.
# Backslashes and braces are escaped first; every remaining character with a code point
# >= 128 then becomes an RTF Unicode escape `\uc1\uNNNN?` (clindroid-rtf-rendering §7/§8).
rtf_escape <- function(x) {
  x <- gsub("\\", "\\\\", x, fixed = TRUE)
  x <- gsub("{", "\\{", x, fixed = TRUE)
  x <- gsub("}", "\\}", x, fixed = TRUE)
  vapply(x, function(s) {
    if (is.na(s) || !grepl("[^\x01-\x7F]", s)) return(s)
    chars <- strsplit(s, "")[[1]]
    ints  <- utf8ToInt(s)
    paste0(ifelse(ints < 128, chars,
                  ifelse(ints <= 32768, sprintf("\\uc1\\u%d?", ints), sprintf("\\uc1\\u%d?", ints - 65536))),
           collapse = "")
  }, character(1), USE.NAMES = FALSE)
}

# Renders the table's RTF with r2rtf from the JSON payload list — the same object just
# passed to jsonlite::write_json(), whose `rows` is the ARD data frame — so the RTF and the
# JSON come from one object and cannot disagree. The last call of every table program:
# render_ard_rtf(json_payload, "tfls/<tfl_id>.rtf").
# Never build the r2rtf pipeline by hand, and never call write_rtf() yourself: write_rtf()
# on anything but rtf_encode() output writes a plain-text dump that RTF readers cannot open,
# without an error. This function checks the written file and stops if it is not RTF.
# The design (no vertical rules, a rule above each analysis item, `(a)` footnotes, the
# runtime "(N=xx)" under each treatment group) is explained in clindroid-rtf-rendering.
# col_widths: relative column widths, one per element of the JSON `columns`; NULL gives
# 2 for the row-label column, 1.2 per treatment group, 1 for any other column.
# orientation: "landscape" only when the TFL Spec or Shell asks for it.
# item_header: TRUE checks that every analysis item starts with its header row (label =
# the item's name) and that p-values sit on header rows only; FALSE only for the
# user-instructed layout with the item name in a column of its own.
# File names must be lowercase for regulatory submission: it stops when tfl_id, the
# program file name or the RTF file name contains an uppercase letter.
render_ard_rtf <- function(ard, rtf_path, col_widths = NULL, orientation = "portrait",
                           item_header = TRUE) {
  file_names <- c(tfl_id = ard$tfl_id, program = basename(ard$program_path), rtf = basename(rtf_path))
  upper      <- file_names[file_names != tolower(file_names)]
  if (length(upper) > 0) {
    stop(sprintf("file names must be lowercase for regulatory submission: %s",
                 paste(sprintf("%s = %s", names(upper), upper), collapse = ", ")))
  }
  rows_df <- as.data.frame(ard$rows, stringsAsFactors = FALSE)
  # group/ord_group are structural keys with no header in `columns`: group marks where each
  # analysis item begins (a rule is drawn above it), then both are dropped.
  section_start <- !duplicated(rows_df$group)
  if (identical(ard$columns[1], "label")) {
    stop("columns[1] is \"label\": the row-label column's header is the Column Layout's Header Text, \"\" for (row label)")
  }
  if (item_header) {
    no_header <- rows_df$group[section_start & rows_df$label != rows_df$group]
    if (length(no_header) > 0) {
      stop(sprintf("item(s) without a header row: %s; build every block with continuous_block() or categorical_block()",
                   paste(no_header, collapse = ", ")))
    }
    stray <- !section_start & !is.na(rows_df$p_value) & rows_df$p_value != ""
    if (any(stray)) {
      stop(sprintf("p-value on rows other than the header row in: %s",
                   paste(unique(rows_df$group[stray]), collapse = ", ")))
    }
  }
  tbl   <- rows_df[, setdiff(names(rows_df), c("group", "ord_group")), drop = FALSE]
  tbl[] <- lapply(tbl, function(col) if (is.character(col)) rtf_escape(col) else col)
  if (ncol(tbl) != length(ard$columns)) {
    stop(sprintf("%s: rows have %d body columns but `columns` has %d headers",
                 rtf_path, ncol(tbl), length(ard$columns)))
  }
  header_str <- paste(vapply(ard$columns, function(h) {
    if (h %in% names(ard$big_n)) sprintf("%s\\line(N=%d)", rtf_escape(h), ard$big_n[[h]]) else rtf_escape(h)
  }, character(1), USE.NAMES = FALSE), collapse = "|")
  if (is.null(col_widths)) {
    col_widths    <- ifelse(ard$columns %in% names(ard$big_n), 1.2, 1)
    col_widths[1] <- 2
  }
  border_top_mat <- matrix("", nrow = nrow(tbl), ncol = ncol(tbl))
  border_top_mat[which(section_start), ] <- "single"

  rtf <- tbl
  if (orientation != "portrait") rtf <- r2rtf::rtf_page(rtf, orientation = orientation)
  rtf <- rtf |>
    r2rtf::rtf_page_header(text = rtf_escape(ard$protocol_number), text_justification = "l",
                           text_convert = FALSE) |>
    r2rtf::rtf_title(paste(rtf_escape(ard$tfl_number), rtf_escape(ard$tfl_title)),
                     subtitle = rtf_escape(ard$analysis_population), text_convert = FALSE) |>
    r2rtf::rtf_colheader(header_str, col_rel_width = col_widths, text_convert = FALSE,
                         border_left = NULL, border_right = NULL) |>
    r2rtf::rtf_body(col_rel_width = col_widths, text_convert = FALSE,
                    text_justification = c("l", rep("c", ncol(tbl) - 1)),
                    border_left = NULL, border_right = NULL,
                    border_top = border_top_mat, border_first = "single")
  if (NROW(ard$footnotes) > 0) {
    fn  <- ard$footnotes[order(ard$footnotes$ord), , drop = FALSE]
    rtf <- r2rtf::rtf_footnote(rtf, paste(sprintf("(%s) %s", rtf_escape(fn$label), rtf_escape(fn$text)),
                                          collapse = "\\line"),
                               text_convert = FALSE, border_left = NULL, border_right = NULL)
  }
  rtf |>
    r2rtf::rtf_source(sprintf("Source: %s", rtf_escape(ard$program_path)), text_justification = "l",
                      text_convert = FALSE) |>
    r2rtf::rtf_encode() |>
    r2rtf::write_rtf(file = rtf_path)
  if (!identical(readChar(rtf_path, 6L, useBytes = TRUE), "{\\rtf1")) {
    stop(sprintf("%s was written but is not an RTF file", rtf_path))
  }
  invisible(rtf_path)
}

# Display string of a p-value: `digits` decimal places, and "<0.001" (for digits = 3)
# when the value is below the smallest displayable one. digits comes from the spec's
# Programming Notes "P-value display" bullet; it is 3 when the SAP states no rule.
# NA/NaN stops: it means the test was given a degenerate table or group, which must be
# fixed, not printed.
format_p_value <- function(p, var_name, digits = 3L) {
  if (is.na(p)) stop(sprintf("%s: the p-value is NA/NaN; check the table or groups passed to the test", var_name))
  threshold <- 10^-digits
  if (p < threshold) return(sprintf("<%.*f", digits, threshold))
  sprintf("%.*f", digits, p)
}
```

### R Function Reference
<!-- r-function-reference:start -->
Consult this reference before writing or fixing R code. Use the exact argument names and signatures below — do not invent argument names that are not listed here. If a function you need is not listed, run `help(function_name)` and confirm its signature before use rather than guessing.

This reference appears, identical, in the three table skills (`r-coder-complex-table`, `clinical-categorical-single-factor`, `clinical-bds-multi-param`); a test fails when the copies differ, so change all three together. The Shared Helpers block above holds the functions every generated program copies verbatim (`reconcile_trt_levels()`, `stored_decimals()`, `bind_display_factor()`, `categorical_p_value()`, `continuous_p_value()`, `format_p_value()`). Where an entry below names one of them, call the helper rather than the underlying function.

#### 0. Running R from the Shell

When you check data with `Rscript -e` (Step 2), keep the output to what you need:

- **Wrap the R code in single quotes and use double quotes inside it**: `Rscript -e 'print(dplyr::count(adsl, SEX))'`. Inside double quotes the shell replaces `$name` before R runs, so `Rscript -e "unique(adsl$SEX)"` runs `unique(adsl)` and prints the whole dataset — thousands of tokens, and not the values you asked for. In one-liners write `adsl[["SEX"]]` rather than `adsl$SEX`, which is safe under either quoting.
- **Look at a categorical variable with `dplyr::count()`**: it prints each value once with its count, and its output is what the map keys of `categorical_block()` are copied from. Several variables in one run: `Rscript -e 'adsl <- haven::read_xpt("data/adam/adsl.xpt"); for (v in c("SEX", "RACE", "AGEGR1")) print(dplyr::count(adsl, .data[[v]]))'`.
- **Never print a whole dataset to look at a few variables** (`print(adsl)`, `unique(adsl)`, `head(adsl)`, `str(adsl)`); use `names(adsl)` for the variable list.

#### 1. Data Loading

| Function | Signature | Notes |
|---|---|---|
| `haven::read_xpt(file)` | `file` = path string | Returns a tibble; SAS labels live in each column's `label` attribute, not as data. Numeric SAS dates/times are NOT auto-converted — check attributes before treating a column as a `Date`. A missing character value comes back as `""`, not `NA`. |
| `here::here(...)` | path segments as `...` | Builds a path relative to the project root. Do not mix with hard-coded absolute paths in the same script. |

#### 2. Data Wrangling (dplyr)

| Function | Signature | Notes |
|---|---|---|
| `dplyr::filter(.data, ...)` | logical conditions as `...` | Multiple conditions are ANDed; use `|` explicitly for OR. |
| `dplyr::mutate(.data, ...)` | `new_col = expr` pairs | Expressions run row-wise unless wrapped in a grouped context. |
| `dplyr::select(.data, ...)` | column names (bare or `dplyr::all_of(character_vector)`) | Use `dplyr::all_of()` when column names come from a variable, not a literal. |
| `dplyr::rename(.data, new = old)` | `new_name = old_name` | Order is new on the left, old on the right — easy to reverse by mistake. |
| `dplyr::count(.data, ..., .drop = TRUE)` | grouping columns as `...` | Returns a tibble with an `n` column. Does **not** require a prior `group_by()`. On a factor, `.drop = TRUE` (the default) leaves out levels with no rows; `.drop = FALSE` keeps them as `n = 0`. **`count()` has no `filter` argument.** `count(TRT01A, filter = SEX == "F")` does NOT filter rows — it silently creates a new grouping column named `filter` holding `TRUE`/`FALSE`, so you get counts for both the matching AND non-matching rows. To count one category, filter first: `dplyr::filter(.data, SEX == "F") |> dplyr::count(TRT01A)`. To count all categories of a variable at once (preferred), count both columns together: `dplyr::count(.data, TRT01A, SEX_DISP)`. |
| `dplyr::group_by(.data, ...) \|> dplyr::summarise(..., .groups = "drop")` | named summary expressions | Always pass `.groups = "drop"` — otherwise the result stays grouped and later joins/pivots behave unexpectedly. |
| `dplyr::arrange(.data, ...)` | columns to sort by, `dplyr::desc(col)` for descending | Sorting is stable; ties keep original relative order. |
| `dplyr::inner_join(x, y, by = ...)` | `by` = character vector of join keys | Rows in `x` or `y` with no match are dropped — use `dplyr::left_join()` if unmatched rows must be kept. |
| `dplyr::bind_rows(...)` | data frames or a list of data frames; `NULL` arguments are skipped | Column sets need not match; missing columns are filled with `NA`. The skipped `NULL` is what makes `dplyr::bind_rows(data, if (total_required) total_copy)` add the Total copy only when the spec asks for it. |
| `dplyr::recode_values(x, old ~ new, ..., default = NULL, unmatched = "default")` | value on the left of `~`, replacement on the right, one pair per case; or `from =`/`to =` vectors instead of formulas | Unmatched values become `NA` unless `default =` is supplied; `unmatched = "error"` errors on any unmatched value instead, which is the safer choice for a fixed set of cases. Requires dplyr >= 1.2.0 (confirmed with `args()` on dplyr 1.2.1). Replaces `dplyr::case_match()`, deprecated in dplyr 1.2.0. Every right-hand side is evaluated over the whole vector, as in `dplyr::case_when()`. |
| `dplyr::if_else(condition, true, false, missing = NA)` | all three of `condition`/`true`/`false` must be the same type | **Not** `stats::if_else` — that function does not exist. Stricter than base `ifelse()`: mismatched types error instead of silently coercing. |
| `dplyr::coalesce(...)` | vectors of the same type, first non-`NA` wins | Useful for filling a default only where a value is missing. |
| `dplyr::n()` | no arguments, valid only inside `mutate()`/`summarise()`/`filter()` | Returns the number of rows in the current group, missing values included; `n(x)` is an error. For a summary statistic's `n`, count non-missing values with `sum(!is.na(x))` inside the same `summarise()`. |
| `dplyr::across(.cols, .fns)` | `.cols` = `dplyr::all_of()`/`tidyselect` helper; `.fns` = function or list of functions | Only valid inside `mutate()`/`summarise()`. |

#### 3. Reshaping (tidyr)

| Function | Signature | Notes |
|---|---|---|
| `tidyr::pivot_wider(data, id_cols, names_from, values_from, values_fill)` | `id_cols` = columns to keep as row keys; `names_from`/`values_from` = a column name (bare or `dplyr::all_of("col")`); `values_fill` = a scalar, or a named list for per-column fills (a scalar is accepted since tidyr 1.1.0; earlier versions required the named list) | Table programs do not use `values_fill`: zero-count cells come from `tidyr::complete()` before pivoting, and a fill string would also land in continuous statistics cells. An empty cell after pivoting means the block was built wrong upstream. When `names_from` is a factor, the new columns follow its level order. |
| `tidyr::pivot_longer(data, cols, names_to, values_to)` | `cols` = columns to stack (bare names or `dplyr::all_of(character_vector)`); `names_to`/`values_to` = new column names as strings | Turns one `summarise()` row holding several statistic columns (`n_val`, `mean_val`, `sd_val`, ...) into one row per statistic before formatting, so each statistic the spec lists becomes its own ARD row. If `cols` mixes an integer column (e.g. `n_val` from `sum(!is.na(x))`) with double columns, the stacked `values_to` column is coerced to double — cast back with `as.integer()` when formatting that statistic. |
| `tidyr::complete(data, ..., fill = list(...))` | columns to cross-expand as `...`; `fill` = named list of default values | Use before pivoting to materialize zero-count combinations; without it, missing categories silently vanish instead of showing `"0 (0.0%)"`. On factor columns it expands to every level, used or not. |
| `tidyr::replace_na(data, replace)` | `data` = a data frame or a vector; `replace` = for a data frame, a named list with one fill value per column; for a vector, a single value | Inside `dplyr::mutate()`/`dplyr::across()` it is applied to a vector, so pass a single value, e.g. `tidyr::replace_na(., "")`. The fill value is cast to the type of the column it replaces in. |

#### 4. Iteration (purrr)

| Function | Signature | Notes |
|---|---|---|
| `purrr::pmap(.l, .f)` | `.l` = a data frame or list of vectors; `.f` = a function whose parameter names match `.l`'s column names (or catch the rest with `...`) | When `.l` is a data frame, `.f`'s arguments are matched **by column name**, not position. Returns a list. Never use it to build the JSON `rows`: `rows` takes the final wide-format dataframe directly (`clindroid-ard-json`). |
| `purrr::map(.x, .f)` / `map_chr()` / `map_dbl()` | `.x` = vector/list; `.f` = function or formula (`~ .x + 1`) | The `_chr`/`_dbl`/`_int` variants enforce and simplify to that return type; plain `map()` always returns a list. |
| `purrr::pluck(.x, ...)` | `...` = a flat sequence of indices/names to walk down nested lists | Equivalent to chained `[[...]][[...]]` but without nested brackets. Returns `NULL` (not an error) if a path segment doesn't exist, unless `.default` is set. |

#### 5. Statistics

| Function | Signature | Notes |
|---|---|---|
| `stats::sd(x, na.rm = TRUE)` | `x` = numeric vector | Always set `na.rm = TRUE` for clinical data unless the spec says otherwise. Returns `NA` for fewer than two values. |
| `stats::median(x, na.rm = TRUE)` / `base::mean(x, na.rm = TRUE)` | same as above | Same `na.rm` caution applies. `mean()` of no values returns `NaN`, which `is.na()` also catches. |
| `base::min(x, na.rm = TRUE)` / `base::max(x, na.rm = TRUE)` | same as above | **If `x` is all `NA`, returns `Inf`/`-Inf` with a warning, not `NA`, and `is.na(Inf)` is `FALSE`** — so a treatment group whose values are all missing prints `"Inf"` unless guarded. Inside `summarise()` write `if (all(is.na(x))) NA_real_ else base::min(x, na.rm = TRUE)`. |
| `stats::aov(formula, data)` / `stats::t.test()` / `stats::wilcox.test()` / `stats::kruskal.test()` | formula `response ~ group` | Do not call these directly in table code: `continuous_p_value()` (the Shared Helpers block) runs the one the spec's Statistical Method names and checks the number of groups. It computes the Two-sample t-test with `var.equal = TRUE` and Welch's t-test with R's default; `wilcox.test()` gives an exact p-value for fewer than 50 values without ties and the normal approximation with continuity correction otherwise (its help page). An `aov` p-value is read with `summary(fit)[[1]][["Pr(>F)"]][1]` — there is no `fit$p.value`. |
| `stats::chisq.test(x, correct = TRUE)` | `x` = a 2-D contingency `table()`, not raw data | Do not call it directly in table code: `categorical_p_value()` does, with `correct = FALSE`, because the spec's "Pearson's chi-square test" is the uncorrected statistic. R's default `correct = TRUE` applies Yates' continuity correction to every 2 x 2 table (its help page), which gives a different p-value. An all-zero row or column (an unused factor level such as `"Total"`) makes `$p.value` `NaN` without an error; `categorical_p_value()` drops such rows and columns first. |
| `stats::fisher.test(x)` | `x` = a 2-D contingency `table()` | Computes Fisher's exact test for a 2 x 2 table and the Fisher-Freeman-Halton test for a larger one, although its help page does not use the Freeman-Halton name. Called through `categorical_p_value()`. For a large table the exact algorithm can fail with an `FEXACT error`; per its help page the remedies are a different `workspace` (possibly very slow) or `simulate.p.value = TRUE` (random, so it needs `set.seed()`). Do not choose one yourself: `categorical_p_value()` stops and asks the user. |

#### 6. Formatting & Output

| Function | Signature | Notes |
|---|---|---|
| `sprintf(fmt, ...)` | `%d` integer, `%.1f`/`%.2f` fixed decimals, `%.*f` with the decimal count as an argument, `%s` string | The number and order of arguments must exactly match the `%` placeholders in `fmt`, or R throws `too few arguments`. `sprintf("%.3f", 0.00002)` is `"0.000"`; format p-values with `format_p_value()` instead. |
| `formatC(x, digits, format, flag)` | `format = "f"` for fixed decimals, `flag = "0"` to zero-pad | Alternative to `sprintf()` when the decimal count is a variable, not a literal. |
| `setNames(object, nm)` | `object` first, names vector second | A common mistake is swapping this argument order. |
| `jsonlite::write_json(x, path, auto_unbox = TRUE, pretty = TRUE)` | `auto_unbox = TRUE` prevents wrapping every scalar in a length-1 array | Omitting `auto_unbox = TRUE` emits numbers/strings as `[1]`-style JSON arrays, which breaks the ARD JSON schema. **A named atomic vector (e.g. `big_n_list` built via `tibble::deframe()`/`setNames()`) is serialized as a plain JSON array — `[86, 84, 84, 254]` — with the names silently dropped, even though `names()` is set correctly in R and even with `auto_unbox = TRUE`.** Always wrap a named vector in `as.list()` immediately before placing it into the payload passed to `write_json()` (e.g. `big_n = as.list(big_n_list)`). |
| `tibble::deframe(x)` | `x` = a two-column data frame (name, value) | Converts to a named vector — turns a `count()` result into a lookup like `big_n_list["Placebo"]`. A factor first column becomes character names. |

#### 7. RTF Rendering (r2rtf)

Table programs never call these functions themselves: `render_ard_rtf()` from the Shared Helpers block makes every call below in the right order and checks the written file. This section is for reading and debugging that function.

| Function | Signature | Notes |
|---|---|---|
| `rtf_title(tbl, title, subtitle, text_convert = FALSE)` | `title`/`subtitle` = strings, each passed through `rtf_escape()` first | **Always pass `text_convert = FALSE`** — see `clindroid-rtf-rendering` §6: r2rtf's default silently turns every `_` into `\sub` (unclosed) and every `^` into `\super`. **Always escape with `rtf_escape()` first** — see §7/§8 there: r2rtf never escapes a literal `\`/`{`/`}`, and `rtf_escape()` also handles non-ASCII text (Japanese etc.). **Do not pass `use_i18n`** — this project's installed r2rtf version does not expose that argument (§8 there). |
| `rtf_colheader(tbl, colheader, col_rel_width, text_convert = FALSE)` | `colheader` = **one string**, columns split by `"|"` (r2rtf's own delimiter convention, not a vector/list); `col_rel_width` = numeric vector, one element per `"|"`-separated cell | Use `"\\line"` inside a cell (e.g. `"Placebo\\line(N=86)"`) for a within-cell line break. Escape each dynamic group name with `rtf_escape()` before inserting it into the template — never escape the literal `\\line`/`"|"` syntax itself (§7 there). **Do not pass `use_i18n`**. |
| `rtf_body(tbl, col_rel_width, text_convert = FALSE)` | `col_rel_width` = numeric vector, one element per column of `tbl` | Pass the same `col_rel_width` vector as `rtf_colheader()`: `tbl` holds exactly the rendered columns, so both have `length(ard$columns)` elements (`clindroid-rtf-rendering` §2). r2rtf does not validate agreement between the two calls; a mismatch silently misaligns columns. **Do not pass `use_i18n`**. |
| `rtf_footnote(tbl, footnote, text_convert = FALSE)` | `footnote` = one string built from `rtf_escape()`d `label`/`text` values; join multiple footnotes with the literal RTF control word `"\\line"` | With `text_convert = FALSE`, `rtf_footnote()` no longer converts a plain `"\n"` to a line break, so join with literal `"\\line"` instead. **Do not pass `use_i18n`**. |
| `rtf_source(tbl, source, text_convert = FALSE)` | `source` = one string, passed through `rtf_escape()` first | Optional traceability line (the generating program's path). **Do not pass `use_i18n`**. |
| `rtf_encode(tbl)` | no required arguments | **Must be called immediately before `write_rtf()`.** Omitting it does not raise an error (see Common Pitfalls). |
| `write_rtf(rtf, file)` | `file` = output path string | Only produces valid RTF if `rtf_encode()` was called first. |

Reference: https://merck.github.io/r2rtf/ — the verb functions above each attach one component's attributes to the table object; `rtf_encode()` converts them into RTF markup in a single pass; `write_rtf()` only writes bytes to disk. See `clindroid-rtf-rendering` §2/§3 for the full call.

#### Common Pitfalls

- `%||%` only substitutes when the left side is `NULL`. `sprintf()` never returns `NULL` (it returns `"NA"` for `NA` input), so `sprintf(...) %||% fallback` never triggers the fallback. To branch on `NA`, use `dplyr::if_else(is.na(x), "NA", sprintf(...))`.
- `if_else` is a `dplyr` function, not a `stats` function. There is no `stats::if_else`.
- `ifelse()` (base) silently coerces types; `dplyr::if_else()` errors on a type mismatch instead — prefer `dplyr::if_else()` for clinical data so type bugs surface immediately.
- `group_by() |> summarise()` without `.groups = "drop"` leaves the result grouped, which can silently change the behavior of a later `pivot_wider()` or `arrange()`.
- `dplyr::count(.data, extra_col = condition)` does not filter — any named argument other than a plain grouping column becomes a new grouping variable, silently doubling row counts.
- Never overwrite the `names()` of a raw-value lookup vector (e.g. a `big_n` vector keyed by `TRT01A`'s data values) with display labels while it is still used for a lookup: every later lookup by raw value then silently returns `NA`. Category values are a different case: `bind_display_factor()` converts them to display labels once, **before** `count()`/`complete()`/`pivot_wider()`, into a separate column, and the raw column stays for anything keyed by the data's own values.
- A category value that no mapping covers turns into `NA` under `factor()`/`match()`, and a row with `label = NA` serializes as a JSON object **missing the `label` key entirely**, not `"label": null`. `bind_display_factor()` exists for this: it appends such a value as its own row, with a warning, and stops when the map's keys are misspelled. Route every categorical variable through it.
- A named vector placed directly into the `write_json()` payload (e.g. `list(big_n = big_n_list)`) serializes as a bare JSON **array**, not an object. Wrap it in `as.list()` first. The R-side object still has correct `names()`, so this is only visible in the written `.json` file.
- `write_rtf(rtf, file)` does not error if `rtf_encode()` was skipped beforehand — it silently writes a small plain-text dump of the cell values instead of a real `.rtf` file (a 59-byte file with no `{\rtf1` header in the reproduction, against ~4KB with `rtf_encode()`). `file.exists()` and the exit status look fine either way — verify by reading the file's first bytes.
<!-- r-function-reference:end -->

## 4. Core Pattern: `categorical_block()`

Every categorical item becomes one block of the ARD — a header row, an `n` row, then one row per category — built by **one call of `categorical_block()`** (Shared Helpers, §3). Never build a block by hand, in a loop or otherwise: the function is what puts the header row first, the p-value on the header row only, the Big N denominators, the zero counts and `group`/`ord_group` in place, and `render_ard_rtf()` stops on a table whose blocks lack them. The blocks are combined with `dplyr::bind_rows()` in the spec's Analysis Items order.

### 4.1 Big N Calculation (from ADSL)

```r
# Big N always comes from the population-filtered ADSL (`adsl`, §8), with TRT01A a factor
# over trt_levels — never from analysis data. count() leaves out the empty "Total" level;
# Total, when the spec requires it, is the sum of the arms.
big_n_list <- adsl |> dplyr::count(TRT01A) |> tibble::deframe()
if ("Total" %in% trt_levels) big_n_list["Total"] <- sum(big_n_list)
```

### 4.2 One Categorical Variable (Sex)

```r
# `adsl` is the population-filtered ADSL from §8, with TRT01A a factor over trt_levels;
# pass it as is — categorical_block() adds the Total copy itself. Sex is the 1st item of
# the spec's Analysis Items table, so ord_group = 1L.
ard_sex <- categorical_block(
  adsl, "SEX", "Sex", 1L,
  spec_map      = c("F" = "Female", "M" = "Male"),  # data's coded value -> spec's display label, in the spec's order (§4.3)
  trt_levels    = trt_levels,
  big_n         = big_n_list,                       # Big N from ADSL (§4.1): the denominator of every percentage
  missing_label = NULL,                             # NULL for `Missing: not shown`; "Missing" for `Missing: shown as "Missing"`
  method        = "Pearson's chi-square test"       # the item's Statistical Method; NULL when P-value Required is No
)
```

**What the call produces:** a header row (`label` = the item's name, value columns blank, the p-value in `p_value`), an `n` row (§4.3 rule 7), then one row per category as `"n (%)"` in the spec's order, every category × treatment group present and zero counts shown as `0 (0.0%)`. Percentages divide by `big_n`, never by row counts. The p-value is computed on the display categories of the real treatment groups, missing values excluded (§7 "P-value Input"). `pct_digits` (default 1) sets the percentage's decimal places when the spec states another rule; `show_n = FALSE` drops the `n` row only on the user's explicit instruction. Every row carries `group` (the item's name) and `ord_group`, and the block's columns are already the final output: `ord_group`, `group`, `label`, one column per `trt_levels` entry (matching `big_n` keys), and `p_value` when a method is given. Two variables never share an `ord_group`, even when their category labels are identical.

### 4.3 Coded Values vs. Display Labels (the one thing that must not be skipped)

The TFL Spec's Factor Levels table records **display labels** — `Female`/`Male`, `Black`/`White`, `<65 yrs`/`65-80 yrs`/`>80 yrs`. The ADaM dataset holds **coded values** — `F`/`M`, `BLACK OR AFRICAN AMERICAN`/`WHITE`, `<65`/`65-80`/`>80`. `tfl-spec-writer` deliberately never reads the dataset (its §2 Step 4), so the spec cannot state the coded values; the R program is the first and only place where both vocabularies are visible, which makes binding them **this skill's job, not the spec's**.

Get the order wrong and the failure is silent and ugly. Aggregating on the coded values while `tidyr::complete()`-ing against the spec's display labels produces *both* — a `Female` row at `0 (0.0%)` and an `F` row with the real count, for every category of every variable. Every number on the page is individually correct; only the row set is wrong, which is exactly the kind of defect that survives review.

The second way to get the same picture is a mapping whose **keys are wrong**. If the keys are written in the spec's vocabulary (`c("Black" = "Black", "White" = "White")`), or are the right words but not the exact string the data holds (`"BLACK"` for `"BLACK OR AFRICAN AMERICAN"`), no data value matches any key. Every real value then looks like a category the spec forgot, rule 2 below appends it verbatim, and the table shows `Black`/`White` at `0 (0.0%)` above `BLACK OR AFRICAN AMERICAN`/`WHITE` with the real counts. The run only emits a warning, so it looks like a successful run.

The rule, in order:

1. **Write the mapping explicitly**, coded value on the left, display label on the right, in the spec's display order: `c("F" = "Female", "M" = "Male")`. Run `dplyr::count(adsl, RACE)` (permitted here, unlike in `tfl-spec-writer`) and copy each key **character for character** from that output, then pair it with the spec's corresponding label. A key that is identical to its label is a red flag unless the data really holds that exact string.
2. **Extend the mapping with anything the spec does not cover**, before aggregating: append each such observed value to the mapping as its own label, sorted, after the spec's levels, and `warning()` that you did. The table follows the data, so a category present in the dataset is never dropped and never halts the run just because the SAP/Shell did not enumerate it. What must not happen is the value falling through to `NA`, which produces a row with no label at all. Sort rather than using appearance order so the row order is reproducible across data cuts.
3. **Stop on the wrong-key signature**: if a spec key matches no data value *and* a data value matches no spec key in the same variable, the mapping is almost certainly mis-keyed, so `stop()` naming both sides instead of letting rule 2 render the duplicate. The fix is to re-pair the keys from the `count()` output. The only legitimate way past it is a spec level that genuinely has no subjects in this data cut while another, unlisted value is present. Confirm that against the `count()` output, then pass that level's coded key in `confirmed_absent`. Never pass a key there to silence the error when its category *is* in the data under a different spelling.
4. **Treat missing values the way the spec's Note for this item says.** NA and blank (`""`) are both missing; `haven::read_xpt()` usually returns a missing character value as `""`, not `NA`. `tfl-spec-writer` records the decision in the Analysis Items Note column as either `Missing: shown as "<label>"` or `Missing: not shown`. For the first, pass that label as `missing_label`, and it becomes the last level, rendered even at `0 (0.0%)` like any other spec level. For the second, or when the Note says nothing about missing values, pass `NULL`: missing values come out as `NA`, are removed by `dplyr::filter(!is.na(...))` before `count()`, and a `warning()` records the exclusion. Percentages keep Big N as the denominator, so they may then sum to less than 100%. Never let a missing value reach `count()` as `NA` or `""`, because it becomes a row with no label. The Missing label is never a key or label of the map, and `tfl-spec-writer` never lists it in Factor Levels; `bind_display_factor()` stops if it finds it there.
5. **Convert once, to a factor over the display labels**, with `levels =` in the spec's display order.
6. **Aggregate, `complete()`, and pivot in that single vocabulary.** `ord_row` then comes from `as.integer()` of that factor and `label` from `as.character()`, so there is no second lookup to keep in sync.
7. **Output an `n` row by default**, between the header row and the category rows: the number of subjects with a non-missing value of the variable, per arm and Total, as a plain count without a percentage. A Missing row the spec shows is not part of it, so `n` plus Missing equals Big N. Whether to show it is a per-study display choice, so pass `show_n = FALSE` only when the user explicitly instructs it; do not drop or add it on your own reading of the Shell or the spec's Statistics column.

Rules 2 to 5 live in `bind_display_factor()`, and rules 6 and 7 in `categorical_block()`, which calls it (both in the Shared Helpers block, §3). Your part is rule 1, the map, and the `missing_label` from rule 4; do not reimplement any of the rest inline.

## 5. Handling Multiple Categorical Variables

One `categorical_block()` call per variable, in the spec's Analysis Items order, `ord_group` counting from 1. Write the calls out one by one rather than looping over a list of variables: each call carries that item's own map, Missing label and method, and is checked against the spec line by line.

```r
ard_blocks <- list(
  categorical_block(adsl, "SEX", "Sex", 1L, c("F" = "Female", "M" = "Male"),
                    trt_levels, big_n_list, method = "Pearson's chi-square test"),
  # Race's Note reads `Missing: shown as "Missing"`; its keys are copied from dplyr::count(adsl, RACE)
  categorical_block(adsl, "RACE", "Race", 2L,
                    c("BLACK OR AFRICAN AMERICAN" = "Black", "WHITE" = "White"),
                    trt_levels, big_n_list, missing_label = "Missing",
                    method = "Fisher-Freeman-Halton test")
)

# Combine the blocks into the final rows dataframe. arrange(ord_group) states the spec's
# order in the data instead of relying on ard_blocks list order; ord_group is KEPT.
ard_rows <- dplyr::bind_rows(ard_blocks) |>
  dplyr::arrange(ord_group)
```

## 6. Big N & Denominator Logic (Categorical Context)

- **Big N Calculation**: Always derive the total number of subjects ($N$) per treatment group from the **ADSL** dataset using the appropriate population flag (e.g., `SAFFL == "Y"`). This is independent of which categorical variable is being analyzed — Big N does not change across variables within a single table.
- **Denominator for Percentages**: Use these Big N values as fixed denominators for all percentage calculations: `n / big_n_list[as.character(TRT01A)]`. Do NOT use row-level counts or the total number of observations in the dataset as denominators.

### Treatment Group Levels

The TFL Spec's Factor Levels table gives the **order** of the treatment groups. The **names** come from the data, because a Shell often shortens them and the spec is meant to carry the data's values. `tfl-spec-writer` writes the data's names into the spec, so the two normally agree. When they do not (for example, the data was replaced after the spec was written), the program follows the data. `trt_levels` is built with `reconcile_trt_levels()` on the **population-filtered ADSL**, the source of `big_n`, and it does four things:

- It keeps the spec's order for every name the data holds.
- It drops a spec name the data does not hold.
- It adds a data value the spec does not list, after the spec's names, ordered by the numeric sort variable (`TRT01AN` for ADSL; alphabetical when there is none).
- It warns about both, so the spec can be updated to the data's values.

Filtering first matters: an arm outside the analysis population, such as a screen-failure arm, must not become a column. The treatment columns, the `big_n` keys and the Column Layout's Arm/Total positions all take their names from the resulting `trt_levels` (`r-coder-complex-table` §10.2). `reconcile_trt_levels()` comes from the Shared Helpers block (§3). Its `total` argument has no default: pass `TRUE` when the spec's `Total Required` is `Yes`, which appends `"Total"` as the last level, and `FALSE` otherwise.

## 7. ARD Construction Rules (Categorical)

**CRITICAL:** The "ARD" in this context is **NOT** the complex CDISC ARD standard. It is a flat, character-based dataframe for table output.

### Structure
The final ARD dataframe **is** the JSON output — per the `clindroid-ard-json` skill, `rows` is the direct JSON conversion of this dataframe's rows, with no nested `values` object and no dedicated `p_value` field. Build each categorical variable's block with `categorical_block()` (§4.2/§5), each carrying `ord_group` and `group`, then combine all blocks with `dplyr::bind_rows()` and `dplyr::arrange(ord_group)`. `ord_group` is **not** dropped: it and `group` are written into the JSON `rows` objects, because once the blocks are bound together nothing else marks where one variable's section begins; the renderer rules each section from `group` (`clindroid-ard-json` §3, `clindroid-rtf-rendering` §9).

**Split unit:** one block per categorical item of the spec's Analysis Items table — this is the specialization of `r-coder-complex-table`'s canonical "Sub-table Splitting Policy" (§7 of that skill) for the single-factor categorical case. One `categorical_block()` call builds all of a variable's rows; never split one variable across calls or merge two variables into one, even when their category labels are identical.

### Required Columns
1. **Grouping Columns (kept in the output):** `group` (Character) is the item's name as the spec's Analysis Items table writes it, repeated identically on every row of that variable's block, including its header row; `ord_group` (Integer) is that item's 1-based position in the table. `categorical_block()` sets both from its `item_name` and `ord_group` arguments. They are the specialization of `r-coder-complex-table` §7's "Grouping Column" for the single-factor categorical case: `group` is what the renderer rules each section from, and `ord_group` fixes the order that a character `group` cannot fix itself. Both go into the JSON `rows` objects but neither gets an element in `columns` — so a row object holds two more keys than `columns` has elements, and the renderer drops both before sizing `col_rel_width` (`clindroid-rtf-rendering` §2/§3).
2. **Label Column (Character):** Category name displayed in the first column (e.g., "Female", "Male" for Sex; "<65 yrs", "65-80 yrs" for Age Group). **Row-label layout:** by default the row labels are one `label` column, with the analysis item's name on a header row of its own (§4.2/§5). How row labels are laid out is a per-study display choice, so an explicit user instruction for a different layout (e.g. a separate item-name column), or a spec Column Layout that records one, takes precedence over this default. A displayed item-name column then gets its own name from the Column Layout and its own entry in `columns`; it is never `group` or `ord_group`, which stay the structural keys described below.
3. **Value Columns (Character):** Formatted statistical strings `"n (%)"`, one column per treatment group plus `Total` if applicable — column names MUST exactly match the corresponding keys in `big_n`.
4. **P-value Column (Character, optional):** If required, a plain column named `p_value` holding the string from `format_p_value()` on each variable's header row and `""` elsewhere — not a dedicated schema field.

### Precision & Formatting

Apply decimal precision rules from the TFL Spec's `Number of decimal places` column verbatim: the percentage's decimal places go to `categorical_block()` as `pct_digits` (1 when the spec says `None`), and the p-value's to its `p_digits` from the Programming Notes' `P-value display` bullet (3 by default, which prints `<0.001` below 0.001, never `0.000`).

### Zero & NA Handling

Never omit rows or columns due to zero counts: `categorical_block()` counts on the display factor with every category × treatment-group combination kept, so a zero shows as `0 (0.0%)`. Missing values (`NA` or `""`) are not a category of their own: they get a row only when the item's Note reads `Missing: shown as "<label>"`, and are otherwise excluded from the counts (§4.3 rule 4).

### P-value Input

`categorical_block()` builds the contingency table for the test from the display factor that `bind_display_factor()` returned, not from the raw variable. On the raw variable, a blank missing value (`""`) would enter the test as a category of its own, and coded values the table rendered under one label would be tested under another. Three exclusions apply:

1. Drop the Total copy (`TRT01A != "Total"`): the test compares the real treatment groups only.
2. Leave missing values out of the test, even when the spec shows a Missing row: both the `NA` of a not-shown missing value and the Missing level of a shown one are removed.
3. Leave empty levels to the helper. `TRT01A` still carries the empty `"Total"` level, and a spec level with no subjects is an all-zero category. Either one gives the table an all-zero row or column, on which `chisq.test()` returns `NaN` silently; `categorical_p_value()` drops such rows and columns before testing.

The test itself is the one the item's `Statistical Method` names, and only for an item whose `P-value Required` is `Yes`. `tfl-spec-writer` writes it as one of these names, exactly (its §3 column 5): `Pearson's chi-square test` (no continuity correction), `Fisher's exact test` (a 2 x 2 table), `Fisher-Freeman-Halton test` (a larger table), or `Pearson's chi-square test; exact test if any expected count < 5`; it writes the exact test, with a warning, when neither the SAP nor the Shell names a test, and `Other: ...` for a test outside this set. Never pick, paraphrase or "correct" the test yourself: copy the string character for character into `categorical_p_value()` (from the Shared Helpers block, §3), which runs exactly these names and stops on anything else. Format its result with `format_p_value()`, with `digits` from the Programming Notes' `P-value display` bullet (3 when it states the default); it prints `<0.001` below the smallest displayable value instead of `0.000`. A helper that stops — an unimplemented test, an exact test that fails, a table with a single category, an `NA` p-value — needs the user's decision, not a workaround.

### Column Validation Before `bind_rows()`

`dplyr::bind_rows()` never errors on a mismatched column set — a block missing a treatment-group column (e.g., from a forgotten `tidyr::complete()` call for one variable) is silently filled with `NA` instead of failing loudly. Before combining `ard_blocks` into the final `ard_rows` (§8 step 4), check every block's column names against `ord_group` + `group` + `label` + every `big_n` key and `stop()` with the offending block's index if any are missing. Include the two grouping columns in that check: a block that forgot `group` binds in with `NA` and loses its section rule, and one that forgot `ord_group` sorts to the front on `NA` — neither is detected anywhere downstream.

## 8. R Program Structure Template

Every generated program follows this pipeline order:

```r
# ==============================================================================
# Table: {{TFL_TITLE}}
# TFL No.: {{TFL_NUMBER}}
# Rev: {{DATE}}, Clindroid Buddy, Initial generation
# NOTE: All metadata (title, TFL number, program_path) must come from the TFL spec
#       in docs/specs/tfls/ — never derive from dataset content alone.
# ==============================================================================

library(tidyverse)
library(haven)
library(jsonlite)

# --- 0. Shared helpers ----------------------------------------------------------
# The whole Shared Helpers block (§3), copied verbatim.

# --- 1. Data Loading & Population Filtering -----------------------------------
# The population-filtered ADSL; every later step uses it — never re-read or re-filter.
adsl <- haven::read_xpt("data/adam/adsl.xpt") |> dplyr::filter({{POP_FILTER}})

# Spec order, data names (§6 "Treatment Group Levels"); total = the spec's Total Required.
trt_levels <- reconcile_trt_levels(adsl$TRT01A, {{TRT_LEVELS}}, "TRT01A",
                                   sort_values = adsl$TRT01AN, total = {{TOTAL_REQUIRED}})
adsl <- adsl |>
  dplyr::mutate(TRT01A = factor(TRT01A, levels = trt_levels))

# --- 2. Big N Calculation (per-arm + pooled Total) ----------------------------
big_n_list <- adsl |> dplyr::count(TRT01A) |> tibble::deframe()
if ("Total" %in% trt_levels) big_n_list["Total"] <- sum(big_n_list)

# --- 3. One block per categorical item --------------------------------------------
# One categorical_block() call per item of the spec's Analysis Items table, in its order,
# ord_group counting from 1 (§4.2/§5). Never build a block by hand.
ard_blocks <- list(
  categorical_block(adsl, "SEX", "Sex", 1L, c("F" = "Female", "M" = "Male"),
                    trt_levels, big_n_list, method = "Pearson's chi-square test")
  # ... one call per remaining spec item
)

# --- 4. Assemble ARD Rows & JSON Output --------------------------------------
# Fail fast if any block is missing an expected column — bind_rows() would
# otherwise silently fill it with NA instead of erroring, hiding a block built
# by hand or a missing grouping column.
expected_cols <- c("ord_group", "group", "label", names(big_n_list))
for (i in seq_along(ard_blocks)) {
  missing_cols <- setdiff(expected_cols, names(ard_blocks[[i]]))
  if (length(missing_cols) > 0) {
    stop(sprintf("ard_blocks[[%d]] is missing column(s): %s", i, paste(missing_cols, collapse = ", ")))
  }
}

ard_rows <- dplyr::bind_rows(ard_blocks) |>  # final dataframe, in the spec's item order
  dplyr::arrange(ord_group)                  # ord_group is KEPT — it goes into the JSON rows

# --- Body columns from the spec's Column Layout (`r-coder-complex-table` §10.2) -----------------
# Transcribed from the TFL Spec's Column Layout table, in Position order. layout_cols is
# each position's R Dataframe Column. layout_headers is what goes into the JSON `columns`
# array: the big_n key for an Arm/Total position (the renderer appends the runtime
# "(N=xx)", so the Shell's illustrative N is never copied), the Header Text verbatim for
# every other position (footnote markers already in the spec's "(a)" form), and "" for a
# row-label column whose Header Text is `(row label)`. The Arm/Total positions are filled
# from trt_levels, not copied from the spec, so a group name reconciled with the data
# flows through. Drop "p_value" from both vectors when no item requires a p-value.
layout_cols    <- c("label", trt_levels, "p_value")
layout_headers <- c("", trt_levels, "p-value (a)")

# all_of() errors if a Column Layout column is missing from the data, and select() puts
# the body columns in Column Layout order; the structural keys stay in front.
ard_rows <- ard_rows |> dplyr::select(ord_group, group, dplyr::all_of(layout_cols))

json_payload <- list(
  protocol_number     = "{{PROTOCOL_NUMBER}}",
  tfl_id              = "{{tfl_id}}",
  tfl_number          = "{{TFL_NUMBER}}",
  tfl_title           = "{{TFL_TITLE}}",
  analysis_population = "{{ANALYSIS_POPULATION}}",
  execution_datetime  = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  program_path        = "programs/tfls/{{tfl_id}}.r",
  big_n               = as.list(big_n_list),   # as.list() is required: a bare named vector serializes as a JSON array, dropping every group name
  columns             = layout_headers,    # one header per RENDERED column, from the spec's Column Layout (see above). `group`/`ord_group` are structural and get NO header here (`clindroid-ard-json` §3), so rows carry two more keys than columns has elements.
  footnotes           = data.frame(ord = 1L, label = "a", text = "..."),   # the spec's Footnotes table, row for row; zero rows when it is empty
  rows                = ard_rows           # the dataframe itself — jsonlite converts it to an array of row-objects
)

jsonlite::write_json(
  json_payload, "tfls/{{tfl_id}}.json",
  auto_unbox    = TRUE, pretty        = TRUE, digits        = NA
)

# RTF: always with the shared helper, always last (Step 8) — never write_rtf() directly.
render_ard_rtf(json_payload, "tfls/{{tfl_id}}.rtf")

# --- 5. Verification ----------------------------------------------------------
# Cross-check: every categorical item of the spec must appear as a group of rows in output
```

**Placeholders:**

| Placeholder | Source |
|-------------|--------|
| `{{TFL_TITLE}}`, `{{TFL_NUMBER}}`, `{{DATE}}` | TFL Spec Target Table's `Title` and `TFL Number` fields (`docs/specs/tfls/{tfl_id}.md`) — `{{TFL_NUMBER}}` is the human-readable number (e.g., `Table 14-2.01`), never the `{{TFL_ID}}` file-naming slug below |
| `{{PROTOCOL_NUMBER}}`, `{{ANALYSIS_POPULATION}}` | TFL Spec Target Table's `Protocol Number` and `Analysis Population` fields, verbatim — never an example value such as `XYZ-123` or `Full Analysis Set (FAS)` |
| `{{TFL_ID}}` (lowercase `{{tfl_id}}` in file paths/JSON) | The file-naming slug this task was invoked with (e.g., `table_14_2_01`) — same value used to locate `docs/specs/tfls/{tfl_id}.md`, never read back out of the spec's content |
| `{{POP_FILTER}}` | The TFL Spec Target Table's `Population Filter Criteria`, verbatim (e.g., `ITTFL == "Y"`) |
| `{{TRT_LEVELS}}` | The treatment variable's levels from the TFL Spec's Factor Levels table, in its order, as a `c(...)` vector without `"Total"` |
| `{{TOTAL_REQUIRED}}` | `TRUE` when the spec's `Total Required` is `Yes`, otherwise `FALSE` |

A Target Table field the program needs that is missing from the spec, or reads `Not stated in source documents`, is never written into the program: stop and ask the user for the value.

## 9. Constraints & Forbidden Actions (CRITICAL)

1. **Always use Big N from ADSL** — never compute denominators from the analysis dataset row counts.
2. **Build every variable's block with one `categorical_block()` call** (§4.2/§5), never by hand. **Never drop `ord_group` or `group`** — they are part of the output (§7), and without them `clindroid-rtf-rendering` cannot tell where one variable's section ends. Equally, never give either an element in `columns`: they are structural, not rendered columns.
3. **Never count, `complete()` or pivot a categorical variable yourself**: `categorical_block()` converts it with `bind_display_factor()` first (§4.3). Aggregating on coded values renders every category twice, and no downstream check catches it.
4. **Key the map with the data's coded values, never the spec's labels** (§4.3 rule 1). When the helper stops on the wrong-key signature, re-pair the keys from `dplyr::count()` output. Do not delete the spec level, do not move the coded value to the label side, and do not use `confirmed_absent` unless `count()` shows that category truly has no subjects (§4.3 rule 3).
5. **Never drop a category value the spec omits, and never `stop()` on one**: the helper renders it from the data with a `warning()` (§4.3 rule 2). Missing values are not category values and follow the item's Note (§4.3 rule 4).
6. **Do NOT skip zero-count categories** (§7 "Zero & NA Handling").
7. **Follow decimal precision rules from TFL Spec verbatim** — do not apply default rounding when a specific rule is stated in the spec's `Number of decimal places` column.
8. **Never skip the column-validation loop before `bind_rows(ard_blocks)`** (§7/§8 step 4) — it is the only guard against a block silently missing a treatment-group or grouping column.
9. **Compute p-values only for items whose `P-value Required` is `Yes`** — with the test the item's `Statistical Method` names, copied character for character into `categorical_block()`'s `method`, which runs `categorical_p_value()` and `format_p_value()` (§7 "P-value Input"); omit the calculation and the `p_value` column entirely if no item requires it.
10. **Never assign a row-list by hand or convert the final dataframe via `purrr::pmap()`** — `rows` takes the wide-format dataframe directly (see `clindroid-ard-json`).
