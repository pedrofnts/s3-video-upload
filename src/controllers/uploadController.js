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

        // Upload do vídeo comprimido para o S3
        const fileUrl = await s3Service.uploadFile(
          compressedVideo.buffer,
          `compressed-${originalname.split('.')[0]}.mp4`,
          compressedVideo.mimetype
        );

        // Extrair áudio MP3 do vídeo
        console.log(`Iniciando extração de áudio MP3 do vídeo: ${originalname}`);
        const extractStartTime = Date.now();
        
        const extractedAudio = await videoService.extractAudioMP3(buffer, originalname);
        
        // Variável para armazenar a URL do áudio
        let audioUrl = null;
        
        // Fazer upload do MP3 extraído para o S3 (se a extração foi bem-sucedida)
        if (extractedAudio) {
          console.log(`Áudio MP3 extraído em ${(Date.now() - extractStartTime) / 1000} segundos`);
          console.log(`Tamanho do MP3: ${extractedAudio.buffer.length} bytes`);
          
          audioUrl = await s3Service.uploadFile(
            extractedAudio.buffer,
            `audio-${originalname.split('.')[0]}.mp3`,
            extractedAudio.mimetype
          );
          
          console.log(`MP3 enviado para S3: ${audioUrl}`);
        } else {
          console.log('Não foi possível extrair o áudio MP3 do vídeo.');
        }

        // Notify external API (incluindo a URL do áudio se disponível)
        await notificationService.notifyFileUploaded(fileUrl, id_trabalho, audioUrl);

        console.log(`Processamento completo para id_trabalho: ${id_trabalho}`);
        console.log(`URL do vídeo: ${fileUrl}`);
        if (audioUrl) {
          console.log(`URL do MP3: ${audioUrl}`);
        }
      } catch (error) {
        console.error('Error in background processing:', error);
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

module.exports = {
  uploadFile
}; 