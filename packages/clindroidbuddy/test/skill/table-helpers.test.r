# Checks the shared table helpers (the "Shared Helpers" R block of the table skills) against
# the behaviour the table skills describe. Base R, plus r2rtf for the rendering check when installed.
# Usage: Rscript table-helpers.test.r <file holding the Shared Helpers block>

source(commandArgs(trailingOnly = TRUE)[1])

expect_condition <- function(expr, class, pattern) {
  hit <- tryCatch({ expr; NULL }, condition = function(c) if (inherits(c, class)) conditionMessage(c))
  if (is.null(hit) || !grepl(pattern, hit)) stop(sprintf("expected a %s matching '%s', got: %s", class, pattern, format(hit)))
}
quiet <- function(expr) suppressWarnings(expr)

# reconcile_trt_levels: spec order, data names, extras by the sort variable, Total last
arms <- c("Placebo", "Xanomeline High Dose", "Xanomeline Low Dose", "Screen Extra")
arm_n <- c(0, 81, 54, 99)
stopifnot(identical(
  quiet(reconcile_trt_levels(arms, c("Placebo", "Xan Low", "Xanomeline Low Dose", "Xanomeline High Dose"),
                             "TRT01A", sort_values = arm_n, total = TRUE)),
  c("Placebo", "Xanomeline Low Dose", "Xanomeline High Dose", "Screen Extra", "Total")))
expect_condition(reconcile_trt_levels(arms, c("Placebo", "Xan Low"), "TRT01A", total = TRUE),
                 "warning", "Xan Low.*dropped")
stopifnot(identical(reconcile_trt_levels(c("A", "B", ""), c("B", "A", "Total"), "TRT01A", total = FALSE),
                    c("B", "A")))

# stored_decimals
stopifnot(stored_decimals(c(54.4, 60, NA), "WEIGHTBL") == 1L, stored_decimals(c(70, 81), "AGE") == 0L)
expect_condition(stored_decimals(1 / 3, "BMIBL"), "error", "ask the user")

# bind_display_factor
sex <- c("M", "F", "", NA, "U")
f <- quiet(bind_display_factor(sex, c("M" = "Male", "F" = "Female"), "SEX", missing_label = "Missing"))
stopifnot(identical(levels(f), c("Male", "Female", "U", "Missing")),
          identical(as.character(f), c("Male", "Female", "Missing", "Missing", "U")))
expect_condition(bind_display_factor(sex, c("M" = "Male", "F" = "Female"), "SEX"), "warning", "rendered verbatim: U")
expect_condition(bind_display_factor(c("WHITE", "BLACK OR AFRICAN AMERICAN"), c("BLACK" = "Black", "WHITE" = "White"), "RACE"),
                 "error", "BLACK.*match no value")
expect_condition(bind_display_factor(sex, c("M" = "Male", "F" = "Female", "U" = "Missing"), "SEX", missing_label = "Missing"),
                 "error", "also a category label")

# categorical_p_value: exact names, no continuity correction, conditional exact test
tab22 <- as.table(matrix(c(12, 5, 9, 14), 2))
tab23 <- as.table(matrix(c(10, 3, 8, 9, 1, 2), 2))   # expected count < 5 in the third column
stopifnot(all.equal(categorical_p_value(tab22, "Pearson's chi-square test", "SEX"),
                    chisq.test(tab22, correct = FALSE)$p.value))
stopifnot(all.equal(categorical_p_value(tab22, "Fisher's exact test", "SEX"), fisher.test(tab22)$p.value))
expect_condition(categorical_p_value(tab23, "Fisher's exact test", "RACE"), "warning", "Fisher-Freeman-Halton")
stopifnot(all.equal(categorical_p_value(tab23, "Pearson's chi-square test; exact test if any expected count < 5", "RACE"),
                    fisher.test(tab23)$p.value))
big <- as.table(matrix(c(40, 35, 38, 42), 2))
stopifnot(all.equal(categorical_p_value(big, "Pearson's chi-square test; exact test if any expected count < 5", "SEX"),
                    chisq.test(big, correct = FALSE)$p.value))
expect_condition(categorical_p_value(tab22, "Chi-square test; Fisher's exact test if any expected cell count < 5", "SEX"),
                 "error", "no categorical test is implemented")
