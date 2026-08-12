import { referenceInstallEngine } from '../engines/referenceInstallEngine.js'

/**
 * yt-dlp로 영상 다운로드. (레퍼런스 영상 설치 엔진 래퍼)
 * @returns {Promise<string>} 다운로드된 파일 경로
 */
export async function downloadVideo(jobId, url, onProgress = () => {}, signal) {
  const { sourcePath } = await referenceInstallEngine.run(
    { jobId, url },
    { onProgress, signal }
  )
  return sourcePath
}
