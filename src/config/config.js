require('dotenv').config();

module.exports = {
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    bucketName: process.env.AWS_S3_BUCKET
  },
  app: {
    port: process.env.PORT || 3000
  },
  notification: {
    endpoint: process.env.NOTIFICATION_ENDPOINT,
    fileUrlField: process.env.NOTIFICATION_FILE_URL_FIELD || 'fileUrl',
    idTrabalhoField: process.env.NOTIFICATION_ID_TRABALHO_FIELD || 'idTrabalho',
    errorWebhook: process.env.ERROR_WEBHOOK_URL
  }
}; 