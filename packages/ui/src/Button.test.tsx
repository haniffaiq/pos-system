import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Card,
  Chip,
  IconTile,
  Input,
  LogoChip,
  Modal,
  Navbar,
  Select,
  Table,
  Toast,
} from "./index";

afterEach(cleanup);

describe("neo-brutalism UI components", () => {
  it("renders Button with variant fill, black border, hard shadow, and hover-lift classes", () => {
    render(<Button variant="primary">Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("border-2");
    expect(button.className).toContain("border-fg");
    expect(button.className).toContain("shadow-brutal");
    expect(button.className).toContain("hover:-translate-x-[2px]");
    expect(button.className).toContain("text-fg");
  });

  it("renders display primitives with black borders, hard shadows, and dark text", () => {
    render(
      <div>
        <Card hover>Card content</Card>
        <Badge tone="secondary">Paid</Badge>
        <Chip>Retail</Chip>
        <IconTile tone="accent">★</IconTile>
        <LogoChip initials="PS" />
        <Toast tone="primary" message="Saved" />
      </div>,
    );

    for (const label of ["Card content", "Paid", "Retail", "★", "PS", "Saved"]) {
      const element = screen.getByText(label);
      expect(element.className).toContain("border-2");
      expect(element.className).toContain("border-fg");
    }

    expect(screen.getByText("Card content").className).toContain("shadow-brutal");
    expect(screen.getByText("Paid").className).toContain("shadow-brutal-sm");
    expect(screen.getByText("★").className).toContain("shadow-brutal-sm");
    expect(screen.getByText("Saved").className).toContain("shadow-brutal");
    expect(screen.getByText("Paid").className).toContain("text-fg");
  });

  it("renders form, table, modal, and navbar components accessibly", () => {
    const close = vi.fn();

    render(
      <div>
        <Input label="Cashier" error="Required" />
        <Select label="Outlet" defaultValue="a">
          <option value="a">Main outlet</option>
        </Select>
        <Table head={<tr><th scope="col">SKU</th></tr>}>
          <tr><td>ABC-1</td></tr>
        </Table>
        <Modal open onClose={close} title="Confirm sale">
          <p>Proceed?</p>
        </Modal>
        <Navbar initials="PS" title="POS System" right={<Button variant="white">Logout</Button>} />
      </div>,
    );

    expect(screen.getByLabelText("Cashier").className).toContain("border-2");
    expect(screen.getByLabelText("Outlet").className).toContain("shadow-brutal-sm");
    expect(screen.getByText("ABC-1")).toBeTruthy();
    expect(screen.getByText("Confirm sale").className).toContain("font-black");
    expect(screen.getByRole("navigation").className).toContain("border-b-2");
    expect(screen.getByRole("button", { name: "Logout" }).className).toContain("bg-card");

    fireEvent.click(screen.getByText("Proceed?").parentElement?.parentElement as HTMLElement);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("adds dialog semantics, focuses modal content, traps tab, and closes on escape", () => {
    const close = vi.fn();

    render(
      <Modal open onClose={close} title="Edit outlet">
        <Button>First action</Button>
        <Button>Second action</Button>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit outlet" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First action" }));

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Second action" }));

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("announces toasts politely and exposes invalid form errors by description", () => {
    render(
      <div>
        <Toast message="Saved" />
        <Input label="Cashier" error="Required" />
        <Select label="Outlet" error="Choose one" defaultValue="">
          <option value="">Select outlet</option>
        </Select>
      </div>,
    );

    expect(screen.getByRole("status").textContent).toBe("Saved");

    const input = screen.getByLabelText("Cashier");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Required");

    const select = screen.getByLabelText("Outlet");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(select.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Choose one");
  });
});
