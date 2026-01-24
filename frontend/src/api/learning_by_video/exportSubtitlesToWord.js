import {
	AlignmentType,
	Document,
	Packer,
	Paragraph,
	TextRun,
} from "docx";

/**
 * Convert a filename into a safe form.
 *
 * @param {string} filename - Original file name.
 * @returns {string} Sanitized file name.
 */
function sanitizeFilename(filename) {
	const rawValue = String(filename || "").trim();
	if (!rawValue) {
		return "subtitles";
	}

	return rawValue
		.replace(/[\\/:*?"<>|]/g, "_")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Trigger browser download for a blob.
 *
 * @param {Blob} blob - File content.
 * @param {string} filename - Download filename.
 * @returns {void}
 */
function triggerBlobDownload(blob, filename) {
	const objectUrl = URL.createObjectURL(blob);

	const linkElement = document.createElement("a");
	linkElement.href = objectUrl;
	linkElement.download = filename;

	document.body.appendChild(linkElement);
	linkElement.click();
	linkElement.remove();

	URL.revokeObjectURL(objectUrl);
}

/**
 * Build a Word document for subtitles.
 *
 * @param {Object} params - Parameters.
 * @param {string} params.title - Document title shown at the top.
 * @param {Array<{timeLabel: string, de: string, zh: string}>} params.items - Subtitle items.
 * @param {"bilingual"|"de"|"zh"} params.exportMode - Export mode.
 * @returns {Document} A docx Document.
 */
function buildSubtitlesDocx({ title, items, exportMode }) {
	const documentTitle = String(title || "").trim() || "字幕导出";

	const showGerman = exportMode === "bilingual" || exportMode === "de";
	const showChinese = exportMode === "bilingual" || exportMode === "zh";

	const children = [];

	children.push(
		new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 240 },
			children: [
				new TextRun({
					text: documentTitle,
					bold: true,
					size: 32,
				}),
			],
		})
	);

	items.forEach((subtitleItem) => {
		const timeLabel = String(subtitleItem.timeLabel || "").trim();
		const germanText = String(subtitleItem.de || "").trim();
		const chineseText = String(subtitleItem.zh || "").trim();

		// Time row
		if (timeLabel) {
			children.push(
				new Paragraph({
					spacing: { before: 160, after: 80 },
					children: [
						new TextRun({
							text: timeLabel,
							color: "6B7280",
							size: 22,
						}),
					],
				})
			);
		}

		// Content rows
		if (showGerman && germanText) {
			children.push(
				new Paragraph({
					spacing: { after: 60 },
					children: [
						new TextRun({
							text: germanText,
							size: 24,
						}),
					],
				})
			);
		}

		if (showChinese && chineseText) {
			children.push(
				new Paragraph({
					spacing: { after: 60 },
					children: [
						new TextRun({
							text: chineseText,
							size: 24,
						}),
					],
				})
			);
		}

		// Divider (empty line)
		children.push(
			new Paragraph({
				spacing: { after: 120 },
				children: [new TextRun({ text: "" })],
			})
		);
	});

	return new Document({
		sections: [
			{
				children,
			},
		],
	});
}

/**
 * Export subtitles to a Word (.docx) file and download in browser.
 *
 * @param {Object} params - Parameters.
 * @param {string} params.videoTitle - Video title.
 * @param {Array<{timeLabel: string, de: string, zh: string}>} params.items - Subtitle items.
 * @param {"bilingual"|"de"|"zh"} params.exportMode - Export mode.
 * @returns {Promise<void>} Resolves when download is triggered.
 */
export async function exportSubtitlesToWord({
	videoTitle,
	items,
	exportMode,
}) {
	const safeVideoTitle = sanitizeFilename(videoTitle || "视频");
	const fullTitle = `${safeVideoTitle} - 字幕导出`;

	const documentObject = buildSubtitlesDocx({
		title: fullTitle,
		items,
		exportMode,
	});

	const blob = await Packer.toBlob(documentObject);
	const filename = `${safeVideoTitle}-字幕导出.docx`;

	triggerBlobDownload(blob, filename);
}
