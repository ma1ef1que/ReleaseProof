import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { playwrightJsonReportSchema } from "../../src/features/playwright/playwright-json-schema";

const fixtureUrl = new URL(
  "../../src/test-fixtures/playwright-json/generated.json",
  import.meta.url,
);

async function loadReport() {
  const contents = await readFile(fixtureUrl, "utf8");
  return playwrightJsonReportSchema.parse(JSON.parse(contents));
}

test("imports a JSON report in the browser without sending its contents", async ({
  page,
}) => {
  const browserDiagnostics: string[] = [];
  page.on("pageerror", (error) =>
    browserDiagnostics.push(error.stack ?? error.message),
  );
  page.on("request", (request) => {
    if (request.isNavigationRequest()) {
      browserDiagnostics.push(
        `Navigation request: ${request.method()} ${request.url()}`,
      );
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      browserDiagnostics.push(`Main frame navigated to ${frame.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    browserDiagnostics.push(
      `Request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
    );
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      message.text().startsWith("FORM_SUBMIT")
    ) {
      browserDiagnostics.push(message.text());
    }
  });
  const report = await loadReport();
  const spec = report.suites[0]?.specs?.[0];
  if (!spec) {
    throw new Error("Generated fixture has no first spec.");
  }
  const privateTitle = "LOCAL_ONLY_SYNTHETIC_REPORT_CONTENT";
  spec.title = privateTitle;
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.evaluate(() => {
    document.addEventListener("submit", (event) => {
      console.log(`FORM_SUBMIT defaultPrevented=${event.defaultPrevented}`);
    });
  });
  await page.getByLabel(/Report file/).setInputFiles({
    name: "playwright.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await page.getByRole("button", { name: "Import report" }).click();

  try {
    await expect(
      page.getByRole("heading", { name: "Report ready" }),
    ).toBeVisible({ timeout: 5_000 });
  } catch {
    const fileState = await page.locator("#report-file").evaluate((element) => {
      const input = element as HTMLInputElement;
      return {
        disabled: input.disabled,
        value: input.value,
        files: Array.from(input.files ?? []).map(({ name, size, type }) => ({
          name,
          size,
          type,
        })),
      };
    });
    throw new Error(
      `Report import did not complete. URL: ${page.url()}\nFile input: ${JSON.stringify(fileState)}\nImport button disabled: ${await page.getByRole("button", { name: "Import report" }).isDisabled()}\nUI: ${await page.locator("body").innerText()}\nBrowser diagnostics: ${browserDiagnostics.join("\n") || "none"}`,
    );
  }
  await expect(page.getByText("4 logical tests and 5 attempts")).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("flaky");
  await expect(
    page.getByRole("button", { name: /recovers after a retry/i }),
  ).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("all");
  await page.getByLabel("Search tests").fill("Error:");
  await page
    .getByRole("button", { name: /expected failure is reported/i })
    .click();
  await expect(
    page.getByRole("region", { name: "Test attempts" }),
  ).toContainText("toBe");
  await page
    .getByRole("textbox", { name: "QA annotation" })
    .fill("LOCAL_ONLY_TEST_ANNOTATION");
  await page.getByLabel("Run / release title").fill("LOCAL_ONLY_RELEASE_TITLE");
  await page.getByLabel("Release notes").fill("LOCAL_ONLY_RELEASE_NOTES");
  await page
    .getByRole("checkbox", {
      name: "These notes identify a release blocker",
    })
    .check();
  for (const label of [
    "Critical user flows checked",
    "Known blockers reviewed",
    "Failed tests triaged",
    "Environment and build verified",
    "Relevant manual checks completed",
  ]) {
    await page.getByLabel(`${label} status`).selectOption("not_applicable");
  }
  await expect(page.getByText("Review required")).toBeVisible();
  await expect(
    page.getByText("A user marked the release notes as indicating a blocker."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  for (const privateValue of [
    privateTitle,
    "LOCAL_ONLY_TEST_ANNOTATION",
    "LOCAL_ONLY_RELEASE_TITLE",
    "LOCAL_ONLY_RELEASE_NOTES",
  ]) {
    expect(requests.some((request) => request.includes(privateValue))).toBe(
      false,
    );
  }
  await page.getByRole("button", { name: "Clear report" }).click();
  await expect(page.getByRole("heading", { name: "Report ready" })).toHaveCount(
    0,
  );
});

test("shows no known blockers only after required checklist items are completed", async ({
  page,
}) => {
  const report = await loadReport();
  let testCount = 0;
  for (const suite of report.suites) {
    for (const spec of suite.specs ?? []) {
      for (const testCase of spec.tests ?? []) {
        const lastResult = testCase.results?.at(-1);
        if (!lastResult) {
          throw new Error("Generated fixture has a test without a result.");
        }
        testCount += 1;
        testCase.expectedStatus = "passed";
        testCase.results = [
          {
            ...lastResult,
            status: "passed",
            retry: 0,
            errors: [],
            error: undefined,
            attachments: [],
          },
        ];
      }
    }
  }
  report.stats.expected = testCount;
  report.stats.skipped = 0;
  report.stats.unexpected = 0;
  report.stats.flaky = 0;

  await page.goto("/");
  await page.getByLabel(/Report file/).setInputFiles({
    name: "clean-report.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await page.getByRole("button", { name: "Import report" }).click();
  await expect(page.getByText("Evidence incomplete")).toBeVisible();

  for (const label of [
    "Critical user flows checked",
    "Known blockers reviewed",
    "Failed tests triaged",
    "Environment and build verified",
    "Relevant manual checks completed",
  ]) {
    await page.getByLabel(`${label} status`).selectOption("not_applicable");
  }

  await expect(
    page.getByText("No known blockers in imported evidence"),
  ).toBeVisible();
  await expect(
    page.getByText(/not a guarantee of release safety/i),
  ).toBeVisible();
});

test("loads clearly labeled synthetic demo data and supports keyboard navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const demoButton = page.getByRole("button", { name: "Try demo report" });
  await demoButton.focus();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("heading", { name: "Report ready" }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic demo report")).toBeVisible();
  await expect(
    page.getByText(
      /Illustrative synthetic data — not production test evidence/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("13 logical tests and 14 attempts"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Matching tests" }).getByRole("listitem"),
  ).toHaveCount(13);

  await page
    .getByRole("button", {
      name: /Checkout summary displays the selected items/,
    })
    .click();
  await expect(
    page.getByRole("img", { name: "Synthetic checkout overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Account dashboard loads/ }).click();
  await expect(
    page.getByText("Attachment not included in imported bundle."),
  ).toBeVisible();
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    elements: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          id: element.id,
          className: element.className.toString(),
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter(
        (element) =>
          element.width > 0 &&
          (element.left < -1 || element.right > window.innerWidth + 1),
      )
      .slice(0, 10),
  }));
  expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(
    360,
  );

  const privacyButton = page.getByRole("button", { name: "Privacy" });
  await privacyButton.click();
  await expect(
    page.getByRole("dialog", { name: "Your report stays in this browser" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close privacy information" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "I understand" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close privacy information" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(privacyButton).toBeFocused();
});

test("exports an imported ZIP report as standalone HTML with embedded images", async ({
  page,
}, testInfo) => {
  const report = await loadReport();
  const firstTest = report.suites[0]?.specs?.[0]?.tests?.[0];
  const firstAttempt = firstTest?.results?.[0];
  if (!firstAttempt) {
    throw new Error("Generated fixture has no first attempt.");
  }
  firstAttempt.attachments = [
    {
      name: "screenshot",
      contentType: "image/png",
      path: "assets/screenshot.png",
    },
  ];

  const zip = new JSZip();
  zip.file("playwright-report.json", JSON.stringify(report));
  zip.file(
    "assets/screenshot.png",
    new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x13,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]),
    { binary: true },
  );
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.url()} ${request.postData() ?? ""}`);
  });

  await page.goto("/");
  await page.getByLabel(/Report file/).setInputFiles({
    name: "playwright-bundle.zip",
    mimeType: "application/zip",
    buffer: zipBuffer,
  });
  await page.getByRole("button", { name: "Import report" }).click();

  await expect(
    page.getByRole("heading", { name: "Report ready" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "screenshot" })).toBeVisible();
  await page.getByLabel("Run / release title").fill("LOCAL_ONLY_EXPORT_TITLE");
  await page
    .getByRole("textbox", { name: "QA annotation" })
    .fill("LOCAL_ONLY_EXPORT_ANNOTATION");
  await page.getByRole("button", { name: "Preview export" }).click();

  const preview = page.frameLocator(
    'iframe[title="Standalone HTML report preview"]',
  );
  const closePreviewButton = page.getByRole("button", {
    name: "Close preview",
  });
  await expect(closePreviewButton).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Print / Save as PDF" }),
  ).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Print / Save as PDF" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Download HTML" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closePreviewButton).toBeFocused();
  await expect(preview.locator("body")).toContainText(
    "LOCAL_ONLY_EXPORT_TITLE",
  );
  await expect(preview.locator("body")).toContainText(
    "LOCAL_ONLY_EXPORT_ANNOTATION",
  );
  await expect(
    preview.getByRole("heading", { name: "QA checklist" }),
  ).toBeVisible();
  await expect(preview.getByRole("img", { name: "screenshot" })).toBeVisible();
  const imageSource = await preview
    .getByRole("img", { name: "screenshot" })
    .getAttribute("src");
  expect(imageSource).toMatch(/^data:image\/png;base64,/);

  await page
    .locator('iframe[title="Standalone HTML report preview"]')
    .evaluate((element) => {
      const previewWindow = (element as HTMLIFrameElement).contentWindow;
      if (!previewWindow) {
        throw new Error("Export preview window is unavailable.");
      }
      previewWindow.print = () =>
        console.log("ReleaseProof print action invoked");
    });
  const printInvocation = page.waitForEvent(
    "console",
    (message) => message.text() === "ReleaseProof print action invoked",
  );
  await page.getByRole("button", { name: "Print / Save as PDF" }).click();
  await printInvocation;

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const exportPath = testInfo.outputPath("releaseproof-export.html");
  await download.saveAs(exportPath);
  const exportedHtml = await readFile(exportPath, "utf8");
  expect(exportedHtml).toContain("LOCAL_ONLY_EXPORT_TITLE");
  expect(exportedHtml).toContain("LOCAL_ONLY_EXPORT_ANNOTATION");
  expect(exportedHtml).toContain("data:image/png;base64,");
  expect(exportedHtml).toContain("Content-Security-Policy");
  expect(exportedHtml).not.toContain("blob:");

  await page.getByRole("button", { name: "Close preview" }).click();
  await page.goto(pathToFileURL(exportPath).href);
  await expect(
    page.getByRole("heading", { name: "LOCAL_ONLY_EXPORT_TITLE" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "screenshot" })).toBeVisible();
  await expect(
    page.getByText(/This summary reflects only the evidence imported/i),
  ).toBeVisible();
  for (const privateValue of [
    "LOCAL_ONLY_EXPORT_TITLE",
    "LOCAL_ONLY_EXPORT_ANNOTATION",
  ]) {
    expect(requests.some((request) => request.includes(privateValue))).toBe(
      false,
    );
  }
});

test("shows safe errors for malformed JSON", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/Report file/).setInputFiles({
    name: "malformed.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await page.getByRole("button", { name: "Import report" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "The selected file is not valid JSON.",
  );
});
