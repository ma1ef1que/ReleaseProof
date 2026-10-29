import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessageList {
  messages: MailpitMessage[];
}

interface MailpitMessageDetail {
  Text: string;
  HTML: string;
}

async function findAuthEmailLink(
  request: APIRequestContext,
  recipient: string,
  emailType: "signup" | "recovery",
): Promise<string | null> {
  const listResponse = await request.get(
    "http://127.0.0.1:54324/api/v1/messages?limit=100",
  );
  if (!listResponse.ok()) {
    throw new Error("Could not read the local confirmation email inbox.");
  }

  const { messages } = (await listResponse.json()) as MailpitMessageList;
  const message = messages.find(
    (candidate) =>
      candidate.To.some(
        (recipientAddress) =>
          recipientAddress.Address.toLowerCase() === recipient.toLowerCase(),
      ) &&
      candidate.Subject.toLowerCase().includes(
        emailType === "signup" ? "confirm" : "reset",
      ),
  );
  if (!message) {
    return null;
  }

  const detailResponse = await request.get(
    `http://127.0.0.1:54324/api/v1/message/${encodeURIComponent(message.ID)}`,
  );
  if (!detailResponse.ok()) {
    throw new Error("Could not read the local authentication email.");
  }

  const detail = (await detailResponse.json()) as MailpitMessageDetail;
  const emailBody = `${detail.Text}\n${detail.HTML}`.replaceAll("&amp;", "&");
  return (
    emailBody.match(/https?:\/\/[^\s"'<>]+/g)?.find((link) => {
      if (!link.includes("/auth/v1/verify")) {
        return false;
      }
      return new URL(link).searchParams.get("type") === emailType;
    }) ?? null
  );
}

