import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("application shell", () => {
  it("explains the product and local-first approach", () => {
    render(<App />);

    expect(
      screen.getByRole("link", { name: "ReleaseProof" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Turn Playwright results into a clear QA evidence report",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Local imports stay in this browser/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(
      screen.getByText(/How to export from Playwright/),
    ).toBeInTheDocument();
  });

  it("explains privacy limits and closes the dialog with Escape", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(
      screen.getByRole("dialog", {
        name: "Your report stays local unless you choose to upload it",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ordinary request metadata/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /workspace names, descriptions, member identities and roles are stored/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a guarantee of release safety/i),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
