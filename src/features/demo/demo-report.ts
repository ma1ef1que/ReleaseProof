import type { ImportedReport } from "../import-report/worker-messages";
import { appConfig } from "../../config/app-config";
import { parsePlaywrightJson } from "../playwright/playwright-normalizer";
import type { PlaywrightJsonReport } from "../playwright/playwright-json-schema";

interface DemoAttachmentInput extends Record<string, unknown> {
  name: string;
  contentType: string;
  path: string;
}

interface DemoAttempt {
  status: string;
  duration: number;
  message?: string;
  stack?: string;
  attachments?: DemoAttachmentInput[];
}

interface DemoCase {
  title: string;
  projectName: string;
  expectedStatus?: string;
  attempts: DemoAttempt[];
}

const demoCases: DemoCase[] = [
  {
    title: "Sign-in accepts valid credentials",
    projectName: "Chromium · desktop",
    attempts: [{ status: "passed", duration: 128 }],
  },
  {
    title: "Account dashboard loads",
    projectName: "Chromium · desktop",
    attempts: [
      {
        status: "passed",
        duration: 246,
        attachments: [
          {
            name: "Browser console output",
            contentType: "text/plain",
            path: "demo-assets/missing-console.txt",
          },
        ],
      },
    ],
  },
  {
    title: "Checkout summary displays the selected items",
    projectName: "Chromium · desktop",
    attempts: [
      {
        status: "passed",
        duration: 384,
        attachments: [
          {
            name: "Synthetic checkout overview",
            contentType: "image/png",
            path: "demo-assets/checkout-overview.png",
          },
        ],
      },
    ],
  },
  {
    title: "Shipping option can be selected",
    projectName: "Firefox · desktop",
    attempts: [{ status: "passed", duration: 319 }],
  },
  {
    title: "Order total includes the delivery fee",
    projectName: "Chromium · desktop",
    attempts: [
      {
        status: "failed",
        duration: 1_240,
        message:
          "Expected order total to be $42.00, but the page displayed $39.00.",
        stack: "at checkout.spec.ts:28:17",
      },
    ],
  },
  {
    title: "Payment form masks the card number",
    projectName: "WebKit · desktop",
    attempts: [{ status: "passed", duration: 182 }],
  },
  {
    title: "Confirmation page shows the demo order",
    projectName: "Chromium · desktop",
    attempts: [
      {
        status: "passed",
        duration: 410,
        attachments: [
          {
            name: "Synthetic confirmation page",
            contentType: "image/png",
            path: "demo-assets/confirmation-page.png",
          },
        ],
      },
    ],
  },
  {
    title: "Profile preferences can be updated",
    projectName: "Firefox · desktop",
    attempts: [{ status: "passed", duration: 502 }],
  },
  {
    title: "User can sign out",
    projectName: "Chromium · desktop",
    attempts: [{ status: "passed", duration: 91 }],
  },
  {
    title: "Inventory count updates after cancellation",
    projectName: "Chromium · desktop",
    attempts: [
      {
        status: "failed",
        duration: 2_100,
        message: "Timed out waiting for the inventory badge to update.",
        stack: "at inventory.spec.ts:54:23",
      },
    ],
  },
  {
    title: "Product search returns matching results",
    projectName: "Firefox · desktop",
    attempts: [
      {
        status: "failed",
        duration: 1_005,
        message: "The first search attempt returned no results.",
      },
      { status: "passed", duration: 302 },
    ],
  },
  {
    title: "Legacy payment fallback is skipped",
    projectName: "WebKit · desktop",
    attempts: [{ status: "skipped", duration: 0 }],
  },
  {
    title: "Deprecated export endpoint remains disabled",
    projectName: "Chromium · desktop",
    expectedStatus: "failed",
    attempts: [
      {
        status: "failed",
        duration: 84,
        message: "The endpoint is intentionally unavailable in this demo.",
      },
    ],
  },
];

