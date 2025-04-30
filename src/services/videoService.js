const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

/**
 * Verifica se o FFmpeg está instalado no sistema
 * @returns {Promise<boolean>} - true se estiver instalado, false caso contrário
 */
const isFFmpegInstalled = () => {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error) => {
      if (error) {
        console.error('FFmpeg não está instalado:', error.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

/**
 * Comprimir vídeo usando ffmpeg
 * @param {Buffer} videoBuffer - Buffer do vídeo original
 * @param {String} fileName - Nome do arquivo original
 * @returns {Promise<Object>} - Retorna o buffer do vídeo comprimido e o novo MIME type
 */
const compressVideo = async (videoBuffer, fileName) => {
  let tempDir = null;
  
  try {
    // Verificar se o FFmpeg está instalado
    const ffmpegInstalled = await isFFmpegInstalled();
    if (!ffmpegInstalled) {
      throw new Error('FFmpeg não está instalado. Por favor, instale o FFmpeg para poder comprimir vídeos.');
    }

    // Criar diretório temporário para trabalhar com os arquivos
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-'));
    
    // Definir nomes de arquivos
    const inputPath = path.join(tempDir, fileName);
    const outputPath = path.join(tempDir, `compressed-${fileName.split('.')[0]}.mp4`);
    
    // Escrever o buffer em um arquivo temporário
    await fs.writeFile(inputPath, videoBuffer);
    
    console.log(`Arquivo temporário criado em: ${inputPath}`);
    console.log(`Tamanho do arquivo original: ${videoBuffer.length} bytes`);
    
    // Comprimir o vídeo
    await new Promise((resolve, reject) => {
      let ffmpegProcess = ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',     // Codec de vídeo H.264
          '-crf 28',          // Controle de qualidade (28 é um bom equilíbrio entre qualidade e tamanho)
          '-preset fast',     // Velocidade de codificação
          '-c:a aac',         // Codec de áudio AAC
          '-b:a 128k',        // Bitrate de áudio
          '-movflags +faststart', // Otimizar para streaming
          '-f mp4'            // Force output format
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('Comando FFmpeg:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Progresso: ${progress.percent ? progress.percent.toFixed(1) + '%' : 'processando...'}`);
        })
        .on('end', () => {
          console.log('Compressão de vídeo concluída');
          resolve();
        })
        .on('error', (err) => {
          console.error('Erro durante a compressão do vídeo:', err);
          reject(err);
        });
      
      // Adicione um timeout para evitar processos de compressão infinitos
      const timeout = setTimeout(() => {
        console.error('Timeout na compressão do vídeo após 10 minutos');
        ffmpegProcess.kill('SIGKILL');
        reject(new Error('Timeout na compressão do vídeo após 10 minutos'));
      }, 10 * 60 * 1000); // 10 minutos
      
      ffmpegProcess.run();
      
      // Limpe o timeout quando o processo terminar
      ffmpegProcess.on('end', () => clearTimeout(timeout));
      ffmpegProcess.on('error', () => clearTimeout(timeout));
    });
    
    // Verificar se o arquivo de saída existe
    const outputExists = await fs.pathExists(outputPath);
    if (!outputExists) {
      throw new Error('Falha na compressão: arquivo de saída não foi criado');
    }
    
    // Ler o arquivo comprimido como buffer
    const compressedBuffer = await fs.readFile(outputPath);
    console.log(`Tamanho do arquivo comprimido: ${compressedBuffer.length} bytes`);
    
    // Se o arquivo comprimido for maior que o original, usar o original
    if (compressedBuffer.length > videoBuffer.length) {
      console.log('Arquivo comprimido é maior que o original. Usando o arquivo original.');
      return {
        buffer: videoBuffer,
        mimetype: 'video/mp4'
      };
    }
    
    return {
      buffer: compressedBuffer,
      mimetype: 'video/mp4'
    };
  } catch (error) {
    console.error('Erro ao comprimir vídeo:', error);
    // Em caso de erro, retorna o vídeo original em vez de falhar completamente
    return {
      buffer: videoBuffer,
      mimetype: 'video/mp4'
    };
  } finally {
    // Limpar os arquivos temporários, independente de sucesso ou falha
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

/**
 * Extrair áudio MP3 do vídeo usando ffmpeg
 * @param {Buffer} videoBuffer - Buffer do vídeo original
 * @param {String} fileName - Nome do arquivo original
 * @returns {Promise<Object>} - Retorna o buffer do MP3 extraído e o mimetype
 */
const extractAudioMP3 = async (videoBuffer, fileName) => {
  let tempDir = null;
  
  try {
    // Verificar se o FFmpeg está instalado
    const ffmpegInstalled = await isFFmpegInstalled();
    if (!ffmpegInstalled) {
      throw new Error('FFmpeg não está instalado. Por favor, instale o FFmpeg para poder extrair áudio.');
    }

    // Criar diretório temporário para trabalhar com os arquivos
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-'));
    
    // Definir nomes de arquivos
    const inputPath = path.join(tempDir, fileName);
    const outputPath = path.join(tempDir, `${fileName.split('.')[0]}.mp3`);
    
    // Escrever o buffer em um arquivo temporário
    await fs.writeFile(inputPath, videoBuffer);
    
    console.log(`Arquivo temporário criado em: ${inputPath}`);
    console.log(`Extraindo áudio MP3 do vídeo...`);
    
    // Extrair áudio MP3
    await new Promise((resolve, reject) => {
      let ffmpegProcess = ffmpeg(inputPath)
        .outputOptions([
          '-vn',              // Remover a parte de vídeo
          '-c:a libmp3lame',  // Codec MP3
          '-q:a 2',           // Qualidade de áudio (2 é alta qualidade)
          '-f mp3'            // Force output format
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('Comando FFmpeg para extração de áudio:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Progresso extração de áudio: ${progress.percent ? progress.percent.toFixed(1) + '%' : 'processando...'}`);
        })
        .on('end', () => {
          console.log('Extração de áudio MP3 concluída');
          resolve();
        })
        .on('error', (err) => {
          console.error('Erro durante a extração de áudio MP3:', err);
          reject(err);
        });
      
      // Adicione um timeout para evitar processos infinitos
      const timeout = setTimeout(() => {
        console.error('Timeout na extração de áudio após 5 minutos');
        ffmpegProcess.kill('SIGKILL');
        reject(new Error('Timeout na extração de áudio após 5 minutos'));
      }, 5 * 60 * 1000); // 5 minutos
      
      ffmpegProcess.run();
      
      // Limpe o timeout quando o processo terminar
      ffmpegProcess.on('end', () => clearTimeout(timeout));
      ffmpegProcess.on('error', () => clearTimeout(timeout));
    });
    
    // Verificar se o arquivo de saída existe
    const outputExists = await fs.pathExists(outputPath);
    if (!outputExists) {
      throw new Error('Falha na extração de áudio: arquivo MP3 não foi criado');
    }
    
    // Ler o arquivo MP3 como buffer
    const audioBuffer = await fs.readFile(outputPath);
    console.log(`Tamanho do arquivo MP3: ${audioBuffer.length} bytes`);
    
    return {
      buffer: audioBuffer,
      mimetype: 'audio/mp3'
    };
  } catch (error) {
    console.error('Erro ao extrair áudio MP3:', error);
    // Em caso de erro, retorna null para indicar que falhou
    return null;
  } finally {
    // Limpar os arquivos temporários, independente de sucesso ou falha
    if (tempDir) {
      try {
        await fs.remove(tempDir);
        console.log(`Diretório temporário para áudio removido: ${tempDir}`);
      } catch (cleanupError) {
        console.error('Erro ao limpar diretório temporário de áudio:', cleanupError);
      }
    }
  }
};

module.exports = {
  compressVideo,
  isFFmpegInstalled,
  extractAudioMP3
}; 