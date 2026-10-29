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
      screen.getByText(/application does not upload it/i),
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
      screen.getByRole("dialog", { name: "Your report stays in this browser" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/may receive ordinary web request metadata/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a guarantee of release safety/i),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
