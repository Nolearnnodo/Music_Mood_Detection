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

const scriptBasePath = new URL('.', document.currentScript.src).pathname.replace(/\/$/, '')

function setStatus(emoji, textStatus, app, status) {
	const nextStatus = statusIcons[status] ? status : 'default'
	emoji.innerHTML = statusIcons[nextStatus].emoji
	textStatus.innerHTML = nextStatus === 'default' ? '...' : nextStatus
	app.style.backgroundColor = statusIcons[nextStatus].color
}

function showError(textStatus, message) {
	console.error(message)
	if (textStatus) textStatus.innerHTML = message
}

function getModelPath() {
	return `${scriptBasePath}/models`
}

function startVideo(video, textStatus) {
	if (!navigator.mediaDevices) {
		navigator.mediaDevices = {}
	}

	if (!navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia = function (constraints) {
			const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia

			if (!getUserMedia) {
				return Promise.reject(new Error('getUserMedia is not implemented in this browser'))
			}

			return new Promise(function (resolve, reject) {
				getUserMedia.call(navigator, constraints, resolve, reject)
			})
		}
	}

	navigator.mediaDevices
		.getUserMedia({ video: true })
		.then(function (stream) {
			if ('srcObject' in video) {
				video.srcObject = stream
			} else {
				video.src = window.URL.createObjectURL(stream)
			}

			video.onloadedmetadata = function () {
				video.play()
			}
		})
		.catch(function (err) {
			showError(textStatus, `camera error: ${err.name}`)
		})
}

function initFacialEmotionDetector() {
	const video = document.getElementById('video')
	const canvas = document.getElementById('canvas')
	const textStatus = document.getElementById('textStatus')
	const emoji = document.getElementById('emoji')
	const app = document.getElementById('app')

	if (!video || !canvas || !textStatus || !emoji || !app) {
		showError(textStatus, 'app elements not ready')
		return
	}

	if (!window.isSecureContext) {
		showError(textStatus, 'camera needs localhost or https')
		return
	}

	if (!window.faceapi) {
		showError(textStatus, 'face-api.js not loaded')
		return
	}

	Promise.all([
		faceapi.nets.tinyFaceDetector.loadFromUri(getModelPath()),
		faceapi.nets.faceLandmark68Net.loadFromUri(getModelPath()),
		faceapi.nets.faceRecognitionNet.loadFromUri(getModelPath()),
		faceapi.nets.faceExpressionNet.loadFromUri(getModelPath()),
	])
		.then(function () {
			startVideo(video, textStatus)
		})
		.catch(function (err) {
			showError(textStatus, `model load error: ${err.message}`)
		})

	video.addEventListener('play', function () {
		const displaySize = { width: video.width, height: video.height }
		faceapi.matchDimensions(canvas, displaySize)

		setInterval(async function () {
			const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions()
			const resizedDetections = faceapi.resizeResults(detections, displaySize)
			canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
			faceapi.draw.drawDetections(canvas, resizedDetections)
			faceapi.draw.drawFaceExpressions(canvas, resizedDetections)

			if (detections.length > 0) {
				detections.forEach(function (element) {
					let status = 'default'
					let valueStatus = 0.0

					for (const [key, value] of Object.entries(element.expressions)) {
						if (value > valueStatus) {
							status = key
							valueStatus = value
						}
					}

					setStatus(emoji, textStatus, app, status)
				})
			} else {
				setStatus(emoji, textStatus, app, 'default')
			}
		}, 100)
	})
}

window.addEventListener('load', initFacialEmotionDetector)