expect_condition(categorical_p_value(tab22, "Cochran-Mantel-Haenszel test", "SEX"), "error", "no categorical test")
expect_condition(categorical_p_value(as.table(matrix(c(3, 4), 2)), "Pearson's chi-square test", "SEX"),
                 "error", "2 x 1 table")
with_empty <- table(factor(c("A", "A", "B", "B", "A", "B"), levels = c("A", "B", "Total")),
                    factor(c("F", "M", "F", "M", "F", "M"), levels = c("F", "M", "Missing")))
stopifnot(!is.nan(quiet(categorical_p_value(with_empty, "Pearson's chi-square test", "SEX"))))

# continuous_p_value: the Total level and missing values are dropped; group counts are checked
age <- c(70, 75, 81, 68, 77, 72, 79, 85, 74, NA)
trt <- factor(rep(c("Placebo", "Low", "High"), length.out = 10), levels = c("Placebo", "Low", "High", "Total"))
stopifnot(all.equal(continuous_p_value(age, trt, "ANOVA", "AGE"),
                    summary(aov(age ~ droplevels(trt)))[[1]][["Pr(>F)"]][1]))
expect_condition(continuous_p_value(age, trt, "Two-sample t-test", "AGE"), "error", "3 treatment group")
two <- droplevels(factor(trt, exclude = "High"))
stopifnot(all.equal(continuous_p_value(age, two, "Two-sample t-test", "AGE"),
                    t.test(age ~ two, var.equal = TRUE)$p.value))
expect_condition(continuous_p_value(age, trt, "ANCOVA adjusted for site", "AGE"), "error", "no continuous test")
expect_condition(continuous_p_value(numeric(0), trt[0], "ANOVA", "CREPB"), "error", "0 treatment group")

# format_p_value
stopifnot(identical(format_p_value(0.00002, "AGE"), "<0.001"), identical(format_p_value(0.0449, "AGE"), "0.045"),
          identical(format_p_value(0.001, "AGE"), "0.001"), identical(format_p_value(0.004, "AGE", 2L), "<0.01"))
expect_condition(format_p_value(NaN, "SEX"), "error", "NA/NaN")

# continuous_block / categorical_block (tidyverse)
if (all(vapply(c("dplyr", "tidyr", "tibble"), requireNamespace, logical(1), quietly = TRUE))) {
  arms <- c("Placebo", "Active")
  d <- data.frame(TRT01A = rep(arms, each = 4), AGE = c(70, 72, NA, 80, 60, 61, 65, 66),
                  SEX = c("F", "M", "", "F", "M", "M", "F", "M"), stringsAsFactors = FALSE)
  cb <- continuous_block(d, "AGE", "Age(y)", 1L, c(arms, "Total"), digits = c(Mean = 1, SD = 2, Median = 1, Min = 1, Max = 1),
                         method = "ANOVA")
  stopifnot(identical(names(cb), c("ord_group", "group", "label", "Placebo", "Active", "Total", "p_value")),
            identical(cb$label, c("Age(y)", "n", "Mean", "SD", "Median", "Min", "Max")),
            identical(cb$Placebo[2], "3"), identical(cb$Total[2], "7"), identical(cb$Placebo[3], "74.0"),
            cb$p_value[1] != "", all(cb$p_value[-1] == ""), all(cb$group == "Age(y)"), all(cb$ord_group == 1L))
  # no Total, combined tokens, an arm whose values are all missing
  d2 <- d; d2$AGE[d2$TRT01A == "Active"] <- NA
  cb2 <- continuous_block(d2, "AGE", "Age(y)", 1L, arms, stats = c("n", "Mean (SD)", "Median [Min-Max]"),
                          digits = c(Mean = 1, SD = 2, Median = 1, Min = 1, Max = 1))
  stopifnot(identical(names(cb2), c("ord_group", "group", "label", "Placebo", "Active")),
            identical(cb2$Active, c("", "0", "NA (NA)", "NA [NA-NA]")), !any(grepl("Inf", unlist(cb2))))
  expect_condition(continuous_block(d, "AGE", "Age(y)", 1L, arms, stats = c("n", "Q1")), "error", "Q1 are not implemented")
  expect_condition(continuous_block(d, "AGE", "Age(y)", 1L, "Placebo"), "error", "outside trt_levels: Active")
  big <- c(Placebo = 4L, Active = 4L, Total = 8L)
  kb <- quiet(categorical_block(d, "SEX", "Sex", 2L, c("F" = "Female", "M" = "Male"), c(arms, "Total"), big,
                                missing_label = "Missing", method = "Fisher's exact test"))
  stopifnot(identical(kb$label, c("Sex", "n", "Female", "Male", "Missing")),
            identical(kb$Placebo, c("", "3", "2 (50.0%)", "1 (25.0%)", "1 (25.0%)")),
            identical(kb$Total[2], "7"), kb$p_value[1] != "", all(kb$p_value[-1] == ""))
  kb2 <- quiet(categorical_block(d, "SEX", "Sex", 2L, c("F" = "Female", "M" = "Male"), arms, big, show_n = FALSE))
  stopifnot(identical(kb2$label, c("Sex", "Female", "Male")), !"p_value" %in% names(kb2))
}

