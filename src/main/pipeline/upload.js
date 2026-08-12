import { igUploadEngine } from '../engines/ig/uploadEngine.js'

/**
 * 로컬 파일을 Meta resumable 업로드로 릴스 게시. (IG 업로드 엔진 래퍼)
 */
export async function publishReel({
  accountId,
  videoPath,
  caption,
  shareToFeed = true,
  onProgress = () => {},
  signal
}) {
  return igUploadEngine.run(
    { accountId, videoPath, caption, shareToFeed },
    { onProgress, signal }
  )
}
