const storyService = require('../services/storyService');
const s3Service = require('../services/s3Service');
const notificationService = require('../services/notificationService');
const axios = require('axios');

/**
 * Process video for Instagram Stories
 * Splits video into 3-60s segments, uploads to S3, and notifies webhook
 */
const processStory = async (req, res) => {
  try {
    const { videoUrl, profileId } = req.body;

    // Validate request
    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing required field: videoUrl' });
    }

    if (!profileId) {
      return res.status(400).json({ error: 'Missing required field: profileId' });
    }

    console.log(`Iniciando processamento de story para profileId: ${profileId}`);
    console.log(`URL do vídeo: ${videoUrl}`);

    // Send immediate response to prevent timeout
    res.status(200).json({
      success: true,
      message: 'Processamento de story iniciado',
      profileId
    });

    // Continue processing in background
    (async () => {
      try {
        // Process video into story segments
        console.log('Processando vídeo em segmentos para Instagram Story...');
        const segments = await storyService.processStoryVideo(videoUrl);
        console.log(`${segments.length} segmentos processados`);

        // Upload all segments to S3
        const uploadedVideos = [];
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          console.log(`Fazendo upload do segmento ${i + 1}/${segments.length} para S3...`);

          const urls = await s3Service.uploadFile(
            segment.buffer,
            segment.filename,
            'video/mp4',
            false // não forçar download para stories
          );

          uploadedVideos.push({
            url: urls.viewUrl,
            downloadUrl: urls.downloadUrl,
            duration: segment.duration,
            fileSize: segment.fileSize,
            filename: segment.filename
          });

          console.log(`Segmento ${i + 1} enviado: ${urls.viewUrl}`);
        }

        // Notify webhook with array of videos and profileId
        const webhookUrl = 'https://api.drreels.com.br/webhook/postStory';
        const webhookPayload = {
          profileId,
          videos: uploadedVideos.map(v => v.url)
        };

        console.log(`Notificando webhook: ${webhookUrl}`);
        console.log('Payload:', JSON.stringify(webhookPayload, null, 2));

        const webhookResponse = await axios.post(webhookUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 seconds timeout
        });

        console.log('Webhook notificado com sucesso:', webhookResponse.data);
        console.log(`Processamento completo para profileId: ${profileId}`);
        console.log(`Total de vídeos: ${uploadedVideos.length}`);
        uploadedVideos.forEach((video, index) => {
          console.log(`  ${index + 1}. ${video.filename} - ${video.duration.toFixed(1)}s - ${(video.fileSize / 1024 / 1024).toFixed(2)}MB`);
          console.log(`     URL: ${video.url}`);
        });

      } catch (error) {
        console.error('Erro no processamento de story em background:', error);

        // Notify error webhook (centralized error notification)
        try {
          await notificationService.notifyError({
            processType: 'story',
            errorMessage: error.message,
            errorStack: error.stack,
            metadata: {
              profileId,
              videoUrl
            }
          });
        } catch (notifyError) {
          console.error('Failed to send error notification:', notifyError.message);
        }

        // Try to notify story webhook about the error (existing behavior)
        try {
          const webhookUrl = 'https://api.drreels.com.br/webhook/postStory';
          await axios.post(webhookUrl, {
            profileId,
            error: true,
            message: error.message
          }, {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 10000
          });
        } catch (webhookError) {
          console.error('Erro ao notificar webhook sobre falha:', webhookError.message);
        }
      }
    })();

  } catch (error) {
    console.error('Erro no controller de story:', error);
    return res.status(500).json({
      error: 'Falha ao processar story',
      message: error.message
    });
  }
};

module.exports = {
  processStory
};
