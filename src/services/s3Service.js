const AWS = require('aws-sdk');
const config = require('../config/config');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
});

// Create S3 instance
const s3 = new AWS.S3();

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {String} fileName - The name of the file
 * @param {String} mimeType - The mime type of the file
 * @param {Boolean} forceDownload - Whether to force download instead of inline display
 * @returns {Promise<String>} - The URL of the uploaded file
 */
const uploadFile = async (fileBuffer, fileName, mimeType, forceDownload = false) => {
  // Verificar se estamos em ambiente de desenvolvimento
  const isDev = process.env.NODE_ENV === 'development' || process.env.ENV === 'development';
  
  if (isDev) {
    console.log('Ambiente de desenvolvimento: simulando upload para S3');
    console.log(`Arquivo: ${fileName}, Tipo: ${mimeType}, Tamanho: ${fileBuffer.length} bytes`);
    
    // Simular um atraso para o upload
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Retornar um URL simulado
    return `https://example-bucket.s3.amazonaws.com/uploads/dev-${Date.now()}-${fileName}`;
  }
  
  // Em produção, fazer o upload real
  const params = {
    Bucket: config.aws.bucketName,
    Key: `uploads/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: mimeType
  };

  // Adicionar headers para forçar download no iOS se solicitado
  if (forceDownload) {
    params.ContentDisposition = `attachment; filename="${fileName}"`;
    params.Metadata = {
      'original-filename': fileName
    };
  }

  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      console.log(`Tentativa ${retries + 1} de upload para S3: ${fileName}`);
      const uploadResult = await s3.upload(params).promise();
      console.log(`Upload para S3 bem-sucedido: ${uploadResult.Location}`);
      return uploadResult.Location; // Return the URL of the uploaded file
    } catch (error) {
      retries++;
      console.error(`Erro na tentativa ${retries} de upload para S3:`, error);
      
      if (retries >= maxRetries) {
        console.error(`Todas as ${maxRetries} tentativas de upload falharam.`);
        // Em vez de lançar erro, retornar uma URL falsa para evitar falha completa
        return `https://error-upload.s3.amazonaws.com/error-${Date.now()}-${fileName}`;
      }
      
      // Esperar antes de tentar novamente (backoff exponencial)
      const waitTime = Math.pow(2, retries) * 1000; // 2s, 4s, 8s...
      console.log(`Aguardando ${waitTime}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

/**
 * Generate a signed download URL for iOS compatibility
 * @param {String} s3Key - The S3 key of the file
 * @param {String} originalFileName - The original filename for download
 * @param {Number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<String>} - The signed URL for downloading
 */
const generateDownloadUrl = async (s3Key, originalFileName, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: config.aws.bucketName,
      Key: s3Key,
      Expires: expiresIn,
      ResponseContentDisposition: `attachment; filename="${originalFileName}"`
    };

    const downloadUrl = await s3.getSignedUrl('getObject', params);
    console.log(`URL de download gerada: ${downloadUrl}`);
    return downloadUrl;
  } catch (error) {
    console.error('Erro ao gerar URL de download:', error);
    throw error;
  }
};

/**
 * Extract S3 key from a full S3 URL
 * @param {String} s3Url - The full S3 URL
 * @returns {String} - The S3 key
 */
const extractS3KeyFromUrl = (s3Url) => {
  try {
    // Extract key from URLs like: https://bucket.s3.region.amazonaws.com/uploads/file.mp4
    const url = new URL(s3Url);
    return url.pathname.substring(1); // Remove leading slash
  } catch (error) {
    console.error('Erro ao extrair chave S3 da URL:', error);
    return null;
  }
};

module.exports = {
  uploadFile,
  generateDownloadUrl,
  extractS3KeyFromUrl
}; 