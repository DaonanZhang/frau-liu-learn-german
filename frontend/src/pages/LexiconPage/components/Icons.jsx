import React from "react";

export function EyeIcon({ isHidden }) {
	if (isHidden) {
		return (
			<svg className="lp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				<path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
				<path
					d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.5 0 9.7 4.7 10.9 7-0.5 1-1.7 2.8-3.6 4.3"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				/>
				<path
					d="M6.2 6.2C3.9 7.8 2.4 10.1 1.1 12c1.2 2.2 5.4 7 10.9 7 1.6 0 3.1-.4 4.4-1"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				/>
			</svg>
		);
	}

	return (
		<svg className="lp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M1.1 12c1.2-2.2 5.4-7 10.9-7s9.7 4.7 10.9 7c-1.2 2.2-5.4 7-10.9 7S2.3 14.2 1.1 12Z"
				stroke="currentColor"
				strokeWidth="2"
			/>
			<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
		</svg>
	);
}

export function ArrowLeftIcon() {
	return (
		<svg className="lp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

export function CollapseIcon({ isCollapsed }) {
	if (isCollapsed) {
		return (
			<svg className="lp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}

	return (
		<svg className="lp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