export async function createDemoReport(): Promise<ImportedReport> {
  const parsed = parsePlaywrightJson(JSON.stringify(createDemoSource()), {
    sourceFileName: `${appConfig.productName.toLocaleLowerCase()}-synthetic-demo.json`,
    runTitle: "Release candidate · synthetic demo",
  });
  if (!parsed.ok) {
    throw new Error(
      `The built-in demo report is invalid: ${parsed.error.message}`,
    );
  }

  parsed.report.metadata.isDemo = true;
  const assets = new Map<string, Blob>();
  const screenshotSpecs = [
    {
      path: "demo-assets/checkout-overview.png",
      title: "Cart overview",
      color: "#28674e",
    },
    {
      path: "demo-assets/confirmation-page.png",
      title: "Order confirmed",
      color: "#315b85",
    },
  ];

  for (const screenshot of screenshotSpecs) {
    const attachment = parsed.report.tests
      .flatMap((test) => test.attachments)
      .find((item) => item.sourcePath === screenshot.path);
    if (!attachment) {
      throw new Error(`The built-in demo is missing ${screenshot.path}.`);
    }

    const blob = await createSyntheticScreenshot(
      screenshot.title,
      screenshot.color,
    );
    attachment.missing = false;
    attachment.sizeBytes = blob.size;
    assets.set(attachment.id, blob);
  }

  return { report: parsed.report, assets };
}

function createDemoSource(): PlaywrightJsonReport {
  return {
    config: { version: "1.64.1" },
    errors: [],
    stats: {
      startTime: "2026-10-29T12:00:00.000Z",
      duration: demoCases.reduce(
        (total, testCase) =>
          total +
          testCase.attempts.reduce(
            (attemptTotal, attempt) => attemptTotal + attempt.duration,
            0,
          ),
        0,
      ),
      expected: demoCases.length,
      skipped: 1,
      unexpected: 2,
      flaky: 1,
    },
    suites: [
      {
        title: "Release candidate",
        file: "demo/release-candidate.spec.ts",
        specs: demoCases.map((demoCase, index) => ({
          title: demoCase.title,
          file: "demo/release-candidate.spec.ts",
          line: index + 1,
          column: 1,
          tests: [
            {
              projectName: demoCase.projectName,
              expectedStatus: demoCase.expectedStatus ?? "passed",
              results: demoCase.attempts.map((attempt, retry) => ({
                workerIndex: 0,
                parallelIndex: 0,
                status: attempt.status,
                duration: attempt.duration,
                retry,
                startTime: "2026-10-29T12:00:00.000Z",
                annotations: [],
                attachments: attempt.attachments ?? [],
                ...(attempt.message
                  ? {
                      error: {
                        message: attempt.message,
                        ...(attempt.stack ? { stack: attempt.stack } : {}),
                      },
                    }
                  : {}),
              })),
            },
          ],
        })),
      },
    ],
  };
}

function createSyntheticScreenshot(
  title: string,
  accent: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(
      "This browser cannot render the synthetic demo screenshots.",
    );
  }

  context.fillStyle = "#f3f6f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, canvas.width, 64);
  context.fillStyle = "#ffffff";
  context.font = "600 21px system-ui, sans-serif";
  context.fillText("SYNTHETIC DEMO · NOT PRODUCTION EVIDENCE", 24, 40);
  context.fillStyle = "#172321";
  context.font = "600 25px system-ui, sans-serif";
  context.fillText(title, 28, 112);
  context.fillStyle = "#ffffff";
  context.fillRect(28, 140, 584, 62);
  context.fillRect(28, 218, 278, 82);
  context.fillRect(334, 218, 278, 82);
  context.fillStyle = accent;
  context.fillRect(48, 160, 180, 14);
  context.fillRect(48, 236, 142, 12);
  context.fillRect(354, 236, 170, 12);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("A synthetic demo screenshot could not be created."));
      }
    }, "image/png");
  });
}
