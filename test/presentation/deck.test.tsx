import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PresentationPage from "@/app/presentation/page";
import { PPTX_PATH, SLIDES } from "@/app/presentation/slides";

/**
 * No criterion in ACCEPTANCE.md names the deck route, so these tests carry
 * no ID: they are a smoke test that the page the presentation is given from
 * renders, navigates, and offers the file the download button promises.
 * They are not evidence for any criterion.
 */
describe("/presentation renders the deck", () => {
  beforeEach(() => {
    // The hash is the deck's position; jsdom keeps it between tests.
    window.history.replaceState(null, "", "/presentation");
  });

  it("renders every slide as a labelled region, showing the first", () => {
    render(<PresentationPage />);
    const slides = screen.getAllByRole("region", { hidden: true });
    expect(slides).toHaveLength(SLIDES.length);
    expect(screen.getByRole("region", { name: /^Slide 1 of/ })).toBeVisible();
    expect(screen.getByText(`1 / ${SLIDES.length}`)).toBeInTheDocument();
  });

  it("advances with the keyboard and updates the counter", async () => {
    const user = userEvent.setup();
    render(<PresentationPage />);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("region", { name: /^Slide 2 of/ })).toBeVisible();
    expect(screen.getByText(`2 / ${SLIDES.length}`)).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText(`${SLIDES.length} / ${SLIDES.length}`)).toBeInTheDocument();
  });

  it("steps once per key press even when presses arrive faster than a re-render", async () => {
    const user = userEvent.setup();
    render(<PresentationPage />);
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(screen.getByText(`4 / ${SLIDES.length}`)).toBeInTheDocument();
  });

  it("offers the PowerPoint from the path the app serves it at", () => {
    render(<PresentationPage />);
    const link = screen.getByRole("link", { name: /download \.pptx/i });
    expect(link).toHaveAttribute("href", PPTX_PATH);
    expect(link).toHaveAttribute("download");
  });

  it("toggles the speaker notes for the current slide", async () => {
    const user = userEvent.setup();
    render(<PresentationPage />);
    expect(screen.queryByRole("note", { name: /speaker notes/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^notes$/i }));
    expect(screen.getByRole("note", { name: /speaker notes/i })).toHaveTextContent(SLIDES[0].notes);
  });

  it("keeps the deck's time budget inside the 15–20 minute brief", () => {
    const total = SLIDES.reduce((sum, s) => sum + s.minutes, 0);
    expect(total).toBeGreaterThanOrEqual(15);
    expect(total).toBeLessThanOrEqual(20);
  });
});
