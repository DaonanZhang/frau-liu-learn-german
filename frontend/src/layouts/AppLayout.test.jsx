import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), fetchUnreadReferralNotices: vi.fn(), acknowledgeReferralNotice: vi.fn(), navigate: vi.fn() }));
vi.mock("../api/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../api/referrals.js", () => ({ fetchUnreadReferralNotices: mocks.fetchUnreadReferralNotices, acknowledgeReferralNotice: mocks.acknowledgeReferralNotice }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("../components/Navigator", () => ({ default: () => <nav>Navigator</nav> }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer>Footer</footer> }));

import AppLayout from "./AppLayout.jsx";

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.fetchUnreadReferralNotices.mockReset().mockResolvedValue([]);
  mocks.acknowledgeReferralNotice.mockReset();
});

function renderLayout(path = "/home") {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout />}><Route path="*" element={<div>Outlet content</div>} /></Route></Routes></MemoryRouter>);
}

describe("AppLayout referral notice integration", () => {
  it("loads notices on the next authenticated layout load without blocking page content", async () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mocks.fetchUnreadReferralNotices.mockResolvedValue([{ id: 1, event_type: "referral_refunded", payload: {}, is_global_notice: true, acknowledged_at: null }]);
    renderLayout();
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
    expect(screen.getByText("Navigator")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.acknowledgeReferralNotice).not.toHaveBeenCalled();
  });

  it("keeps the outlet visible when notice loading fails and can retry", async () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    mocks.fetchUnreadReferralNotices.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    renderLayout();
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));
    await waitFor(() => expect(mocks.fetchUnreadReferralNotices).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Outlet content")).toBeInTheDocument();
  });

  it("does not fetch while loading or unauthenticated and preserves redirect behavior", async () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: false, loading: true });
    const { rerender } = renderLayout("/private?tab=one");
    expect(screen.queryByText("Outlet content")).not.toBeInTheDocument();
    expect(mocks.fetchUnreadReferralNotices).not.toHaveBeenCalled();
    mocks.useAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    rerender(<MemoryRouter initialEntries={["/private?tab=one"]}><Routes><Route element={<AppLayout />}><Route path="*" element={<div>Outlet content</div>} /></Route></Routes></MemoryRouter>);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/login", expect.objectContaining({ replace: true, state: { returnTo: "/private?tab=one" } })));
    expect(mocks.fetchUnreadReferralNotices).not.toHaveBeenCalled();
  });
});
