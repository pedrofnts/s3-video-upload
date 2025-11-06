const s3Service = require('../services/s3Service');
const notificationService = require('../services/notificationService');
const videoService = require('../services/videoService');

/**
 * Handle file upload, S3 storage, and notification
 */
const uploadFile = async (req, res) => {
  try {
    // Validate request
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Field name must be "arquivo".' });
    }
    
    if (!req.body.id_trabalho) {
      return res.status(400).json({ error: 'Missing required field: id_trabalho' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const { id_trabalho } = req.body;

    // Verificar se o arquivo é realmente um vídeo
    if (!mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Apenas arquivos de vídeo são permitidos' });
    }

    // Send immediate 200 response to client
    res.status(200).json({
      success: true,
      message: 'Arquivo recebido. Processamento iniciado.',
      id_trabalho
    });

    // Continue processing in the background
    (async () => {
      try {
        // Verificar se o FFmpeg está instalado
        const ffmpegInstalled = await videoService.isFFmpegInstalled();
        if (!ffmpegInstalled) {
          console.error('FFmpeg não está instalado. Não é possível processar o vídeo.');
          return;
        }

        // Comprimir o vídeo antes de fazer upload
        const compressStartTime = Date.now();
        console.log(`Iniciando compressão do vídeo: ${originalname}`);
        
        const compressedVideo = await videoService.compressVideo(buffer, originalname);
        
        console.log(`Vídeo comprimido em ${(Date.now() - compressStartTime) / 1000} segundos`);
        console.log(`Tamanho original: ${buffer.length} bytes, Tamanho comprimido: ${compressedVideo.buffer.length} bytes`);

        // Upload do vídeo comprimido para o S3 (forçando download para iOS)
        const videoUrls = await s3Service.uploadFile(
          compressedVideo.buffer,
          `compressed-${originalname.split('.')[0]}.mp4`,
          compressedVideo.mimetype,
          true // forceDownload = true para vídeos
        );

        // Extrair áudio MP3 do vídeo
        console.log(`Iniciando extração de áudio MP3 do vídeo: ${originalname}`);
        const extractStartTime = Date.now();
        
        const extractedAudio = await videoService.extractAudioMP3(buffer, originalname);
        
        // Variáveis para armazenar as URLs do áudio
        let audioDownloadUrl = null;
        let audioViewUrl = null;
        
        // Fazer upload do MP3 extraído para o S3 (se a extração foi bem-sucedida)
        if (extractedAudio) {
          console.log(`Áudio MP3 extraído em ${(Date.now() - extractStartTime) / 1000} segundos`);
          console.log(`Tamanho do MP3: ${extractedAudio.buffer.length} bytes`);
          
          const audioUrls = await s3Service.uploadFile(
            extractedAudio.buffer,
            `audio-${originalname.split('.')[0]}.mp3`,
            extractedAudio.mimetype,
            true // forceDownload = true para áudios também
          );
          
          audioDownloadUrl = audioUrls.downloadUrl;
          audioViewUrl = audioUrls.viewUrl;
          
          console.log(`MP3 enviado para S3: ${audioUrls.downloadUrl}`);
        } else {
          console.log('Não foi possível extrair o áudio MP3 do vídeo.');
        }

        // Notify external API (incluindo todas as URLs)
        await notificationService.notifyFileUploaded({
          videoDownloadUrl: videoUrls.downloadUrl,
          videoViewUrl: videoUrls.viewUrl,
          audioDownloadUrl,
          audioViewUrl,
          id_trabalho
        });

        console.log(`Processamento completo para id_trabalho: ${id_trabalho}`);
        console.log(`URL de download do vídeo: ${videoUrls.downloadUrl}`);
        console.log(`URL de visualização do vídeo: ${videoUrls.viewUrl}`);
        if (audioDownloadUrl) {
          console.log(`URL de download do MP3: ${audioDownloadUrl}`);
          console.log(`URL de visualização do MP3: ${audioViewUrl}`);
        }
      } catch (error) {
        console.error('Error in background processing:', error);

        // Notify error webhook
        try {
          await notificationService.notifyError({
            processType: 'upload',
            errorMessage: error.message,
            errorStack: error.stack,
            metadata: {
              id_trabalho,
              originalFilename: originalname,
              mimetype
            }
          });
        } catch (notifyError) {
          console.error('Failed to send error notification:', notifyError.message);
        }
      }
    })();
  } catch (error) {
    console.error('Error in upload controller:', error);
    return res.status(500).json({
      error: 'File upload failed',
      message: error.message
    });
  }
};

/**
 * Generate download URL for iOS compatibility
 */
const generateDownloadUrl = async (req, res) => {
  try {
    const { s3Url, filename } = req.body;
    
    if (!s3Url) {
      return res.status(400).json({ error: 'Missing required field: s3Url' });
    }
    
    if (!filename) {
      return res.status(400).json({ error: 'Missing required field: filename' });
    }
    
    // Extract S3 key from URL
    const s3Key = s3Service.extractS3KeyFromUrl(s3Url);
    if (!s3Key) {
      return res.status(400).json({ error: 'Invalid S3 URL format' });
    }
    
    // Generate both download and view URLs
    const [downloadUrl, viewUrl] = await Promise.all([
      s3Service.generateDownloadUrl(s3Key, filename, 3600),
      s3Service.generateViewUrl(s3Key, 3600)
    ]);
    
    res.status(200).json({
      success: true,
      downloadUrl,
      viewUrl,
      expiresIn: 3600,
      filename
    });
  } catch (error) {
    console.error('Error generating URLs:', error);
    return res.status(500).json({
      error: 'Failed to generate URLs',
      message: error.message
    });
  }
};

module.exports = {
  uploadFile,
  generateDownloadUrl
}; 