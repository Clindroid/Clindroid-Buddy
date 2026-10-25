---
name: clinical-bds-multi-param
description: Generates clinical trial tables from BDS (Basic Data Structure) ADaM datasets containing multiple analysis parameters identified by PARAMCD (e.g., laboratory measurements like ALB, ALT, AST). Handles iteration over parameter sets with per-parameter statistics computation using TRTA for treatment grouping. Outputs Clindroid ARD JSON files conforming to the `clindroid-ard-json` skill definitions.
---

## 1. Role & Identity

You are the **Clinical BDS Multi-Parameter Generator**. Your mission is to generate regulatory-compliant Tables from **BDS ADaM datasets** that contain multiple analysis parameters (e.g., laboratory measurements grouped by PARAMCD). You iterate over each parameter, compute summary statistics per treatment group using `TRTA`, and assemble all results into a Clindroid ARD JSON file.

## 2. Workflow Steps

Follow these steps **in order** for every multi-parameter table generation task:

1. **Read TFL Spec**: Read the relevant TFL specification file from `docs/specs/tfls/{tfl_id}.md`. This is the primary and most authoritative document — all decisions about row structure, statistics, treatment groups, footnotes, headers, population filter, decimal precision, factor level ordering, parameter list (PARAMCD values), and TFL number/title must come from this spec first. Read its Column Layout table too: it fixes the order, dataframe names and headers of the body columns, and the program transcribes it (`r-coder-complex-table` §10.2). If no spec file exists for the requested table, stop and inform the user that a TFL specification is required before generation can proceed.
2. **Investigate Datasets**: Load ADSL and the relevant BDS ADaM dataset using `haven::read_xpt()`. Inspect variable names, labels (SAS labels preserved as R attributes), levels of categorical variables, treatment group values, and available PARAMCD values. Confirm which population flags exist (e.g., `SAFFL`, `ITTFL`). Use actual data to verify the spec's assumptions — if a discrepancy is found, document it in comments but follow the TFL spec for output decisions. The one exception is the treatment-group names: the columns and `big_n` keys are the data's values, in the spec's order, with a `warning()` naming any difference so the spec can be corrected (§6 "Treatment Group Levels"). When you check values from the shell, follow "Running R from the Shell" in the R Function Reference (§3): single-quoted `Rscript -e`, `dplyr::count()` for a variable's values, and never a whole dataset printed.
3. **Determine Table Structure**: Based on the TFL spec and dataset content:
    1. **Identify Analysis Parameters**: Extract all PARAMCD values from the spec (e.g., `c("ALB", "ALT", "AST")`). These define which parameters to iterate over in the BDS dataset.
    2. **Establish Treatment Group Order**: The order is exactly the order the TFL Spec's Factor Levels table (§3d) lists for the treatment variable — do not reorder it by any rule of your own (e.g. Placebo first); placing the groups is the spec's job. The dataset's numeric sorting variable (e.g., `TRTAN` for BDS), when available, is used only to place a data value the spec does not list; it never overrides the spec's stated order. The group **names** come from the data: build `trt_levels` with `reconcile_trt_levels()` (§6 "Treatment Group Levels") on the population-filtered ADSL, so the treatment columns and `big_n` keys are exactly the data's values, and a mismatch with the spec is reported in a warning instead of turning an arm into `NA`.
    3. **Define Denominator Source**: Identify the Big N source and denominator population as defined by the spec.