test("signup, email confirmation, password recovery, and login work", async ({
  browser,
  page,
  request,
}) => {
  const email = `qa-${randomUUID()}@releaseproof.test`;
  const inviteeEmail = `qa-${randomUUID()}@releaseproof.test`;
  const initialPassword = `Initial-${randomUUID()}!`;
  const inviteePassword = `Invitee-${randomUUID()}!`;
  const updatedPassword = `Updated-${randomUUID()}!`;

  await page.goto("/");
  await page.getByRole("link", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByLabel("Confirm password").fill(initialPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(
    "check your inbox for a confirmation link",
    { timeout: 5_000 },
  );

  await page.goto("/#/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Confirm your email address before signing in.",
  );

  let confirmationLink: string | null = null;
  await expect
    .poll(
      async () => {
        confirmationLink = await findAuthEmailLink(request, email, "signup");
        return confirmationLink;
      },
      { message: "confirmation email should arrive in local Mailpit" },
    )
    .not.toBeNull();
  if (!confirmationLink) {
    throw new Error("Confirmation email did not contain a verification link.");
  }

  await page.goto(confirmationLink);
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("Primary QA workspace");
  await page
    .getByLabel(/Description/)
    .fill("Local integration-test workspace.");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Your role: Owner")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();

  await page
    .getByLabel(/I understand this report and its included attachments/)
    .check();
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      resolve("src", "test-fixtures", "playwright-json", "generated.json"),
    );
  await expect(
    page.getByText(/Report uploaded to private workspace storage/),
  ).toBeVisible();
  const sharedReportButton = page.getByRole("button", {
    name: /generated\.json/i,
  });
  await expect(sharedReportButton).toBeVisible();
  await sharedReportButton.click();
  await expect(
    page.getByRole("heading", { name: "Report ready" }),
  ).toBeVisible();
  await page.getByLabel("Run / release title").fill("Shared E2E report");
  await page
    .getByLabel("Critical user flows checked status")
    .selectOption("pass");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved version 2")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Shared E2E report/ }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download source" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("generated.json");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Shared E2E report/ }).click();
  await expect(page.getByLabel("Run / release title")).toHaveValue(
    "Shared E2E report",
  );
  await expect(
    page.getByLabel("Critical user flows checked status"),
  ).toHaveValue("pass");
  await expect(page.getByText("Saved version 2")).toBeVisible();

  await page.getByRole("link", { name: "Workspaces", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Secondary QA workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Secondary QA workspace", level: 1 }),
  ).toBeVisible();
  await page
    .getByLabel("Switch workspace")
    .selectOption({ label: "Primary QA workspace" });
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();
  await page
    .getByLabel("Switch workspace")
    .selectOption({ label: "Secondary QA workspace" });
  await expect(
    page.getByRole("heading", { name: "Secondary QA workspace", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Workspaces", exact: true }).click();
  await page.getByRole("link", { name: /Primary QA workspace/ }).click();
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();

  await page.getByLabel("Invite by email").fill(inviteeEmail);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Email delivery is not configured",
  );
  const invitationLink = await page
    .getByLabel("One-time invitation link")
    .inputValue();
  expect(invitationLink).toContain("#/invite/");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(invitationLink);
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByLabel("Password", { exact: true }).fill(inviteePassword);
  await page.getByLabel("Confirm password").fill(inviteePassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(
    "check your inbox for a confirmation link",
  );

  let inviteeConfirmationLink: string | null = null;
  await expect
    .poll(
      async () => {
        inviteeConfirmationLink = await findAuthEmailLink(
          request,
          inviteeEmail,
          "signup",
        );
        return inviteeConfirmationLink;
      },
      { message: "invited user's confirmation email should arrive" },
    )
    .not.toBeNull();
  if (!inviteeConfirmationLink) {
    throw new Error("Invited user's confirmation link was not found.");
  }
  await page.goto(inviteeConfirmationLink);
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).toBeVisible();
  await page.goto(invitationLink);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Your role: Editor")).toBeVisible();
  const invitedEditorReport = page.getByRole("button", {
    name: /Shared E2E report/,
  });
  await expect(invitedEditorReport).toBeVisible();
  await invitedEditorReport.click();
  await expect(page.getByLabel("Run / release title")).toHaveValue(
    "Shared E2E report",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);

  const ownerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
  });
  try {
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/#/login");
    await ownerPage.getByLabel("Email").fill(email);
    await ownerPage
      .getByLabel("Password", { exact: true })
      .fill(initialPassword);
    await ownerPage.getByRole("button", { name: "Sign in" }).click();
    await expect(
      ownerPage.getByRole("heading", { name: "Your workspaces" }),
    ).toBeVisible();
    await ownerPage.getByRole("link", { name: /Primary QA workspace/ }).click();
    await ownerPage.getByRole("button", { name: /Shared E2E report/ }).click();
    await expect(ownerPage.getByLabel("Run / release title")).toHaveValue(
      "Shared E2E report",
    );

    await page.getByLabel("Run / release title").fill("Updated by invitee");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved version 3")).toBeVisible();
    await expect(
      ownerPage.getByRole("button", { name: /Updated by invitee/ }),
    ).toBeVisible();
    await expect(ownerPage.getByLabel("Run / release title")).toHaveValue(
      "Updated by invitee",
    );
    await expect(ownerPage.getByText("Saved version 3")).toBeVisible();
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(ownerPage.getByRole("status")).toContainText(
      "The report and its private source file were deleted.",
    );
    await expect(
      ownerPage.getByText("No shared reports have been uploaded."),
    ).toBeVisible();
  } finally {
    await ownerContext.close();
  }

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Primary QA workspace/ }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Primary QA workspace", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page.getByRole("heading", { name: "Sign in to ReleaseProof" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "a password reset link will be sent",
  );

  let resetLink: string | null = null;
  await expect
    .poll(
      async () => {
        resetLink = await findAuthEmailLink(request, email, "recovery");
        return resetLink;
      },
      { message: "password reset email should arrive in local Mailpit" },
    )
    .not.toBeNull();
  if (!resetLink) {
    throw new Error("Reset email did not contain a verification link.");
  }

  await page.goto(resetLink);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "New password" })
    .fill(updatedPassword);
  await page.getByLabel("Confirm password").fill(updatedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your password has been updated.",
  );

  await page.getByRole("link", { name: "Return to sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(updatedPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/#/account");
  await expect(
    page.getByRole("heading", { name: "Sign in to ReleaseProof" }),
  ).toBeVisible();
  await page.goto("/#/workspace/99999999-9999-4999-8999-999999999999");
  await expect(
    page.getByRole("heading", { name: "Sign in to ReleaseProof" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your workspaces" }),
  ).not.toBeVisible();
});
