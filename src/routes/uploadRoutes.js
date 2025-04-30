const express = require('express');
const multer = require('multer');
const path = require('path');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

// Lista de extensões de vídeo aceitas
const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];

// Configure multer for memory storage (we'll stream to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit para vídeos
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas formatos de vídeo - verificar tanto mimetype como extensão
    const isVideoMimeType = file.mimetype.startsWith('video/');
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideoExtension = videoExtensions.includes(ext);
    
    console.log(`Arquivo recebido: ${file.originalname}, MIME type: ${file.mimetype}, Extensão: ${ext}`);
    
    if (isVideoMimeType || isVideoExtension) {
      // Force o mimetype para video/mp4 se for uma extensão de vídeo reconhecida
      if (isVideoExtension && !isVideoMimeType) {
        console.log(`Corrigindo mimetype para vídeo: ${file.originalname}`);
        file.mimetype = 'video/mp4';
      }
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de vídeo são permitidos'), false);
    }
  }
});

// POST route for file upload
router.post('/upload', upload.single('arquivo'), uploadController.uploadFile);

module.exports = router; 