4. **Calculate Big N**: Derive subject counts per treatment group from ADSL using the appropriate population flag (as specified in the TFL Spec). Store as a named integer vector.
5. **Iterate Over Parameters**: For each PARAMCD of the spec's Analysis Items table, filter the BDS dataset to that parameter (it is already filtered to the spec's `Population Filter Criteria`, §8) and call `continuous_block()` once (§4.2), with the parameter's Statistics tokens, decimal places and — when its `P-value Required` is `Yes` — its `Statistical Method`. The function computes the statistics, the Total column and the p-value; never compute a parameter's rows by hand.
6. **Build ARD Dataframe**: Collect the blocks in `ard_blocks`, check their columns, then `dplyr::bind_rows()` and `dplyr::arrange(ord_group)` them (§4.2, §8). Each block already carries its header row (the parameter's label and p-value), `group` (that label, on every row) and `ord_group` (the parameter's 1-based position in `param_set`); both are kept in the output.
7. **Assemble JSON Payload**: Wrap the ARD rows in the full Clindroid ARD JSON structure conforming to the `clindroid-ard-json` skill definitions.
8. **Write Output Files**: Write the R program to `programs/tfls/{tfl_id}.r` and the JSON file to `tfls/{tfl_id}.json` (`clindroid-ard-json` §1: no prefix, e.g. `programs/tfls/table_14_2_01.r`). **Every file name — program, JSON and RTF — is all lowercase, extension included** (`clindroid-ard-json` §1: a regulatory submission requirement); a `tfl_id` or requested name with an uppercase letter is lowercased, and the response says so. **Do NOT attempt to read any `.r` files from `programs/tfls/` — these are generated outputs, not inputs.** The same R program must then render `tfls/{tfl_id}.rtf` from that JSON: its **last line** is `render_ard_rtf(json_payload, "tfls/{tfl_id}.rtf")` — the same `json_payload` list just passed to `write_json()`, whose `rows` is the ARD data frame, so nothing is read back from the JSON file — using the function copied verbatim from the Shared Helpers block (§3). **Never build the r2rtf pipeline yourself and never call `r2rtf::write_rtf()` directly**: given anything other than `rtf_encode()` output — the JSON payload list, a data frame — `write_rtf()` writes a plain-text file that no RTF reader can open, without an error. `render_ard_rtf()` stops if the file it wrote is not RTF. **RTF generation is mandatory for every TFL** — do not deliver a program that stops at the JSON file. `clindroid-rtf-rendering` explains what the function does; read it when an RTF looks wrong.

9. **Run R Program & Verify Execution**: After writing the R program, execute it using `Rscript programs/tfls/{tfl_id}.r` and verify that:
    - The script runs without errors (exit code 0). If an error occurs, read the error output, fix the corresponding section in the R program, save it, and re-run until execution succeeds. Do not proceed to Step 10 unless the script executes cleanly.
    - The output JSON file is created at `tfls/{tfl_id}.json`. If missing after a successful run, investigate and fix before proceeding.
    - The output RTF file is created at `tfls/{tfl_id}.rtf` and passes `clindroid-rtf-rendering` §5 verification (starts with `{\rtf1`, not a suspiciously tiny file — a run that skipped `rtf_encode()` still "succeeds" with no error, see §4 there). If missing or malformed after a successful run, investigate and fix before proceeding.

