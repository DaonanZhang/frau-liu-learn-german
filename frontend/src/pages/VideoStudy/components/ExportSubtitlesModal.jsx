import { useMemo, useState } from "react";
import { exportSubtitlesToWord } from "../../../api/learning_by_video/exportSubtitlesToWord.js";
import "./ExportSubtitlesModal.css";

/**
 * ExportSubtitlesModal
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.isOpen - Whether modal is open.
 * @param {string} props.videoTitle - Video title.
 * @param {Array<{timeLabel: string, de: string, zh: string}>} props.items - Subtitle items.
 * @param {() => void} props.onClose - Close handler.
 * @returns {JSX.Element|null} Modal.
 */
export default function ExportSubtitlesModal({
	isOpen,
	videoTitle,
	items,
	onClose,
}) {
	const [exportMode, setExportMode] = useState("bilingual");
	const [isExporting, setIsExporting] = useState(false);

	const modalTitle = useMemo(() => {
		const safeTitle = String(videoTitle || "").trim() || "视频";
		return `${safeTitle} - 字幕导出`;
	}, [videoTitle]);

	const previewItems = useMemo(() => {
		const list = Array.isArray(items) ? items : [];
		return list;
	}, [items]);

	if (!isOpen) {
		return null;
	}

	const showGerman = exportMode === "bilingual" || exportMode === "de";
	const showChinese = exportMode === "bilingual" || exportMode === "zh";

	return (
		<div
			className="exp-modalOverlay"
			role="dialog"
			aria-modal="true"
			aria-label={modalTitle}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					onClose();
				}
			}}
		>
			<div className="exp-modal">
				<div className="exp-modalHeader">
					<div className="exp-modalTitle">{modalTitle}</div>

					<button
						type="button"
						className="exp-closeBtn"
						onClick={() => {
							onClose();
						}}
					>
						关闭
					</button>
				</div>

				<div className="exp-modeRow">
					<button
						type="button"
						className={[
							"exp-modeBtn",
							exportMode === "bilingual" ? "is-active" : "",
						].filter(Boolean).join(" ")}
						onClick={() => {
							setExportMode("bilingual");
						}}
					>
						双语
					</button>

					<button
						type="button"
						className={[
							"exp-modeBtn",
							exportMode === "de" ? "is-active" : "",
						].filter(Boolean).join(" ")}
						onClick={() => {
							setExportMode("de");
						}}
					>
						仅德语
					</button>

					<button
						type="button"
						className={[
							"exp-modeBtn",
							exportMode === "zh" ? "is-active" : "",
						].filter(Boolean).join(" ")}
						onClick={() => {
							setExportMode("zh");
						}}
					>
						仅中文
					</button>
				</div>

				<div className="exp-previewCard">
					<div className="exp-previewTitle">{String(videoTitle || "").trim() || "学习笔记"}</div>

					<div className="exp-previewList">
						{previewItems.map((subtitleItem) => {
							return (
								<div key={subtitleItem.id} className="exp-previewItem">
									<div className="exp-time">{subtitleItem.timeLabel}</div>

									{showGerman && subtitleItem.de ? (
										<div className="exp-line">{subtitleItem.de}</div>
									) : null}

									{showChinese && subtitleItem.zh ? (
										<div className="exp-line exp-lineSecondary">{subtitleItem.zh}</div>
									) : null}
								</div>
							);
						})}
					</div>
				</div>

				<div className="exp-modalFooter">
					<button
						type="button"
						className="exp-cancelBtn"
						onClick={() => {
							onClose();
						}}
						disabled={isExporting}
					>
						取消
					</button>

					<button
						type="button"
						className="exp-exportBtn"
						onClick={async () => {
							if (isExporting) {
								return;
							}

							setIsExporting(true);
							try {
								await exportSubtitlesToWord({
									videoTitle,
									items: previewItems,
									exportMode,
								});
								onClose();
							} finally {
								setIsExporting(false);
							}
						}}
					>
						{isExporting ? "导出中…" : "导出Word"}
					</button>
				</div>
			</div>
		</div>
	);
}
