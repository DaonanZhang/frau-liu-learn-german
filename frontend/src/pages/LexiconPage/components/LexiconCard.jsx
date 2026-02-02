import React, { useMemo } from "react";
import { EyeIcon } from "./Icons";
import "./LexiconCard.css";

/**
 * Convert POS code to a short UI label.
 *
 * @param {unknown} posValue - POS value from API or entry object.
 * @returns {string} POS label to show in UI.
 */
function posToLabel(posValue) {
	const normalized = String(posValue ?? "").trim().toUpperCase();

	if (normalized === "NOUN") {
		return "n.";
	} else if (normalized === "VERB") {
		return "v.";
	} else if (normalized === "ADJ") {
		return "adj.";
	} else if (normalized === "ADV") {
		return "adv.";
	} else if (normalized === "PRON") {
		return "pron.";
	} else if (normalized === "PREP") {
		return "prep.";
	} else if (normalized === "CONJ") {
		return "conj.";
	} else if (normalized === "DET") {
		return "det.";
	} else if (normalized === "PART") {
		return "part.";
	} else if (normalized === "INTJ") {
		return "intj.";
	}

	return normalized ? normalized.toLowerCase() : "";
}

/**
 * Normalize article value and convert it into a UI label.
 *
 * Supported examples:
 * - "der" | "die" | "das" -> keep as-is
 * - "plural" -> "Pl."
 * - "" / null / undefined -> ""
 *
 * @param {unknown} articleValue - Article value from entry (e.g. "der", "plural", "").
 * @returns {string} Label to show in UI.
 */
function articleToLabel(articleValue) {
	const normalized = String(articleValue ?? "").trim().toLowerCase();

	if (!normalized) {
		return "";
	}

	if (normalized === "plural") {
		return "Pl.";
	}

	if (normalized === "der" || normalized === "die" || normalized === "das") {
		return normalized;
	}

	return normalized;
}

/**
 * LexiconCard
 *
 * @param {{
 *  entry: any,
 *  knowledgeState: "known"|"not_known"|"elsewhere"|"unmarked",
 *  isChineseHidden: boolean,
 *  subtitleContent: string,
 *  subtitleTranslation: string,
 *  onToggleKnown: (entry: any) => void,
 *  onToggleNotKnown: (entry: any) => void,
 *  onToggleChinese: () => void
 * }} props - Card props.
 * @returns {JSX.Element}
 */
export default function LexiconCard({
	entry,
	knowledgeState,
	isChineseHidden,
	subtitleContent,
	subtitleTranslation,
	onToggleKnown,
	onToggleNotKnown,
	onToggleChinese,
}) {
	const posLabel = useMemo(() => {
		return posToLabel(entry?.pos);
	}, [entry]);

	const articleLabel = useMemo(() => {
		return articleToLabel(entry?.article);
	}, [entry]);

	const showArticle = Boolean(articleLabel) && entry?.kind === "word";

	const isKnownActive = knowledgeState === "known";
	const isNotKnownActive = knowledgeState === "not_known";

	return (
		<article
			className={[
				"lp-card",
				knowledgeState === "known" ? "is-known" : "",
				knowledgeState === "not_known" ? "is-not-known" : "",
				knowledgeState === "elsewhere" ? "is-elsewhere" : "",
			]
				.filter(Boolean)
				.join(" ")}
			tabIndex={0}
		>
			<div className="lp-cardHeaderRow">
				<div className="lp-cardWord">
					{showArticle ? <span className="lp-articleBadge">{articleLabel}</span> : null}
					<span className="lp-wordText">{entry?.title || ""}</span>
				</div>

				<div className="lp-cardMarkActions" aria-label="Knowledge actions">
					<button
						type="button"
						className={[
							"lp-markBtn",
							"lp-markBtn--known",
							isKnownActive ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => {
							onToggleKnown(entry);
						}}
					>
						认识
					</button>

					<button
						type="button"
						className={[
							"lp-markBtn",
							"lp-markBtn--not-known",
							isNotKnownActive ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => {
							onToggleNotKnown(entry);
						}}
					>
						不认识
					</button>
				</div>
			</div>

			{!isChineseHidden && entry?.translation ? (
				<div className="lp-meaningRow">
					<span className="lp-meaningText">{entry.translation}</span>
					{posLabel ? <span className="lp-meaningPos">{posLabel}</span> : null}
				</div>
			) : null}

			{subtitleContent || subtitleTranslation ? (
				<div className="lp-exampleCard" role="group" aria-label="Subtitle example">
					{subtitleContent ? <div className="lp-exampleDe">{subtitleContent}</div> : null}
					{!isChineseHidden && subtitleTranslation ? (
						<div className="lp-exampleZh">{subtitleTranslation}</div>
					) : null}
				</div>
			) : null}

			<div className="lp-cardFooter">
				<div className="lp-footerSpacer" />
				<button
					type="button"
					className={["lp-eyeBtn", isChineseHidden ? "is-off" : "is-on"].filter(Boolean).join(" ")}
					aria-label={isChineseHidden ? "Show Chinese" : "Hide Chinese"}
					onClick={() => {
						onToggleChinese();
					}}
				>
					<EyeIcon isHidden={isChineseHidden} />
				</button>
			</div>
		</article>
	);
}
