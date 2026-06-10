import React, { useEffect, useRef, useState } from 'react'
import './App.css'

const statusIcons = {
	default: { emoji: '😐', color: '#02c19c' },
	neutral: { emoji: '😐', color: '#54adad' },
	happy: { emoji: '😀', color: '#148f77' },
	sad: { emoji: '😥', color: '#767e7e' },
	angry: { emoji: '😠', color: '#b64518' },
	fearful: { emoji: '😨', color: '#90931d' },
	disgusted: { emoji: '🤢', color: '#1a8d1a' },
	surprised: { emoji: '😲', color: '#1230ce' },
}

function App() {
	const appRef = useRef(null)
	const videoRef = useRef(null)
	const canvasRef = useRef(null)
	const intervalRef = useRef(null)
	const streamRef = useRef(null)
	const [status, setStatus] = useState('loading models')
	const [emoji, setEmoji] = useState(statusIcons.default.emoji)

	useEffect(() => {
		let cancelled = false

		const updateStatus = (nextStatus) => {
			const info = statusIcons[nextStatus] || statusIcons.default
			setEmoji(info.emoji)
			setStatus(statusIcons[nextStatus] ? nextStatus : '...')
			if (appRef.current) {
				appRef.current.style.backgroundColor = info.color
			}
		}

		const updateError = (message) => {
			console.error(message)
			setEmoji('⚠️')
			setStatus(message)
		}

		const waitForFaceApi = () =>
			new Promise((resolve, reject) => {
				let tries = 0
				const timer = setInterval(() => {
					if (window.faceapi) {
						clearInterval(timer)
						resolve(window.faceapi)
					} else if (tries++ > 50) {
						clearInterval(timer)
						reject(new Error('face-api.js not loaded'))
					}
				}, 100)
			})

		const start = async () => {
			const video = videoRef.current
			const canvas = canvasRef.current

			if (!video || !canvas) {
				updateError('video element not ready')
				return
			}

			if (!window.isSecureContext) {
				updateError('camera needs localhost or https')
				return
			}

			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				updateError('getUserMedia not supported')
				return
			}

			try {
				const faceapi = await waitForFaceApi()
				const modelPath = `${process.env.PUBLIC_URL || ''}/models`
				setStatus('loading models')

				await Promise.all([
					faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
					faceapi.nets.faceExpressionNet.loadFromUri(modelPath),
				])

				if (cancelled) return

				setStatus('starting camera')
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { width: 540, height: 405 },
					audio: false,
				})

				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop())
					return
				}

				streamRef.current = stream
				video.srcObject = stream
				await video.play()

				const displaySize = { width: video.videoWidth || 540, height: video.videoHeight || 405 }
				faceapi.matchDimensions(canvas, displaySize)
				updateStatus('default')

				intervalRef.current = setInterval(async () => {
					if (video.paused || video.ended) return

					const detections = await faceapi
						.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
						.withFaceExpressions()
					const resizedDetections = faceapi.resizeResults(detections, displaySize)

					canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
					faceapi.draw.drawDetections(canvas, resizedDetections)
					faceapi.draw.drawFaceExpressions(canvas, resizedDetections)

					if (detections.length === 0) {
						updateStatus('default')
						return
					}

					const expressions = detections[0].expressions
					const nextStatus = Object.entries(expressions).reduce(
						(best, current) => (current[1] > best[1] ? current : best),
						['default', 0]
					)[0]

					updateStatus(nextStatus)
				}, 150)
			} catch (err) {
				updateError(err && err.name ? `${err.name}: ${err.message}` : String(err))
			}
		}

		start()

		return () => {
			cancelled = true
			if (intervalRef.current) clearInterval(intervalRef.current)
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop())
			}
		}
	}, [])

	return (
		<>
			<div id="app" className="app" ref={appRef}>
				<div className="overlay"></div>
				<div className="text">
					<span aria-label="emoji" role="img" id="emoji">
						{emoji}
					</span>
					You look <span id="textStatus">{status}</span>!
				</div>
				<div className="mockup">
					<div id="browser" className="browser">
						<div className="browserChrome">
							<div className="browserActions"></div>
						</div>
						<div className="cameraStage">
							<video id="video" ref={videoRef} width="540" height="405" muted autoPlay playsInline></video>
							<canvas id="canvas" ref={canvasRef}></canvas>
						</div>
					</div>
				</div>
				<p className="note">You are not being recorded, it all happens in your own browser!</p>
			</div>
		</>
	)
}

export default App
