import { reelConvertEngine } from '../engines/reelConvertEngine.js'

/**
 * 9:16 변환 + 크롭/워터마크/텍스트. (릴스 변환 엔진 래퍼)
 */
export async function editVideo(jobId, sourcePath, options = {}, onProgress = () => {}, signal) {
  const { outputPath } = await reelConvertEngine.run(
    {
      jobId,
      sourcePath,
      editOptions: options
    },
    { onProgress, signal }
  )
  return outputPath
}
