import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Hls from "hls.js";

const mocks = vi.hoisted(() => ({
  fetchUserVideoNote: vi.fn(),
  fetchVideoDetail: vi.fn(),
  reloadAfterSessionExpiry: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../../api/auth/useAuth.js", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../api/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../components/ReferralNoticeModal.jsx", () => ({ default: () => null }));
vi.mock("../../api/learning_by_video/videos.js", () => ({
  fetchVideoDetail: mocks.fetchVideoDetail,
}));
vi.mock("../../api/learning_by_video/video_notes.js", () => ({
  fetchUserVideoNote: mocks.fetchUserVideoNote,
  saveUserVideoNote: vi.fn(),
}));
vi.mock("../../hooks/useBodyScrollLock", () => ({ default: vi.fn() }));
vi.mock("./components/SubtitlePanel.jsx", () => ({
  default: () => <div data-testid="subtitle-panel">subtitles</div>,
}));
vi.mock("./components/LexiconPanel.jsx", () => ({ default: () => null }));
vi.mock("./components/ExercisePanel.jsx", () => ({ default: () => null }));
vi.mock("./components/VideoNotePanel.jsx", () => ({ default: () => null }));
vi.mock("./components/SpeakingPracticeModal.jsx", () => ({ default: () => null }));
vi.mock("../../components/examPreparation/DictionaryLookupOverlay.jsx", () => ({
  default: ({ collectionKey }) => <div data-testid="dictionary-overlay" data-collection-key={collectionKey} />,
}));

import VideoStudyPage from "./VideoStudyPage.jsx";
import AppLayout from "../../layouts/AppLayout.jsx";

function renderPage({ withLayout = false } = {}) {
  const videoRoute = { path: "/videos/:videoId", element: <VideoStudyPage /> };
  const router = createMemoryRouter(
    withLayout ? [{ element: <AppLayout />, children: [videoRoute] }] : [videoRoute],
    { initialEntries: ["/videos/7"] },
  );
  return { ...render(<RouterProvider router={router} />), router };
}

describe("VideoStudyPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mocks.fetchUserVideoNote.mockResolvedValue({ note_markdown: "" });
    mocks.fetchVideoDetail.mockResolvedValue({
      id: 7,
      title: "Test video",
      season_number: 1,
      video_url: "",
    });
    mocks.useAuth.mockReturnValue({
      user: { id: 1 },
      isAuthenticated: true,
      deviceSessionExpired: false,
      reloadAfterSessionExpiry: mocks.reloadAfterSessionExpiry,
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the explicit login-expired state and stops rendering subtitle requests", async () => {
    mocks.useAuth.mockReturnValue({
      user: { id: 1 },
      deviceSessionExpired: true,
      reloadAfterSessionExpiry: mocks.reloadAfterSessionExpiry,
    });

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "登录状态已过期，请重新登录后继续观看",
    );
    expect(screen.queryByTestId("subtitle-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(mocks.fetchVideoDetail).not.toHaveBeenCalled();
    expect(mocks.fetchUserVideoNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "重新登录" }));
    expect(mocks.reloadAfterSessionExpiry).toHaveBeenCalledOnce();
  });

  it("keeps real video metadata errors distinct while the session is active", async () => {
    mocks.fetchVideoDetail.mockRejectedValue(new Error("metadata unavailable"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load video: metadata unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByText("登录状态已过期，请重新登录后继续观看")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("mounts one dictionary overlay with the current video collection", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("dictionary-overlay")).toHaveAttribute("data-collection-key", "video:7"));
    expect(screen.getAllByTestId("dictionary-overlay")).toHaveLength(1);
  });

  it("removes and restores lookup without leaving the current video", async () => {
    renderPage({ withLayout: true });
    await screen.findByTestId("dictionary-overlay");
    const toggle = screen.getByRole("switch", { name: "词典" });
    fireEvent.click(toggle);
    expect(screen.queryByTestId("dictionary-overlay")).not.toBeInTheDocument();
    expect(screen.getByTestId("subtitle-panel")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId("dictionary-overlay")).toHaveAttribute("data-collection-key", "video:7");
  });

  it("shows indeterminate loading until the video is ready and during buffering", async () => {
    mocks.fetchVideoDetail.mockResolvedValue({ title: "Test video", video_url: "/video-7.mp4" });
    const { container } = renderPage();

    const progress = await screen.findByRole("progressbar", { name: "视频加载进度" });
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("status")).toHaveTextContent("视频加载中…");
    const video = container.querySelector("video");

    fireEvent.loadedData(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.waiting(video);
    expect(screen.getByRole("status")).toHaveTextContent("视频加载中…");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.canPlay(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    vi.spyOn(video, "paused", "get").mockReturnValue(false);
    fireEvent.stalled(video);
    expect(screen.getByRole("status")).toHaveTextContent("视频加载中…");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.playing(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("resets readiness and playback errors when the media URL changes", async () => {
    mocks.fetchVideoDetail.mockImplementation(async (id) => ({ title: `Video ${id}`, video_url: `/video-${id}.mp4` }));
    const { container, router } = renderPage();

    await screen.findByRole("progressbar");
    const firstVideo = container.querySelector("video");
    fireEvent.canPlay(firstVideo);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    await act(() => router.navigate("/videos/8"));
    const secondVideo = container.querySelector("video");
    expect(secondVideo).toHaveAttribute("src", "/video-8.mp4");
    expect(firstVideo).not.toHaveAttribute("src");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.error(secondVideo);
    expect(screen.getByRole("alert")).toHaveTextContent("视频播放失败，请刷新页面后重试。");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    await act(() => router.navigate("/videos/7"));
    expect(container.querySelector("video")).toHaveAttribute("src", "/video-7.mp4");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("stops loading and disposes hls.js after a fatal playback error", async () => {
    vi.spyOn(Hls, "isSupported").mockReturnValue(true);
    vi.spyOn(Hls.prototype, "loadSource").mockImplementation(() => {});
    vi.spyOn(Hls.prototype, "attachMedia").mockImplementation(() => {});
    const listeners = vi.spyOn(Hls.prototype, "on");
    const destroy = vi.spyOn(Hls.prototype, "destroy");
    mocks.fetchVideoDetail.mockResolvedValue({ title: "Test video", video_url: "/video-7.m3u8" });
    renderPage();

    await screen.findByRole("progressbar");
    const [, onHlsError] = listeners.mock.calls.findLast(([event]) => event === Hls.Events.ERROR);
    act(() => onHlsError(Hls.Events.ERROR, { fatal: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("视频播放失败，请刷新页面后重试。");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