# rtf_escape
stopifnot(identical(rtf_escape("a{b}\\c"), "a\\{b\\}\\\\c"), identical(rtf_escape("±"), "\\uc1\\u177?"))

# render_ard_rtf: a valid, brace-balanced RTF from the payload list (needs r2rtf)
if (requireNamespace("r2rtf", quietly = TRUE)) {
  dir <- tempfile(); dir.create(dir)
  rows <- data.frame(ord_group = c(1L, 1L, 2L, 2L), group = c("Age(y)", "Age(y)", "Sex", "Sex"),
                     label = c("Age(y)", "Mean", "Sex", "Female"), Placebo = c("", "75.2", "", "53 (61.6%)"),
                     Total = c("", "75.4", "", "103 (60.6%)"), p_value = c("0.593", "", "<0.001", ""))
  payload <- list(protocol_number = "XYZ-123", tfl_id = "table_14_2_01", tfl_number = "Table 14-2.01",
                  tfl_title = "Demographics {test} 年齢", analysis_population = "ITT Population",
                  execution_datetime = "2026-01-01T00:00:00+0900", program_path = "programs/tfls/table_14_2_01.r",
                  big_n = list(Placebo = 86L, Total = 170L), columns = c("", "Placebo", "Total", "p-value (a)"),
                  footnotes = data.frame(ord = 1L, label = "a", text = "Pearson's chi-square test."), rows = rows)
  for (fn in list(payload$footnotes, list())) {
    payload$footnotes <- fn
    rtf <- file.path(dir, "t.rtf")
    render_ard_rtf(payload, rtf)
    txt   <- paste(readLines(rtf, warn = FALSE), collapse = "\n")
    plain <- gsub("\\\\[\\\\{}]", "", txt)   # drop escaped backslashes and braces
    stopifnot(startsWith(txt, "{\\rtf1"),
              nchar(gsub("[^{]", "", plain)) == nchar(gsub("[^}]", "", plain)),
              grepl("Placebo\\line(N=86)", txt, fixed = TRUE),
              !grepl("[^\x01-\x7F]", txt))
  }
  bad <- payload; bad$columns <- bad$columns[-4]
  expect_condition(render_ard_rtf(bad, rtf), "error", "3 headers")
  expect_condition(render_ard_rtf(payload, file.path(dir, "T_Table.rtf")), "error", "lowercase.*rtf = T_Table.rtf")
  no_header <- payload; no_header$rows <- no_header$rows[no_header$rows$label != no_header$rows$group, ]
  expect_condition(render_ard_rtf(no_header, rtf), "error", "without a header row: Age\\(y\\), Sex")
  stray <- payload; stray$rows$p_value[2] <- "0.5"
  expect_condition(render_ard_rtf(stray, rtf), "error", "other than the header row in: Age\\(y\\)")
  label_head <- payload; label_head$columns[1] <- "label"
  expect_condition(render_ard_rtf(label_head, rtf), "error", "columns\\[1\\] is")
  upper_program <- payload; upper_program$program_path <- "programs/tfls/table_14_2_01.R"
  expect_condition(render_ard_rtf(upper_program, rtf), "error", "program = table_14_2_01.R")
}

cat("table helpers: all checks passed\n")
