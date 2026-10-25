import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import path from "path";
import { downloadCdiscTerminology } from "../../src/tool/data_standard_dict";
import { Instance } from "../../src/project/instance";

const TEMP_TEST_DIR = path.resolve(import.meta.dirname, "../../../..", "temp_test");

function cleanDictDir() {
	const dictDir = path.join(TEMP_TEST_DIR, "dict");
	if (fs.existsSync(dictDir)) fs.rmSync(dictDir, { recursive: true, force: true });
}

async function withInstance<T>(fn: () => Promise<T>): Promise<T> {
	return Instance.provide({ directory: TEMP_TEST_DIR, fn });
}

describe("tool.data_standard_dict", () => {
	test("throws error for invalid standard", async () => {
		await withInstance(async () => {
			cleanDictDir();
			await expect(downloadCdiscTerminology("invalid", "2023-01-01")).rejects.toThrow("Invalid standard");
		});
	});

	test("throws error for invalid version format", async () => {
		await withInstance(async () => {
			cleanDictDir();
			await expect(downloadCdiscTerminology("sdtm", "2023/01/01")).rejects.toThrow("Version must be a valid date in yyyy-mm-dd format");
		});
	});

	test("throws error for non-existent date", async () => {
		await withInstance(async () => {
			cleanDictDir();
			await expect(downloadCdiscTerminology("sdtm", "2023-02-31")).rejects.toThrow("Version must be a valid date in yyyy-mm-dd format");
		});
	});

	test.skip("downloads terminology successfully for all standards", async () => {
		await withInstance(async () => {
			cleanDictDir();

			const result1 = await downloadCdiscTerminology("sdtm", "2026-03-27");
			const result2 = await downloadCdiscTerminology("adam", "2026-03-27");
			const result3 = await downloadCdiscTerminology("define", "2026-03-27");

			expect(result1).toBe(true);
			expect(result2).toBe(true);
			expect(result3).toBe(true);

			expect(fs.existsSync(path.join(TEMP_TEST_DIR, "dict", "sdtm Terminology 2026-03-27.txt"))).toBe(true);
			expect(fs.existsSync(path.join(TEMP_TEST_DIR, "dict", "adam Terminology 2026-03-27.txt"))).toBe(true);
			expect(fs.existsSync(path.join(TEMP_TEST_DIR, "dict", "define Terminology 2026-03-27.txt"))).toBe(true);

			const sdtmContent = fs.readFileSync(path.join(TEMP_TEST_DIR, "dict", "sdtm Terminology 2026-03-27.txt"), "utf8");
			expect(sdtmContent.length).toBeGreaterThan(0);
		});
	});

	test.skip("handles network error and does not leave partial file under temp_test dict/", async () => {
		await withInstance(async () => {
			cleanDictDir();
			const origFetch = globalThis.fetch;
			globalThis.fetch = (() => Promise.reject(new Error("Network Error"))) as never;
			try {
				await expect(downloadCdiscTerminology("adam", "2026-03-27")).rejects.toThrow();

				const dictDir = path.join(TEMP_TEST_DIR, "dict");
				if (fs.existsSync(dictDir)) {
					expect(fs.readdirSync(dictDir).filter((f) => f.endsWith(".txt")).length).toBe(0);
				} else { expect(true).toBe(true); }
			} finally { globalThis.fetch = origFetch; }
		});
	});

	test.skip("handles HTTP error response", async () => {
		await withInstance(async () => {
			cleanDictDir();
			const mockResponse = new Response("", { status: 404, statusText: "Not Found" });
			const origFetch = globalThis.fetch;
			globalThis.fetch = (() => Promise.resolve(mockResponse)) as never;
			try {
				await expect(downloadCdiscTerminology("adam", "2026-03-27")).rejects.toThrow("HTTP 404");
			} finally {
				globalThis.fetch = origFetch;
			}
		});
	});

	test.skip("supports adam and define standards", async () => {
		await withInstance(async () => {
			cleanDictDir();
			const result1 = await downloadCdiscTerminology("adam", "2026-03-27");
			const result2 = await downloadCdiscTerminology("define", "2026-03-27");

			expect(result1).toBe(true);
			expect(result2).toBe(true);
			expect(fs.existsSync(path.join(TEMP_TEST_DIR, "dict", "adam Terminology 2026-03-27.txt"))).toBe(true);
			expect(fs.existsSync(path.join(TEMP_TEST_DIR, "dict", "define Terminology 2026-03-27.txt"))).toBe(true);
		});
	});
});
