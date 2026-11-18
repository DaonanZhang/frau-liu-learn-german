import React from "react";
import { ArrowLeftIcon, CollapseIcon, LockIcon } from "./Icons";
import "./Sidebar.css";

/**
 * @param {{
 *  isCollapsed: boolean,
 *  isLoading: boolean,
 *  videos: {id: number|string, name: string, isLocked?: boolean}[],
 *  videoGroups?: {key: string, label: string, videos: {id: number|string, name: string, isLocked?: boolean}[]}[],
 *  activeModuleKey?: string|null,
 *  moduleChoices?: {key: string, label: string, description?: string, videoCount?: number, lockedCount?: number}[],
 *  selectedVideoId: number|string|null,
 *  onSelectVideo: (video: {id: number|string, name: string, isLocked?: boolean}) => void,
 *  onSelectModule?: (moduleKey: string) => void,
 *  onBackToModules?: () => void,
 *  onToggleCollapsed: () => void,
 *  onGoHome: () => void
 * }} props - Sidebar props.
 * @returns {JSX.Element}
 */
export default function Sidebar({
	source = "video",
	examType = null,
	examLevel = null,
	onSelectExam,
	isCollapsed,
	isLoading,
	videos,
	videoGroups = [],
	activeModuleKey = null,
	moduleChoices = [],
	selectedVideoId,
	onSelectVideo,
	onSelectModule,
	onBackToModules,
	onToggleCollapsed,
	onGoHome,
}) {
	const activeGroup = videoGroups.find((group) => group.key === activeModuleKey) || null;

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
						<div className="lp-sidebarTitle">{source === "exam" ? "考试目录" : "视频库"}</div>
						<div className="lp-sidebarHint">
							{source === "exam" ? "TELC · B1 / B2 / C1" : isLoading
								? "加载中…"
								: activeGroup
									? activeGroup.videos.length > 0
										? `${activeGroup.videos.length} 个视频`
										: "暂无数据"
									: moduleChoices.length > 0
										? `${moduleChoices.length} 个模块`
										: "暂无数据"}
						</div>
					</div>

					<div className="lp-videoList" role="list">
                        <button
                          type="button"
                          className={["lp-videoItem", (source === "exam" ? !examType : !activeModuleKey) ? "is-active" : ""].filter(Boolean).join(" ")}
                          onClick={() => source === "exam" ? onSelectExam(null) : onBackToModules()}
                        >
                          {source === "exam" ? "全部考试词汇" : "全部视频词汇"}
                        </button>
                        {source === "exam" ? (
                          <>
                            {examType ? <button type="button" className="lp-moduleBackBtn" onClick={() => onSelectExam(null)}>返回考试类型</button> : null}
                            <button type="button" className={`lp-moduleItem ${examType && !examLevel ? "is-active" : ""}`} onClick={() => onSelectExam("TELC")}>TELC</button>
                            {examType ? ["B1", "B2", "C1"].map((level) => (
                              <button type="button" key={level} className={`lp-videoItem ${examLevel === level ? "is-active" : ""}`} onClick={() => onSelectExam("TELC", level)}>{level}</button>
                            )) : null}
                          </>
                        ) : <>

						{activeGroup ? (
							<>
								<button
									type="button"
									className="lp-moduleBackBtn"
									onClick={onBackToModules}
								>
									<ArrowLeftIcon />
									<span>返回模块</span>
								</button>

								<section className="lp-videoGroup" aria-label={activeGroup.label}>
									<button type="button" className={`lp-videoItem ${!selectedVideoId ? "is-active" : ""}`} onClick={() => onSelectModule(activeGroup.key)}>{activeGroup.label}</button>
									<div className="lp-videoGroupItems">
										{activeGroup.videos.map((video) => {
											const isActive = video.id === selectedVideoId;
											const isLocked = Boolean(video.isLocked);

											return (
												<button
													key={String(video.id)}
													type="button"
													className={[
														"lp-videoItem",
														isActive ? "is-active" : "",
														isLocked ? "is-locked" : "",
													].filter(Boolean).join(" ")}
													onClick={() => {
														onSelectVideo(video);
													}}
													role="listitem"
												>
													<span className="lp-videoItemText">{video.name}</span>
													{isLocked ? (
														<span className="lp-videoItemLock" aria-label="未解锁">
															<LockIcon />
														</span>
													) : null}
												</button>
											);
										})}
									</div>
								</section>
							</>
						) : moduleChoices.length > 0 ? (
							moduleChoices.map((moduleChoice) => (
								<button
									key={moduleChoice.key}
									type="button"
									className="lp-moduleItem"
									onClick={() => {
										if (onSelectModule) {
											onSelectModule(moduleChoice.key);
										}
									}}
									role="listitem"
								>
									<span className="lp-moduleItemTitle">{moduleChoice.label}</span>
									<span className="lp-moduleItemMeta">
										{`${Number(moduleChoice.videoCount || 0)} 个视频`}
										{Number(moduleChoice.lockedCount || 0) > 0
											? ` · ${Number(moduleChoice.lockedCount || 0)} 个未解锁`
											: ""}
									</span>
									{moduleChoice.description ? (
										<span className="lp-moduleItemDesc">{moduleChoice.description}</span>
									) : null}
								</button>
							))
						) : (
							videos.map((video) => {
								const isActive = video.id === selectedVideoId;

								return (
									<button
										key={String(video.id)}
										type="button"
										className={["lp-videoItem", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
										onClick={() => {
											onSelectVideo(video);
										}}
										role="listitem"
									>
										<span className="lp-videoItemText">{video.name}</span>
									</button>
								);
							})
						)}
              </>}
					</div>
				</div>
			) : null}
		</aside>
	);
}
