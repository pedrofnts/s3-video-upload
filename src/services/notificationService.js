const axios = require('axios');
const config = require('../config/config');

/**
 * Notify external API about the uploaded file
 * @param {Object} params - The notification parameters
 * @param {String} params.videoDownloadUrl - The download URL of the uploaded video
 * @param {String} params.videoViewUrl - The view URL of the uploaded video
 * @param {String} params.audioDownloadUrl - The download URL of the extracted MP3 audio file (optional)
 * @param {String} params.audioViewUrl - The view URL of the extracted MP3 audio file (optional)
 * @param {String} params.id_trabalho - The work ID associated with the file
 * @returns {Promise<Object>} - The response from the notification endpoint or error info
 */
const notifyFileUploaded = async ({ videoDownloadUrl, videoViewUrl, audioDownloadUrl, audioViewUrl, id_trabalho }) => {
  // Verificar se o endpoint está configurado
  if (!config.notification.endpoint) {
    console.log('Endpoint de notificação não configurado. Pulando notificação.');
    return { status: 'skipped', message: 'Notification endpoint not configured' };
  }
  
  // Cria o payload usando os nomes de campos configurados
  const payload = {
    [config.notification.fileUrlField]: videoDownloadUrl,
    [config.notification.idTrabalhoField]: id_trabalho,
    link_video_editado_view: videoViewUrl
  };
  
  // Adiciona as URLs do áudio se disponíveis
  if (audioDownloadUrl) {
    payload.audioDownloadUrl = audioDownloadUrl;
    payload.audioViewUrl = audioViewUrl;
  }
  
  console.log('Payload da notificação:', payload);
  console.log(`Enviando notificação para: ${config.notification.endpoint}`);
  
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const response = await axios.post(config.notification.endpoint, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 segundos de timeout
      });
      
      console.log('Resposta da notificação:', response.data);
      return response.data;
    } catch (error) {
      retries++;
      console.error(`Erro na tentativa ${retries} de notificação:`, error.message);
      
      if (error.response) {
        console.error('Detalhes do erro:', {
          status: error.response.status,
          data: error.response.data
        });
      }
      
      if (retries >= maxRetries) {
        console.error(`Todas as ${maxRetries} tentativas de notificação falharam.`);
        return { 
          status: 'error', 
          message: 'Failed to send notification after multiple attempts, but file was uploaded successfully',
          error: error.message
        };
      }
      
      // Esperar antes de tentar novamente (backoff exponencial)
      const waitTime = Math.pow(2, retries) * 1000; // 2s, 4s, 8s...
      console.log(`Aguardando ${waitTime}ms antes da próxima tentativa de notificação...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

module.exports = {
  notifyFileUploaded
}; 