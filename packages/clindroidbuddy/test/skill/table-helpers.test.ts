import { describe, expect, test } from "bun:test"
import path from "path"
import os from "os"

// r-coder-complex-table, clinical-categorical-single-factor and clinical-bds-multi-param
// each carry the same "Shared Helpers" R block and the same "R Function Reference" section
// in their SKILL.md. Both live in the body because the model cannot read a skill's other
// files from a project directory (external_directory is denied). They drifted apart while
// they were hand-maintained copies, so the copies are now required to be byte-identical.
const skills = path.join(import.meta.dir, "..", "..", "src", "skill", "skills")
const tableSkills = ["r-coder-complex-table", "clinical-categorical-single-factor", "clinical-bds-multi-param"]

const helperBlock = async (skill: string) =>
  [...(await Bun.file(path.join(skills, skill, "SKILL.md")).text()).matchAll(/```r\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .filter((block) => block.includes("# Clindroid table helpers"))

describe("table skill shared code", () => {
  test("the Shared Helpers block is identical in every table skill", async () => {
    const blocks = await Promise.all(tableSkills.map(helperBlock))
    expect(blocks.map((list) => list.length)).toEqual([1, 1, 1])
    expect(new Set(blocks.flat()).size).toBe(1)
  })

  test("the R Function Reference is identical in every table skill", async () => {
    const sections = await Promise.all(
      tableSkills.map(async (skill) =>
        (await Bun.file(path.join(skills, skill, "SKILL.md")).text()).match(
          /<!-- r-function-reference:start -->([\s\S]*?)<!-- r-function-reference:end -->/,
        )?.[1],
      ),
    )
    expect(sections.every(Boolean)).toBe(true)
    expect(new Set(sections).size).toBe(1)
  })

  test.skipIf(!Bun.which("Rscript"))("the Shared Helpers block behaves as the skills describe", async () => {
    const file = path.join(os.tmpdir(), `table-helpers-${process.pid}.r`)
    await Bun.write(file, (await helperBlock(tableSkills[0]))[0])
    const result = Bun.spawnSync(["Rscript", path.join(import.meta.dir, "table-helpers.test.r"), file])
    expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toMatchObject({ exitCode: 0 })
  })
})
