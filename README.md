# File Upload Service

A service that provides an API endpoint to upload files to AWS S3 and notify an external API.

## Features

- Upload de vídeos para AWS S3
- Compressão automática de vídeos usando FFmpeg antes do upload
- Extração automática de áudio MP3 do vídeo
- Conversão para formato MP4 otimizado
- Notificação a API externa após upload bem-sucedido, incluindo URL do vídeo e do MP3
- **Suporte nativo a download no iOS/Safari** - URLs configuradas para permitir download direto
- Geração de URLs de download temporárias com headers adequados para iOS

## Requirements

- Node.js 14+
- AWS S3 bucket and credentials
- FFmpeg (instalado no sistema)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Install FFmpeg on your system:
   - Ubuntu/Debian: `apt-get install ffmpeg`
   - MacOS: `brew install ffmpeg`
   - Windows: Download from [FFmpeg website](https://ffmpeg.org/download.html)
4. Create a `.env` file in the root directory with the following variables:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   AWS_S3_BUCKET=your_bucket_name
   PORT=3000
   NOTIFICATION_ENDPOINT=https://api.example.com/file-uploaded
   ```

## Running the Service

Development mode:
```
npm run dev
```

Production mode:
```
npm start
```

## API Endpoints

### Upload Video

- **URL**: `/api/upload`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Parameters**:
  - `arquivo`: O arquivo de vídeo para upload (formatos aceitos: mp4, avi, mov, etc)
  - `id_trabalho`: ID do trabalho associado ao arquivo (string)

#### Example Request

Using curl:
```bash
curl -X POST \
  http://localhost:3000/api/upload \
  -H 'Content-Type: multipart/form-data' \
  -F 'arquivo=@/path/to/your/video.mp4' \
  -F 'id_trabalho=12345'
```

#### Response

```json
{
  "success": true,
  "fileUrl": "https://your-bucket.s3.amazonaws.com/uploads/123456789-compressed-video.mp4",
  "audioUrl": "https://your-bucket.s3.amazonaws.com/uploads/123456789-audio-video.mp3",
  "id_trabalho": "12345",
  "notification": {
    // Response from the notification endpoint
  },
  "originalSize": 15000000,
  "compressedSize": 6000000,
  "compressionRatio": "40.00%"
}
```

### Generate iOS Download URL

Para resolver problemas de download no iOS/Safari, use este endpoint para gerar URLs temporárias que forçam o download:

- **URL**: `/api/generate-download-url`
- **Method**: `POST`
- **Content-Type**: `application/json`
- **Parameters**:
  - `s3Url`: URL completa do arquivo no S3 (string)
  - `filename`: Nome do arquivo para download (string)

#### Example Request

Using curl:
```bash
curl -X POST \
  http://localhost:3000/api/generate-download-url \
  -H 'Content-Type: application/json' \
  -d '{
    "s3Url": "https://your-bucket.s3.amazonaws.com/uploads/123456789-compressed-video.mp4",
    "filename": "meu-video.mp4"
  }'
```

#### Response

```json
{
  "success": true,
  "downloadUrl": "https://your-bucket.s3.amazonaws.com/uploads/123456789-compressed-video.mp4?AWSAccessKeyId=...&Expires=...&response-content-disposition=attachment%3B%20filename%3D%22meu-video.mp4%22",
  "expiresIn": 3600,
  "filename": "meu-video.mp4"
}
```

## iOS Download Support

Os arquivos são automaticamente configurados com headers apropriados para permitir download direto no iOS:

- **Content-Disposition**: `attachment; filename="nome-do-arquivo"`
- **URLs assinadas**: Incluem parâmetros especiais para forçar download
- **Expiração**: URLs de download temporárias válidas por 1 hora

### Como usar no iOS:

1. Use a URL retornada pelo `/api/upload` normalmente
2. Se ainda houver problemas, gere uma URL temporal com `/api/generate-download-url`
3. A URL temporal irá forçar o download mesmo no Safari iOS

## Error Handling

The API will return appropriate HTTP status codes and error messages when:
- No file is uploaded
- The file is not a video file
- The `id_trabalho` parameter is missing
- The file upload to S3 fails
- The notification to the external API fails
- The video compression fails 