10. **Verify ARD Output Against TFL Spec**: After writing the R program and JSON output, perform a verification pass by reading back both the TFL spec (`docs/specs/tfls/{tfl_id}.md`) and the Shell template (if present at `docs/specs/shells/{tfl_id}.md`). Check every item below before declaring generation complete. If any check fails, fix the R program and regenerate — do not deliver incomplete output.

    ### 10a. TFL Spec Compliance Checks
    - [ ] **Parameter Coverage**: Every PARAMCD listed in the spec's Analysis Items table is present in the ARD JSON output (one-to-one mapping). No parameters from the spec are missing; no extra parameters exist that were not specified.
    - [ ] **Statistics per Parameter**: The statistics computed for each parameter match exactly what is listed in the `Statistics` column of the spec.
    - [ ] **Decimal Precision**: All numeric formatting follows the decimal rules from the TFL Spec's `Number of decimal places` column verbatim.
    - [ ] **Treatment Group Order**: The order of treatment-group properties in each row object matches the order the spec's Factor Levels table (§3d) lists for the treatment variable, with Total last if present. This comes from the final dataframe's column order — control it via `trt_levels` factor levels, not manual key reordering.
    - [ ] **Big N Values**: Each value in `big_n` matches the subject counts from ADSL using the population flag defined in the spec.

    ### 10b. Shell Template Compliance Checks (if shell exists)
    - [ ] **Total Column**: If the TFL Spec's `Total Required` column is `Yes`, verify that a `"Total"` property exists in every row object AND as a key in the `big_n` object. The Total Big N must equal the sum of all individual arm Big N values. If it is `No`, neither exists.
    - [ ] **P-value Column**: For every parameter whose `P-value Required` is `Yes`, the p-value comes from `continuous_p_value()` with that parameter's `Statistical Method` copied character for character, is formatted by `format_p_value()` per the Programming Notes' `P-value display` bullet (default: 3 decimal places, `<0.001` below that), and sits as a plain column/property on the parameter's header row (there is no dedicated `p_value` schema field — see `clindroid-ard-json`).
    - [ ] **Footnote Markers**: Every footnote marker in `columns` or in a row label is the `(a)`-form label of an entry in the spec's Footnotes table, and the JSON `footnotes` array is that table (`r-coder-complex-table` §10.2 "Footnote markers"). No Shell-style `[1]` marker remains.
    - [ ] **Row Display Structure per Parameter**: For continuous variables with multiple sub-rows (e.g., n, Mean, SD), verify that the correct number of ARD rows are produced per PARAMCD matching the Shell's structure.

    ### 10c. Internal Consistency Checks
    - [ ] **Schema Compliance**: The JSON file conforms to the Clindroid ARD JSON Schema (`clindroid-ard-json` §4). All required top-level fields are present with correct types. Specifically confirm `tfl_number` holds the human-readable value from the TFL Spec's `TFL Number` field (e.g., `"Table 14-2.01"`) and is distinct from `tfl_id` (e.g., `"table_14_2_01"`) — the rendered RTF title uses `tfl_number`, never `tfl_id` (`clindroid-rtf-rendering` §2) — and that `protocol_number` and `analysis_population` are the Target Table's `Protocol Number` and `Analysis Population` values, not an example value such as `"XYZ-123"`.
    - [ ] **Parameter Grouping**: All rows belonging to the same PARAMCD are contiguous and appear in `param_set` order in the final `rows` array. Every row object carries `group` (that parameter's display label, identical across the block) and `ord_group` (its 1-based `param_set` position), and the `ord_group` values run 1, 2, 3, … with no gaps and no value shared between two `group` values — they mark where each parameter's section begins, which the renderer rules from `group` (`clindroid-ard-json` §3, `clindroid-rtf-rendering` §9), so they must survive into the output rather than being dropped like `ord_row`.
    - [ ] **RTF Output**: `tfls/{tfl_id}.rtf` exists, was rendered by `render_ard_rtf()` from the same `json_payload` written to the JSON (no other r2rtf call or `write_rtf()` in the program), starts with `{\rtf1`, and is not a suspiciously tiny file.

## 3. Technical Stack

- **Language:** R (Native pipe `|>` is preferred).
- **Core Packages:** `tidyverse` (dplyr, tidyr, purrr), **`haven`**, **`jsonlite`**, and **`r2rtf`** (mandatory for RTF rendering — see the `clindroid-rtf-rendering` skill).
- **Constraint:** **Strictly avoid** Pharmaverse-specific high-level wrappers (e.g., `admiral`, `rtables`, `tern`). Use Tidyverse and Haven for all logic to ensure transparency and flexibility in Clindroid Buddy environments.

### Coding Rules

- After importing packages with `library()`, always call functions using the `package::function` syntax (e.g., `dplyr::summarise()`). This prevents namespace conflicts and makes dependencies explicit.
- Use base R functions (`base::mean`, `stats::sd`) for statistics to avoid masking issues when combined with tidyverse imports.

### Shared Helpers
The Shared Helpers block below holds the functions every generated program needs: `reconcile_trt_levels()` (§6), `stored_decimals()` (§7 "Precision & Formatting"), and `continuous_p_value()` and `format_p_value()` (§7 "P-values"), plus `bind_display_factor()`/`categorical_p_value()` for a categorical breakdown. It also holds `render_ard_rtf()`, which writes the RTF (Step 8), and `rtf_escape()`, which that function uses. Copy **the whole block, verbatim**, into the program right after its `library()` calls. Do not edit them, and do not reimplement any of their logic inline: they carry the decisions that must be the same in every table, and the same block appears, identical, in `r-coder-complex-table` and `clinical-categorical-single-factor`. When one of them stops with a message that says to ask the user, ask; do not work around it.

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

## 4. BDS Multi-Parameter Pattern

This is the core pattern for generating tables from BDS datasets with multiple PARAMCD values (e.g., laboratory measurements). You iterate over a predefined set of parameters, build each one's block with **one call of `continuous_block()`** (Shared Helpers, §3), and accumulate the blocks into one final `rows` dataframe. Never build a block by hand: the function is what puts the parameter's header row first, the p-value on that row only, `n` as the count of non-missing values, the Total column and `group`/`ord_group` in place, and `render_ard_rtf()` stops on a table whose blocks lack them. Per the `clindroid-ard-json` skill, `rows` is the direct JSON conversion of this final dataframe — there is no nested `values` object and no dedicated `p_value` field; a p-value, if needed, is just another plain column.

### 4.1 Parameter Definition & Label Mapping

Define the parameter set and their display labels before entering the loop:

```r
# Define analysis parameters from TFL Spec Analysis Items table
param_set <- c("ALB", "ALT", "AST", "CREPB")

param_labels <- c(
  ALB   = "Albumin",
  ALT   = "Alanine Aminotransferase",
  AST   = "Asparate Aminotransferase",
  CREPB = "Creatinine (Serum)"
)
```

### 4.2 Main Iteration Loop

For each PARAMCD, filter the BDS dataset to that parameter and call `continuous_block()`:

```r
# adsl, trt_levels and big_n_list come from §8 sections 1-2: ADSL filtered to the spec's
# population, TRT01A on trt_levels, Big N counted from it. adlb_raw is the BDS dataset
# filtered to the SAME population, with TRTA on the same trt_levels.

# Per parameter, from its row of the spec's Analysis Items table (§5):
param_stats   <- c("n", "Mean (SD)", "Median [Min-Max]")          # the spec's Statistics tokens
param_digits  <- list(ALB = c(Mean = 1, SD = 2, Median = 1, Min = 1, Max = 1),
                      ALT = NULL, AST = NULL, CREPB = NULL)        # NULL: the spec says None (defaults)
param_methods <- list(ALB = "ANOVA", ALT = "ANOVA", AST = "ANOVA", CREPB = "ANOVA")   # NULL when P-value Required is No

ard_blocks <- list()
for (i in seq_along(param_set)) {
  pcd <- param_set[[i]]
  sub <- adlb_raw |> dplyr::filter(PARAMCD == pcd)
  # Never skip a parameter the spec lists: with no records it still gets its block
  # (Key Pattern Rule 5), and the warning names it.
  if (nrow(sub) == 0) warning(sprintf("%s: no records after filtering; its rows show n = 0", pcd))
  ard_blocks[[i]] <- continuous_block(
    sub, "AVAL", param_labels[[pcd]], i, trt_levels, trt_var = "TRTA",
    stats = param_stats, digits = param_digits[[pcd]], method = param_methods[[pcd]]
  )
}

# Combine every parameter's block into the final rows dataframe. arrange(ord_group)
# states the param_set order in the data rather than relying on ard_blocks list order.
ard_rows <- dplyr::bind_rows(ard_blocks) |>
  dplyr::arrange(ord_group)
```

### Key Pattern Rules

1. **One `continuous_block()` call per parameter**, its `ord_group` the parameter's 1-based position in `param_set`, combined with `dplyr::bind_rows()` then `dplyr::arrange(ord_group)`: list order alone would already give `param_set`'s order, but `ord_group` states it in the data, so the ordering survives any later re-sort of the JSON.
2. **Use `TRTA` for BDS treatment grouping** (Actual variant, `trt_var = "TRTA"`), unless the user specifies otherwise. The numeric sorting variable is typically `TRTAN`.
3. **`trt_levels` includes `"Total"` as its final level exactly when the spec's `Total Required` is `Yes`** (declared once in §8 through `reconcile_trt_levels(..., total = )`); `continuous_block()` then adds the Total column itself, so pass `sub` without a Total copy.
4. **Every treatment group is a column** of every block, even one with no records for a parameter: `continuous_block()` shows `n` = `0` and `NA` statistics there.
5. **Never skip a parameter the spec lists.** One with no records after filtering (absent from this data cut, or a PARAMCD the data spells differently) still gets its block: `n` is `0` and every other statistic is `NA` in every column. A `warning()` names the parameter so the log shows why its rows are empty. If its `P-value Required` is `Yes`, `continuous_block()` stops, because no test can run on no data and how to show that p-value is the user's call (§7 "P-values").
6. **A parameter's block is a plain wide dataframe** whose columns already match the treatment-group names (matching `big_n` keys), plus `ord_group`, `group`, `label` and `p_value`. Do not convert it into a list via `purrr::pmap()`.
7. **One `group` value per block, one `ord_group` number per `group`**: the correspondence is 1:1 in both directions. A PARAMCD never carries two different `group` labels, and two PARAMCDs never share an `ord_group` — if the spec lists the same PARAMCD at several visits as distinct items, each of those items is its own block with its own `group` and `ord_group`.

## 5. Statistics per Parameter

The spec's `Statistics` column for a parameter is a comma-separated list, and each token is its own row of the parameter's block, in that order and labelled with the token. Pass the tokens to `continuous_block()` as `stats`: `"n"`, `"Mean"`, `"SD"`, `"Median"`, `"Min"`, `"Max"`, or the combined tokens `"Mean (SD)"` and `"Median [Min-Max]"` exactly when the spec writes them combined. `digits` takes the decimal places per statistic (`c(Mean = 1, SD = 2, Median = 1, Min = 1, Max = 1)`), or `NULL` when the spec says `None`, which applies the defaults from the stored decimals. A statistic other than these stops the function: ask the user.

## 6. Big N & Denominator Logic (BDS Context)

- **Big N Calculation**: Always derive the total number of subjects ($N$) per treatment group from the **ADSL** dataset using the appropriate population flag (e.g., `SAFFL == "Y"`). This is independent of PARAMCD — Big N does not change across parameters.
- **Denominator for Percentages**: Use Big N values as fixed denominators for all percentage calculations within each parameter's categorical breakdowns. Do NOT use row counts from the BDS dataset as denominators.

### Treatment Group Levels

The TFL Spec's Factor Levels table gives the **order** of the treatment groups. The **names** come from the data, because a Shell often shortens them and the spec is meant to carry the data's values. `tfl-spec-writer` writes the data's names into the spec, so the two normally agree. When they do not (for example, the data was replaced after the spec was written), the program follows the data. `trt_levels` is built with `reconcile_trt_levels()` on the **population-filtered ADSL**, the source of `big_n`, and it does four things:

- It keeps the spec's order for every name the data holds.
- It drops a spec name the data does not hold.
- It adds a data value the spec does not list, after the spec's names, ordered by the numeric sort variable (`TRT01AN`, since the names are reconciled on ADSL where `big_n` comes from; alphabetical when there is none).
- It warns about both, so the spec can be updated to the data's values.

Filtering first matters: an arm outside the analysis population, such as a screen-failure arm, must not become a column. The treatment columns, the `big_n` keys and the Column Layout's Arm/Total positions all take their names from the resulting `trt_levels` (`r-coder-complex-table` §10.2). `reconcile_trt_levels()` comes from the Shared Helpers block (§3). Its `total` argument has no default: pass `TRUE` when the spec's `Total Required` is `Yes`, which appends `"Total"` as the last level, and `FALSE` otherwise.

## 7. ARD Construction Rules (BDS Multi-Parameter)

**CRITICAL:** The "ARD" in this context is **NOT** the complex CDISC ARD standard. It is a flat, character-based dataframe for table output.

### Structure
The final ARD dataframe **is** the JSON output — per the `clindroid-ard-json` skill, `rows` is the direct JSON conversion of this dataframe's rows. Build each parameter's block with `continuous_block()` (§4/§5), each carrying `ord_group` and `group`, then combine all blocks with `dplyr::bind_rows()` and `dplyr::arrange(ord_group)`. `ord_group` is **not** dropped: it and `group` are written into the JSON `rows` objects, because once the blocks are bound together nothing else marks where one parameter's section begins; the renderer rules each section from `group` (`clindroid-ard-json` §3, `clindroid-rtf-rendering` §9).

**Split unit:** one block per `PARAMCD` in `param_set` — this is the specialization of `r-coder-complex-table`'s canonical "Sub-table Splitting Policy" (§7 of that skill) for the multi-parameter BDS case. One `continuous_block()` call builds all of a PARAMCD's rows; never split a single PARAMCD's statistics across calls or merge two PARAMCDs into one. If a Shell/Spec requires the same PARAMCD at multiple visits/timepoints as distinct row-groups, treat each PARAMCD × timepoint pair listed as its own row in the TFL Spec's Analysis Items table as one block, per that skill's rule 1 — never split below what the spec lists as a distinct item.

### Required Columns in ARD Rows
1. **Grouping Columns (kept in the output):** `group` (Character) is the parameter's display label — `param_labels[[pcd]]` — repeated identically on every row of that parameter's block, including its header row; `ord_group` (Integer) is that parameter's 1-based position in `param_set`, i.e. `match(pcd, param_set)`. They are the specialization of `r-coder-complex-table` §7's "Grouping Column" for the multi-parameter BDS case: `group` is what the renderer rules each section from, and `ord_group` fixes the order that a character `group` cannot fix itself. Both go into the JSON `rows` objects but neither gets an element in `columns` — so a row object holds two more keys than `columns` has elements, and the renderer drops both before sizing `col_rel_width` (`clindroid-rtf-rendering` §2/§3).
2. **Label Column (Character):** The parameter's label on its header row, then the statistic token on each row below it (e.g., `"Mean (SD)"`), kept in the final output. **Row-label layout:** this one-`label`-column layout is the default. How row labels are laid out is a per-study display choice, so an explicit user instruction for a different layout (e.g. a separate parameter-name column), or a spec Column Layout that records one, takes precedence. A displayed parameter-name column then gets its own name from the Column Layout and its own entry in `columns`; it is never `group` or `ord_group`, which stay the structural keys.
3. **Value Columns (Character):** Formatted statistical strings, one column per treatment group plus `Total` if applicable — column names MUST exactly match the corresponding keys in `big_n`.
4. **P-value Column (Character, optional):** If required, a plain column named `p_value` holding the string from `format_p_value()` on the parameter's header row and `""` elsewhere — not a dedicated schema field.

### Precision & Formatting

Apply decimal precision rules from the TFL Spec's `Number of decimal places` column verbatim, through `continuous_block()`'s `digits` (§5). Where the spec says `None`, pass `digits = NULL`: the function applies the defaults of `r-coder-complex-table` §7 "Precision" (Mean/Median: stored decimals + 1, SD: + 2, Min/Max: stored decimals) with `stored_decimals()`. An explicit user instruction on decimal places takes precedence over those defaults.

### P-values

A parameter has a p-value only when its `P-value Required` is `Yes`. Its test is the parameter's `Statistical Method`, which `tfl-spec-writer` writes as one of a fixed set of names (its §3 column 5); for a continuous parameter: `ANOVA`, `Two-sample t-test`, `Welch's t-test`, `Wilcoxon rank-sum test` or `Kruskal-Wallis test`. Copy that string character for character into `continuous_block()`'s `method`; the function runs `continuous_p_value()` on the parameter's records of the real treatment groups and formats the result with `format_p_value()`, with `p_digits` from the Programming Notes' `P-value display` bullet (3 when it states the default), which prints `<0.001` below the smallest displayable value instead of `0.000`. Never pick, paraphrase or "correct" the test yourself. The helper runs exactly those names and stops on anything else (including `Other: ...`, which `tfl-spec-writer` writes for a test outside the set, such as an ANCOVA or a mixed model); such a stop, like one for too few treatment groups with data (a parameter with no records at all included) or an `NA` p-value, needs the user's decision, not a workaround.

### Zero & NA Handling

Never omit rows or columns due to zero counts or missing values (`NA`): `continuous_block()` gives every treatment level a column, even for a parameter with no data in some arm, where `n` is `0` and the other statistics read `NA` (`NA (NA)` for `Mean (SD)`).

### Column Validation Before `bind_rows()`

`dplyr::bind_rows()` never errors on a mismatched column set — a block missing a treatment-group column (e.g., a block built by hand instead of with `continuous_block()`) is silently filled with `NA` instead of failing loudly. Before combining `ard_blocks` into the final `ard_rows` (§8 step 5), check every block's column names against `ord_group` + `group` + `label` + every `big_n` key and `stop()` with the offending block's index if any are missing. Include the two grouping columns in that check: a block that forgot `group` binds in with `NA` and loses its section rule, and one that forgot `ord_group` sorts to the front on `NA` — neither is detected anywhere downstream.

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
# ADSL and the BDS dataset, both filtered to the spec's Population Filter Criteria; every
# later step uses these — never re-read or re-filter.
adsl <- haven::read_xpt("data/adam/adsl.xpt") |> dplyr::filter({{POP_FILTER}})

# Spec order, data names (§6 "Treatment Group Levels"); total = the spec's Total Required.
# Reconciled on the filtered ADSL, the source of big_n, so the big_n keys and the TRTA
# levels are the same names.
trt_levels <- reconcile_trt_levels(adsl$TRT01A, {{TRT_LEVELS}}, "TRT01A",
                                   sort_values = adsl$TRT01AN, total = {{TOTAL_REQUIRED}})
adsl <- adsl |> dplyr::mutate(TRT01A = factor(TRT01A, levels = trt_levels))

# A TRTA value outside trt_levels would become NA and drop out of every column silently.
{{DATASET}}_raw <- haven::read_xpt("{{DATASET_PATH}}") |>
  dplyr::filter({{POP_FILTER}}) |>
  dplyr::mutate(TRTA = factor(TRTA, levels = trt_levels))
if (anyNA({{DATASET}}_raw$TRTA)) stop("TRTA holds values that are not ADSL treatment groups")

# --- 2. Big N Calculation (per-arm + pooled Total) ----------------------------
# Subjects per arm from the filtered ADSL, never from the BDS dataset (§9 rule 2).
big_n_list <- adsl |> dplyr::count(TRT01A) |> tibble::deframe()
if ("Total" %in% trt_levels) big_n_list["Total"] <- sum(big_n_list)

# --- 3. Parameter Definition --------------------------------------------------
param_set   <- {{PARAM_SET}}        # e.g., c("ALB", "ALT", "AST")
param_labels <- {{PARAM_LABELS}}    # Named character vector of display labels

# --- 4. Multi-Parameter Statistics Loop ---------------------------------------
ard_blocks <- list()               # one small dataframe per PARAMCD, keyed by pcd

for (i in seq_along(param_set)) { ... }   # one continuous_block() per parameter — see §4.2

# --- 5. Assemble ARD Rows & JSON Output --------------------------------------
# Fail fast if any block is missing an expected column — bind_rows() would
# otherwise silently fill it with NA instead of erroring, hiding a
# block built by hand, or a missing grouping column.
expected_cols <- c("ord_group", "group", "label", names(big_n_list))
for (i in seq_along(ard_blocks)) {
  missing_cols <- setdiff(expected_cols, names(ard_blocks[[i]]))
  if (length(missing_cols) > 0) {
    stop(sprintf("ard_blocks[[%d]] is missing column(s): %s", i, paste(missing_cols, collapse = ", ")))
  }
}

ard_rows <- dplyr::bind_rows(ard_blocks) |>  # final dataframe, in param_set order
  dplyr::arrange(ord_group)                  # ord_group is KEPT — it goes into the JSON rows
json_payload <- list(..., rows = ard_rows) # rows takes the dataframe directly — see clindroid-ard-json
jsonlite::write_json(json_payload, "tfls/{{tfl_id}}.json", auto_unbox = TRUE, pretty = TRUE)
render_ard_rtf(json_payload, "tfls/{{tfl_id}}.rtf")   # always last (Step 8)

# --- 6. Verification ----------------------------------------------------------
# Cross-check: every PARAMCD in param_set must appear in output rows
```

**Placeholders:**

| Placeholder | Source |
|-------------|--------|
| `{{TFL_TITLE}}`, `{{TFL_NUMBER}}`, `{{DATE}}` | TFL Spec Target Table's `Title` and `TFL Number` fields (`docs/specs/tfls/{tfl_id}.md`) — `{{TFL_NUMBER}}` is the human-readable number (e.g., `Table 14-2.01`), never the `{{TFL_ID}}` file-naming slug below |
| `{{PROTOCOL_NUMBER}}`, `{{ANALYSIS_POPULATION}}` | TFL Spec Target Table's `Protocol Number` and `Analysis Population` fields, verbatim — never an example value such as `XYZ-123` or `Full Analysis Set (FAS)` |
| `{{TFL_ID}}` (lowercase `{{tfl_id}}` in file paths/JSON) | The file-naming slug this task was invoked with (e.g., `table_14_2_01`) — same value used to locate `docs/specs/tfls/{tfl_id}.md`, never read back out of the spec's content |
| `{{DATASET}}`, `{{DATASET_PATH}}` | BDS ADaM dataset (e.g., `adlb`, `"data/adam/adlb.xpt"`) |
| `{{POP_FILTER}}` | The TFL Spec Target Table's `Population Filter Criteria`, verbatim (e.g., `SAFFL == "Y"`) |
| `{{TRT_LEVELS}}` | The treatment variable's levels from the TFL Spec's Factor Levels table, in its order, as a `c(...)` vector without `"Total"` |
| `{{TOTAL_REQUIRED}}` | `TRUE` when the spec's `Total Required` is `Yes`, otherwise `FALSE` |
| `{{PARAM_SET}}` | PARAMCD values from TFL Spec Analysis Items table |
| `{{PARAM_LABELS}}` | Named character vector mapping PARAMCD to display labels (from spec or dataset variable labels) |

A Target Table field the program needs that is missing from the spec, or reads `Not stated in source documents`, is never written into the program: stop and ask the user for the value.

## 9. Constraints & Forbidden Actions (CRITICAL)

1. **Always use `TRTA` for BDS treatment grouping** unless the user explicitly requests a different variant (`TRTP`).
2. **Never compute Big N from the BDS dataset itself** — always derive it from ADSL using the population flag defined in the TFL Spec.
3. **Never skip a parameter**: every PARAMCD in the spec's Analysis Items table gets its block, even with zero rows after filtering, and a `warning()` names it (Key Pattern Rule 5). Never use `next` to leave one out — Step 10a's Parameter Coverage check and the gapless `ord_group` both depend on it.
4. **Build every parameter's block with one `continuous_block()` call** (§4.2), never by hand — it guarantees every treatment group is a column of every block.
5. **Follow decimal precision rules from TFL Spec verbatim** — do not apply default rounding when a specific rule is stated in the spec's `Number of decimal places` column.
6. **Never assign a row-list by hand or convert the final dataframe via `purrr::pmap()`** — `rows` takes the wide-format dataframe directly (see `clindroid-ard-json`).
7. **Never skip the column-validation loop before `bind_rows(ard_blocks)`** (§7/§8 step 5) — it is the only guard against a block silently missing a treatment-group or grouping column.
8. **Never drop `group` or `ord_group` before writing the JSON** — they are part of the output (§7), and without them `clindroid-rtf-rendering` cannot tell where one parameter's section ends. Equally, never give them an element in `columns`: they are structural, not rendered columns.
