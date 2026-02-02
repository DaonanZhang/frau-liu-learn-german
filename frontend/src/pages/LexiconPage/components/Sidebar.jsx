import React from "react";
import { ArrowLeftIcon, CollapseIcon } from "./Icons";
import "./Sidebar.css";

/**
 * @param {{
 *  isCollapsed: boolean,
 *  isLoading: boolean,
 *  videos: {id: number|string, name: string}[],
 *  selectedVideoId: number|string|null,
 *  onSelectVideo: (videoId: number|string) => void,
 *  onToggleCollapsed: () => void,
 *  onGoHome: () => void
 * }} props - Sidebar props.
 * @returns {JSX.Element}
 */
export default function Sidebar({
	isCollapsed,
	isLoading,
	videos,
	selectedVideoId,
	onSelectVideo,
	onToggleCollapsed,
	onGoHome,
}) {
	return (
		<aside className={["lp-sidebar", isCollapsed ? "is-collapsed" : ""].filter(Boolean).join(" ")}>
			<div className="lp-sidebarTop">
				<button className="lp-topBtn" type="button" onClick={onGoHome}>
					<ArrowLeftIcon />
					<span className="lp-topBtnText">返回</span>
				</button>

				<button className="lp-topBtn" type="button" onClick={onToggleCollapsed} aria-expanded={!isCollapsed}>
					<CollapseIcon isCollapsed={isCollapsed} />
					<span className="lp-topBtnText">{isCollapsed ? "展开" : "收起"}</span>
				</button>
			</div>

			{!isCollapsed ? (
				<div className="lp-sidebarBody">
					<div className="lp-sidebarHeader">
						<div className="lp-sidebarTitle">视频库</div>
						<div className="lp-sidebarHint">
							{isLoading ? "加载中…" : videos.length > 0 ? `${videos.length} 个视频` : "暂无数据"}
						</div>
					</div>

					<div className="lp-videoList" role="list">
						{videos.map((video) => {
							const isActive = video.id === selectedVideoId;

							return (
								<button
									key={String(video.id)}
									type="button"
									className={["lp-videoItem", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
									onClick={() => {
										onSelectVideo(video.id);
									}}
									role="listitem"
								>
									<span className="lp-videoItemText">{video.name}</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</aside>
	);
}
