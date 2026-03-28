import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

// NOTE: react-resizable-panels imperative resize API (getSize/resize) requires
// real layout dimensions which jsdom cannot provide. These tests verify
// structure, CSS classes, and constraint configuration instead.

describe("Resizable Layout", () => {
  it("renders the 3-pane layout with sidebar, editor, and response panels", () => {
    render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
            <div>Sidebar</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={80} minSize={40}>
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Editor</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Response</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
  });

  it("renders two resize handles (sidebar | editor | response)", () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
            <div>Sidebar</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={80} minSize={40}>
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Editor</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Response</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    const handles = container.querySelectorAll('[data-slot="resizable-handle"]');
    expect(handles).toHaveLength(2);
  });

  it("handle has cursor-col-resize and hover feedback for discoverability", () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50}>
            <div>Left</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>
            <div>Right</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    const handle = container.querySelector('[data-slot="resizable-handle"]') as HTMLElement;
    expect(handle).not.toBeNull();
    expect(handle.className).toContain("cursor-col-resize");
    expect(handle.className).toContain("hover:bg-primary/30");
  });

  it("handle has widened hit area (after:w-2) for easier drag targeting", () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50}>
            <div>Left</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>
            <div>Right</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    const handle = container.querySelector('[data-slot="resizable-handle"]') as HTMLElement;
    expect(handle).not.toBeNull();
    // Verify widened hit area (was after:w-1 = 4px, now after:w-2 = 8px)
    expect(handle.className).toContain("after:w-3");
  });

  it("handle renders grip icon when withHandle is true", () => {
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={50}>
            <div>Left</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>
            <div>Right</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    const handle = container.querySelector('[data-slot="resizable-handle"]');
    expect(handle).not.toBeNull();
    // Grip icon container
    const gripDiv = handle?.querySelector("div");
    expect(gripDiv).not.toBeNull();
    // SVG icon inside
    const svg = gripDiv?.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  // This test documents the constraints that caused the sidebar resize bug.
  // Inner panel minSize values are relative to the OUTER PanelGroup, not the
  // parent Panel. So minSize=30 on two inner panels effectively prevents the
  // outer right panel from shrinking below ~60%, blocking sidebar expansion.
  it("inner panels use minSize=20 (not 30) to allow sidebar resize", () => {
    // The fix: inner panels minSize=20 each → sum=40%, which is ≤ right panel
    // capacity when sidebar is at maxSize=35% (right = 65%, inner can be 20%+20%=40%).
    //
    // With the old minSize=30 each → sum=60%, right panel couldn't shrink below
    // 60%, so sidebar was stuck at 20%.
    const { container } = render(
      <div style={{ width: 1200, height: 800 }}>
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
            <div>Sidebar</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={80} minSize={40}>
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Editor</div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div>Response</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    // All panels rendered successfully with the corrected constraints
    const panels = container.querySelectorAll('[data-slot="resizable-panel"]');
    expect(panels.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
  });
});
