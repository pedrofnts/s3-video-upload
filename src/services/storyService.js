const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const axios = require('axios');

/**
 * Get video duration in seconds
 * @param {String} videoPath - Path to video file
 * @returns {Promise<Number>} - Duration in seconds
 */
const getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration;
        resolve(duration);
      }
    });
  });
};

/**
 * Get video file size
 * @param {String} videoPath - Path to video file
 * @returns {Promise<Number>} - File size in bytes
 */
const getFileSize = async (videoPath) => {
  const stats = await fs.stat(videoPath);
  return stats.size;
};

/**
 * Download video from URL
 * @param {String} videoUrl - URL of the video
 * @param {String} outputPath - Path to save the video
 * @returns {Promise<void>}
 */
const downloadVideo = async (videoUrl, outputPath) => {
  const response = await axios({
    method: 'get',
    url: videoUrl,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
};

/**
 * Split video into segments of maximum duration
 * @param {String} inputPath - Path to input video
 * @param {String} outputDir - Directory to save segments
 * @param {Number} maxDuration - Maximum duration per segment in seconds (default: 60)
 * @param {Number} maxSize - Maximum file size in bytes (default: 100MB)
 * @returns {Promise<Array>} - Array of segment file paths
 */
const splitVideoIntoSegments = async (inputPath, outputDir, maxDuration = 60, maxSize = 100 * 1024 * 1024) => {
  const segments = [];

  // Get total video duration
  const totalDuration = await getVideoDuration(inputPath);
  console.log(`Duração total do vídeo: ${totalDuration} segundos`);

  // If video is between 3-60s and under 100MB, no need to split
  if (totalDuration >= 3 && totalDuration <= maxDuration) {
    const fileSize = await getFileSize(inputPath);
    if (fileSize <= maxSize) {
      console.log('Vídeo já está dentro dos limites, não precisa dividir');
      // Just process it to ensure it meets all requirements
      const outputPath = path.join(outputDir, 'segment-001.mp4');
      await processSegment(inputPath, outputPath, 0, totalDuration);
      return [outputPath];
    }
  }

  // Calculate number of segments needed
  const numberOfSegments = Math.ceil(totalDuration / maxDuration);
  console.log(`Dividindo em ${numberOfSegments} segmentos`);

  // Split video into segments
  for (let i = 0; i < numberOfSegments; i++) {
    const startTime = i * maxDuration;
    const segmentDuration = Math.min(maxDuration, totalDuration - startTime);

    // Skip segments shorter than 3 seconds
    if (segmentDuration < 3) {
      console.log(`Segmento ${i + 1} muito curto (${segmentDuration}s), pulando...`);
      continue;
    }

    const outputPath = path.join(outputDir, `segment-${String(i + 1).padStart(3, '0')}.mp4`);

    console.log(`Processando segmento ${i + 1}/${numberOfSegments} (${startTime}s - ${startTime + segmentDuration}s)`);

    await processSegment(inputPath, outputPath, startTime, segmentDuration);

    // Check if file size is within limit
    const fileSize = await getFileSize(outputPath);
    console.log(`Tamanho do segmento ${i + 1}: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

    if (fileSize > maxSize) {
      console.warn(`Segmento ${i + 1} excede 100MB (${(fileSize / 1024 / 1024).toFixed(2)}MB). Pode ser rejeitado pelo Instagram.`);
      // Try to reduce bitrate further
      await processSegment(inputPath, outputPath, startTime, segmentDuration, true);
      const newFileSize = await getFileSize(outputPath);
      console.log(`Tamanho reduzido do segmento ${i + 1}: ${(newFileSize / 1024 / 1024).toFixed(2)}MB`);
    }

    segments.push(outputPath);
  }

  return segments;
};

/**
 * Process a video segment with Instagram Story requirements
 * @param {String} inputPath - Path to input video
 * @param {String} outputPath - Path to output video
 * @param {Number} startTime - Start time in seconds
 * @param {Number} duration - Duration in seconds
 * @param {Boolean} lowerBitrate - Use lower bitrate for smaller file size
 * @returns {Promise<void>}
 */
const processSegment = async (inputPath, outputPath, startTime, duration, lowerBitrate = false) => {
  return new Promise((resolve, reject) => {
    const videoBitrate = lowerBitrate ? '2500k' : '4000k';
    const audioBitrate = lowerBitrate ? '96k' : '128k';

    let command = ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(duration)
      .outputOptions([
        '-c:v', 'libx264',           // H.264 codec
        '-preset', 'medium',         // Encoding speed/quality balance
        '-b:v', videoBitrate,        // Video bitrate
        '-maxrate', videoBitrate,    // Max bitrate
        '-bufsize', lowerBitrate ? '5000k' : '8000k', // Buffer size
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1', // Ensure 9:16 vertical
        '-c:a', 'aac',               // AAC audio codec
        '-b:a', audioBitrate,        // Audio bitrate
        '-ar', '44100',              // Audio sample rate
        '-movflags', '+faststart',   // Enable fast start for web playback
        '-pix_fmt', 'yuv420p'        // Pixel format for compatibility
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Progresso: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log(`Segmento processado: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('Erro ao processar segmento:', err);
        reject(err);
      });

    // Add timeout (5 minutes per segment)
    const timeout = setTimeout(() => {
      command.kill('SIGKILL');
      reject(new Error('Timeout ao processar segmento após 5 minutos'));
    }, 5 * 60 * 1000);

    command.on('end', () => clearTimeout(timeout));
    command.on('error', () => clearTimeout(timeout));

    command.run();
  });
};

/**
 * Process video for Instagram Stories
 * Downloads video, splits if needed, processes each segment
 * @param {String} videoUrl - URL of the video to process
 * @returns {Promise<Array>} - Array of processed segment buffers and filenames
 */
const processStoryVideo = async (videoUrl) => {
  let tempDir = null;

  try {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'story-'));
    console.log(`Diretório temporário criado: ${tempDir}`);

    // Download video
    const inputPath = path.join(tempDir, 'input-video.mp4');
    console.log(`Baixando vídeo de: ${videoUrl}`);
    await downloadVideo(videoUrl, inputPath);
    console.log('Vídeo baixado com sucesso');

    // Create segments directory
    const segmentsDir = path.join(tempDir, 'segments');
    await fs.ensureDir(segmentsDir);

    // Split video into segments
    const segmentPaths = await splitVideoIntoSegments(inputPath, segmentsDir);
    console.log(`${segmentPaths.length} segmentos criados`);

    // Read all segments as buffers
    const segments = [];
    for (let i = 0; i < segmentPaths.length; i++) {
      const segmentPath = segmentPaths[i];
      const buffer = await fs.readFile(segmentPath);
      const filename = `story-part-${i + 1}.mp4`;
      const fileSize = buffer.length;
      const duration = await getVideoDuration(segmentPath);

      console.log(`Segmento ${i + 1}: ${filename} - ${(fileSize / 1024 / 1024).toFixed(2)}MB - ${duration.toFixed(1)}s`);

      segments.push({
        buffer,
        filename,
        fileSize,
        duration
      });
    }

    return segments;
  } catch (error) {
    console.error('Erro ao processar vídeo para story:', error);
    throw error;
  } finally {
    // Cleanup temporary directory
    if (tempDir) {
      try {
        await fs.remove(tempDir);
        console.log(`Diretório temporário removido: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Erro ao limpar diretório temporário:', cleanupError);
      }
    }
  }
};

module.exports = {
  processStoryVideo,
  getVideoDuration
};
