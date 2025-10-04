# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js/Express service that accepts video file uploads, compresses them using FFmpeg, extracts MP3 audio, uploads both to AWS S3, and notifies an external API. The service is designed to handle iOS/Safari download compatibility issues with special S3 URL generation.

## Development Commands

```bash
# Start in development mode with auto-reload
npm run dev

# Start in production mode
npm start
```

## Environment Configuration

Required `.env` file variables:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` - AWS credentials and S3 bucket
- `PORT` - Server port (default: 3000)
- `NOTIFICATION_ENDPOINT` - External API endpoint to notify after upload
- `NOTIFICATION_FILE_URL_FIELD`, `NOTIFICATION_ID_TRABALHO_FIELD` - Configurable field names for notification payload
- `NODE_ENV` or `ENV` - Set to 'development' to simulate S3 uploads without actual AWS calls

## Architecture

**Request Flow (Upload):**
1. Client uploads video to `/api/upload` endpoint (multipart/form-data with `arquivo` field and `id_trabalho`)
2. Server immediately responds with 200 to prevent timeout
3. Background processing:
   - Video compression with FFmpeg (converts to MP4, scales to 1080x1920, H.264/AAC codecs)
   - MP3 audio extraction from video
   - Upload both files to S3 with iOS-compatible download headers
   - Notify external API with all URLs

**Request Flow (Instagram Stories):**
1. Client sends POST to `/api/process-story` with `videoUrl` and `profileId`
2. Server immediately responds with 200 to prevent timeout
3. Background processing:
   - Downloads video from S3 URL
   - Analyzes duration and splits into 3-60s segments
   - Processes each segment (H.264/AAC, 9:16 vertical, <100MB)
   - Uploads all segments to S3
   - Calls webhook at `https://api.drreels.com.br/webhook/postStory` with array of video URLs and profileId

**Key Files:**
- `src/index.js` - Express app initialization, middleware, error handling
- `src/routes/uploadRoutes.js` - Route definitions, multer configuration with 2GB limit, story processing route
- `src/controllers/uploadController.js` - Upload orchestration logic (immediate response + background processing)
- `src/controllers/storyController.js` - Instagram Story processing orchestration
- `src/services/s3Service.js` - S3 upload with retry logic, signed URL generation (download vs view URLs)
- `src/services/videoService.js` - FFmpeg video compression and audio extraction
- `src/services/storyService.js` - Video download, duration analysis, segment splitting for Instagram Stories
- `src/services/notificationService.js` - External API notification with retry logic
- `src/config/config.js` - Centralized environment variable configuration

**Service Layer Details:**
- `s3Service`: Generates both `downloadUrl` (with Content-Disposition header) and `viewUrl` for each file. In development mode, simulates uploads without hitting AWS.
- `videoService`: Uses temporary directories in OS temp folder for FFmpeg processing, always cleans up after. Has 10-minute timeout for compression, 5-minute for audio extraction.
- `storyService`: Downloads video from URL, analyzes duration with ffprobe, splits into segments of max 60s (min 3s). Processes each segment with Instagram Story requirements (9:16 aspect ratio, H.264/AAC, <100MB). Uses adaptive bitrate if segment exceeds 100MB.
- `notificationService`: Retries 3 times with exponential backoff (2s, 4s, 8s) before giving up.

## iOS Download Support

The service generates two types of S3 URLs:
- **Download URLs**: Include `Content-Disposition: attachment` header to force download on iOS/Safari
- **View URLs**: Standard URLs for in-browser viewing

Endpoint `/api/generate-download-url` creates temporary signed URLs (1-hour expiration) for existing S3 files.

## FFmpeg Requirements

FFmpeg must be installed on the system:
- Service checks FFmpeg availability via `ffmpeg -version` command
- Compression: Uses H.264 video codec (5000k bitrate), AAC audio (128k), scales to 1080x1920
- Audio extraction: Uses libmp3lame codec, 128k bitrate

## Error Handling Strategy

- All services use retry logic (3 attempts with exponential backoff)
- S3 upload failures return fake URLs instead of crashing (graceful degradation)
- Notification failures don't block the upload - file is still saved
- Global error handler catches multer file size errors and unhandled exceptions
- Process-level handlers for unhandledRejection and uncaughtException prevent crashes

## File Validation

Accepts video files only:
- MIME type check: `video/*`
- Extension whitelist: `.mp4`, `.avi`, `.mov`, `.mkv`, `.wmv`, `.flv`, `.webm`, `.m4v`, `.3gp`
- Max file size: 2GB
- If mimetype is incorrect but extension matches, mimetype is corrected to `video/mp4`

## Background Processing Pattern

Upload and story processing endpoints respond immediately, then continue processing asynchronously using an IIFE:
```javascript
res.status(200).json({ success: true, ... });
(async () => { /* compression, upload, notification */ })();
```
This prevents HTTP timeout on long video processing operations.

## Instagram Story Processing

The `/api/process-story` endpoint handles Instagram Story requirements:
- **Input**: `videoUrl` (S3 URL) and `profileId`
- **Processing**:
  - Downloads video from S3
  - Checks duration with ffprobe
  - Splits into segments of 3-60 seconds
  - Each segment is processed with:
    - Video codec: H.264 (libx264)
    - Audio codec: AAC
    - Aspect ratio: 9:16 (1080x1920) with padding if needed
    - Bitrate: 4000k video / 128k audio (reduces to 2500k/96k if >100MB)
    - Fast start enabled for web playback
  - Uploads all segments to S3
  - Calls webhook with `{ profileId, videos: [...] }`
- **Webhook**: `https://api.drreels.com.br/webhook/postStory`
- **Error handling**: Webhook is notified with `{ profileId, error: true, message: "..." }` if processing fails
