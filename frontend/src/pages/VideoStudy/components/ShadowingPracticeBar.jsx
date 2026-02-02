import { useEffect, useMemo, useRef, useState } from "react";
import {
	buildRecordingKey,
	loadRecordingBlob,
	saveRecordingBlob,
} from "../../../api/learning_by_video/shadowingStorage.js";
import "./ShadowingPractice.css";

/**
 * @typedef {Object} SubtitleTimeRange
 * @property {number} start - Start time in seconds.
 * @property {number} end - End time in seconds.
 */

/**
 * Shadowing practice toolbar for a single subtitle.
 *
 * @param {Object} props - Component props.
 * @param {React.RefObject<HTMLVideoElement|null>} props.videoRef - Ref to the video element.
 * @param {string|number} props.videoId - Video identifier for recording storage namespace.
 * @param {string|number} props.subtitleId - Subtitle identifier for recording storage namespace.
 * @param {SubtitleTimeRange} props.timeRange - Subtitle start/end.
 * @returns {JSX.Element} Component.
 */
export function ShadowingPracticeBar({ videoRef, videoId, subtitleId, timeRange }) {
	const recordingKey = useMemo(() => {
		return buildRecordingKey(videoId, subtitleId);
	}, [videoId, subtitleId]);

	const [isSegmentPlaying, setIsSegmentPlaying] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [hasRecording, setHasRecording] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	/** @type {React.MutableRefObject<MediaRecorder|null>} */
	const mediaRecorderRef = useRef(null);

	/** @type {React.MutableRefObject<Blob[]>} */
	const audioChunksRef = useRef([]);

	/** @type {React.MutableRefObject<string|null>} */
	const objectUrlRef = useRef(null);

	useEffect(() => {
		let isMounted = true;

		async function checkExistingRecording() {
			try {
				const existingBlob = await loadRecordingBlob(recordingKey);
				if (isMounted) {
					setHasRecording(Boolean(existingBlob));
				}
			} catch (_error) {
				if (isMounted) {
					setHasRecording(false);
				}
			}
		}

		checkExistingRecording();

		return () => {
			isMounted = false;

			if (objectUrlRef.current) {
				URL.revokeObjectURL(objectUrlRef.current);
				objectUrlRef.current = null;
			}
		};
	}, [recordingKey]);

	/**
	 * Stop currently active shadowing segment playback, if any.
	 *
	 * The controller is stored on the video element to avoid global state.
	 *
	 * @param {HTMLVideoElement} videoElement - Target video element.
	 * @returns {void}
	 */
	function stopActiveShadowingSegment(videoElement) {
		if (!videoElement) {
			return;
		}

		const controller = videoElement._shadowingSegmentController;
		if (!controller) {
			return;
		}

		if (typeof controller.stop === "function") {
			controller.stop();
		}

		videoElement._shadowingSegmentController = null;
	}

	/**
	 * Register a new shadowing controller on the video element.
	 *
	 * @param {HTMLVideoElement} videoElement - Target video element.
	 * @param {Function} stop - Stop callback.
	 * @param {string} token - Playback token.
	 * @returns {void}
	 */
	function registerShadowingController(videoElement, stop, token) {
		if (!videoElement) {
			return;
		}

		videoElement._shadowingSegmentController = { stop, token };
	}

	/**
	 * Read current shadowing token from the video element.
	 *
	 * @param {HTMLVideoElement} videoElement - Target video element.
	 * @returns {string} Token string (or empty string).
	 */
	function getCurrentShadowingToken(videoElement) {
		if (!videoElement) {
			return "";
		}

		const controller = videoElement._shadowingSegmentController;
		if (!controller || !controller.token) {
			return "";
		}

		return String(controller.token);
	}

	/**
	 * Play the subtitle segment exactly once.
	 *
	 * Fixes:
	 * - Wait for `seeked` before starting play (prevents immediate pause due to stale currentTime).
	 * - Supports interruption: clicking other subtitles stops the active segment immediately.
	 *
	 * @returns {void}
	 */
	function handlePlaySegmentOnce() {
		setErrorMessage("");

		const videoElement = videoRef?.current;
		if (!videoElement) {
			setErrorMessage("Video element not available.");
			return;
		}

		const startTime = Number(timeRange.start || 0);
		const endTime = Number(timeRange.end || 0);

		if (!(endTime > startTime)) {
			setErrorMessage("Invalid subtitle time range.");
			return;
		}

		// Stop any previous segment playback immediately.
		stopActiveShadowingSegment(videoElement);

		let hasStopped = false;
		const playbackToken = `${Date.now()}-${Math.random()}`;

		setIsSegmentPlaying(true);

		const stop = () => {
			if (hasStopped) {
				return;
			}
			hasStopped = true;

			try {
				videoElement.removeEventListener("timeupdate", onTimeUpdate);
				videoElement.removeEventListener("seeked", onSeeked);
			} catch (_error) {
				// ignore
			}

			setIsSegmentPlaying(false);
		};

		const onTimeUpdate = () => {
			if (hasStopped) {
				return;
			}

			const tokenOnVideo = getCurrentShadowingToken(videoElement);
			if (tokenOnVideo !== playbackToken) {
				stop();
				return;
			}

			if (videoElement.currentTime >= endTime) {
				videoElement.pause();
				stop();
			}
		};

		const onSeeked = () => {
			if (hasStopped) {
				return;
			}

			const tokenOnVideo = getCurrentShadowingToken(videoElement);
			if (tokenOnVideo !== playbackToken) {
				stop();
				return;
			}

			videoElement.addEventListener("timeupdate", onTimeUpdate);

			const playPromise = videoElement.play();
			if (playPromise && typeof playPromise.then === "function") {
				playPromise.catch(() => {
					stop();
					setErrorMessage("Playback blocked by browser (user gesture required).");
				});
			}
		};

		registerShadowingController(videoElement, stop, playbackToken);

		// Important: attach seeked listener BEFORE setting currentTime
		videoElement.addEventListener("seeked", onSeeked);

		// Seek first, then play after seeked.
		videoElement.currentTime = startTime;
	}

	/**
	 * Start audio recording via MediaRecorder.
	 *
	 * @returns {Promise<void>} Resolves when recording starts.
	 */
	async function startRecording() {
		setErrorMessage("");

		if (isRecording) {
			return;
		}

		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			setErrorMessage("Microphone API not supported in this browser.");
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;
			audioChunksRef.current = [];

			mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			mediaRecorder.onstop = async () => {
				try {
					const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
					await saveRecordingBlob(recordingKey, audioBlob);
					setHasRecording(true);
				} catch (_error) {
					setErrorMessage("Failed to save recording.");
				} finally {
					setIsRecording(false);
					stream.getTracks().forEach((track) => {
						track.stop();
					});
				}
			};

			mediaRecorder.start();
			setIsRecording(true);
		} catch (_error) {
			setErrorMessage("Microphone permission denied or unavailable.");
		}
	}

	/**
	 * Stop the current recording.
	 *
	 * @returns {void}
	 */
	function stopRecording() {
		if (!isRecording) {
			return;
		}

		const mediaRecorder = mediaRecorderRef.current;
		if (mediaRecorder && mediaRecorder.state !== "inactive") {
			mediaRecorder.stop();
		}
	}

	/**
	 * Play the stored recording for this subtitle.
	 *
	 * @returns {Promise<void>} Resolves after playback is started.
	 */
	async function playRecording() {
		setErrorMessage("");

		try {
			const audioBlob = await loadRecordingBlob(recordingKey);

			if (!audioBlob) {
				setHasRecording(false);
				setErrorMessage("No recording found for this subtitle.");
				return;
			}

			if (objectUrlRef.current) {
				URL.revokeObjectURL(objectUrlRef.current);
				objectUrlRef.current = null;
			}

			const objectUrl = URL.createObjectURL(audioBlob);
			objectUrlRef.current = objectUrl;

			const audio = new Audio(objectUrl);
			await audio.play();
		} catch (_error) {
			setErrorMessage("Failed to play recording.");
		}
	}

	return (
		<div
			className="shadowing-practice-bar"
			onClick={(event) => {
				event.stopPropagation();
			}}
		>
			<div className="shadowing-practice-buttons">
				<button
					type="button"
					className="shadowing-btn shadowing-btn-primary"
					aria-label="Play subtitle segment once"
					onClick={handlePlaySegmentOnce}
					disabled={isSegmentPlaying || isRecording}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M8 5v14l11-7z" />
					</svg>
				</button>

				{!isRecording ? (
					<button
						type="button"
						className="shadowing-btn shadowing-btn-danger"
						aria-label="Start recording"
						onClick={() => {
							startRecording();
						}}
						disabled={isSegmentPlaying}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
							<path d="M19 11a7 7 0 0 1-14 0" />
							<path d="M12 18v4" />
							<path d="M8 22h8" />
						</svg>
					</button>
				) : (
					<button
						type="button"
						className="shadowing-btn shadowing-btn-danger"
						aria-label="Stop recording"
						onClick={stopRecording}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<rect x="7" y="7" width="10" height="10" rx="2" />
						</svg>
					</button>
				)}

				<button
				  type="button"
				  className={[
					"shadowing-btn",
					hasRecording ? "shadowing-btn-success" : "shadowing-btn-secondary",
				  ].join(" ")}
				  aria-label="Play recording"
				  onClick={() => {
					playRecording();
				  }}
				  disabled={!hasRecording || isRecording}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M11 5 6 9H2v6h4l5 4V5Z" />
						<path d="M15.5 8.5a5 5 0 0 1 0 7" />
						<path d="M18 6a8.5 8.5 0 0 1 0 12" />
					</svg>
				</button>
			</div>

			{errorMessage ? (
				<div className="shadowing-practice-error" role="alert">
					{errorMessage}
				</div>
			) : null}
		</div>
	);
}
