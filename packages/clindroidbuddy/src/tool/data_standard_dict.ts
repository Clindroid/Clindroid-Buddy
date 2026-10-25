import * as fs from 'fs';
import * as path from 'path';
import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { Instance } from '../project/instance';
import { Log } from "../util"
import DESCRIPTION from "./data_standard_dict.txt"

const log = Log.create({ service: "data_standard_dict" })

const TERMINOLOGY_BASE_URLS: Record<string, string> = {
  sdtm: 'https://evs.nci.nih.gov/ftp1/CDISC/SDTM/Archive/',
  adam: 'https://evs.nci.nih.gov/ftp1/CDISC/ADaM/Archive/',
  define: 'https://evs.nci.nih.gov/ftp1/CDISC/Define-XML/Archive/',
};

function assertValidStandard(std: string): string {
  const stdLower = std.toLowerCase();
  if (!(stdLower in TERMINOLOGY_BASE_URLS)) {
    throw new Error(`Invalid standard: ${std}. Supported standards are: ${Object.keys(TERMINOLOGY_BASE_URLS).join(', ')}`);
  }
  return stdLower;
}

function assertValidVersion(version: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) {
    throw new Error('Version must be a valid date in yyyy-mm-dd format');
  }

  const [year, month, day] = version.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) {
    throw new Error('Version must be a valid date in yyyy-mm-dd format');
  }
}

function buildDownloadUrl(std: string, version: string): { stdLower: string; fileName: string; downloadUrl: string } {
  const stdLower = assertValidStandard(std);
  assertValidVersion(version);
  const fileName = `${std} Terminology ${version}.txt`;
  const downloadUrl = TERMINOLOGY_BASE_URLS[stdLower] + encodeURIComponent(fileName);
  return { stdLower, fileName, downloadUrl };
}

/**
 * Downloads CDISC terminology and saves it locally.
 */
export async function downloadCdiscTerminology(std: string, version: string): Promise<boolean> {
  const { fileName, downloadUrl } = buildDownloadUrl(std, version);

  const dictDirPath = path.join(Instance.directory, 'dict');
  const savePath = path.join(dictDirPath, fileName);

  if (!fs.existsSync(dictDirPath)) {
    fs.mkdirSync(dictDirPath, { recursive: true });
  }

  log.info("downloading terminology", { std, downloadUrl });

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const body = await response.arrayBuffer();
  fs.writeFileSync(savePath, Buffer.from(body));

  log.info("download completed", { fileName, savePath });
  return true;
}

const Parameters = z.object({
  std: z.enum(["sdtm", "adam", "define"]).describe("The CDISC standard whose Controlled Terminology to download."),
  version: z.string().describe("The terminology package version, as a date in yyyy-mm-dd format (e.g. 2026-03-27)."),
})

export const DownloadTerminologyTool = Tool.define(
  "download_terminology",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const { fileName, downloadUrl } = buildDownloadUrl(params.std, params.version)

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [downloadUrl],
            always: ["*"],
            metadata: { std: params.std, version: params.version, url: downloadUrl },
          })

          yield* Effect.tryPromise(() => downloadCdiscTerminology(params.std, params.version))

          const savePath = path.join(Instance.directory, "dict", fileName)
          return {
            title: path.join("dict", fileName),
            metadata: { std: params.std, version: params.version, savePath, url: downloadUrl },
            output: `Downloaded ${fileName} to ${savePath}`,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
