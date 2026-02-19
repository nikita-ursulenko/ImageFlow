const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Логирование в файл
const logFile = path.join(__dirname, 'server.log');
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(message);
}

logToFile('Сервер инициализируется...');

const app = express();
const PORT = 5030;

// Middleware для логирования запросов
app.use((req, res, next) => {
  logToFile(`${req.method} ${req.url}`);
  next();
});

// Поддерживаемые форматы
const supportedFormats = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

// Определение формата по MIME типу
function detectFormat(mimeType) {
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return null;
}

// Настройка multer для загрузки файлов в память (конвертация)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const fromFormat = req.query.from || 'webp';
    const expectedMime = supportedFormats[fromFormat];

    if (file.mimetype === expectedMime ||
      (fromFormat === 'jpg' && file.mimetype === 'image/jpeg') ||
      (fromFormat === 'jpeg' && file.mimetype === 'image/jpeg')) {
      cb(null, true);
    } else {
      cb(new Error(`Только ${fromFormat.toUpperCase()} файлы разрешены!`), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 50 // Максимум 50 файлов
  }
});

// Настройка multer для сжатия (принимает любые изображения)
const uploadCompress = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Принимаем любые изображения
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены!'), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB для сжатия
    files: 50 // Максимум 50 файлов
  }
});

// Настройка multer для видео
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Только видео файлы разрешены!'), false);
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1
  }
});

// Статические файлы
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой (максимум 10MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Слишком много файлов (максимум 50)' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Неожиданное поле. Убедитесь, что загружаете WebP файлы.' });
    }
    return res.status(400).json({ error: 'Ошибка загрузки файла: ' + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

// Функция конвертации изображения с дополнительными опциями
async function convertImage(buffer, fromFormat, toFormat, quality, options = {}) {
  let sharpInstance = sharp(buffer);

  // Изменение размера
  if (options.resizeWidth || options.resizeHeight) {
    const resizeOptions = {};
    if (options.maintainAspectRatio && options.resizeWidth && options.resizeHeight) {
      // Если нужно сохранить пропорции, используем fit
      resizeOptions.width = parseInt(options.resizeWidth);
      resizeOptions.height = parseInt(options.resizeHeight);
      resizeOptions.fit = 'inside';
    } else if (options.resizeWidth && options.resizeHeight) {
      resizeOptions.width = parseInt(options.resizeWidth);
      resizeOptions.height = parseInt(options.resizeHeight);
    } else if (options.resizeWidth) {
      resizeOptions.width = parseInt(options.resizeWidth);
    } else if (options.resizeHeight) {
      resizeOptions.height = parseInt(options.resizeHeight);
    }
    sharpInstance = sharpInstance.resize(resizeOptions);
  }

  // Поворот
  if (options.rotate) {
    const angle = parseInt(options.rotate);
    sharpInstance = sharpInstance.rotate(angle);
  }

  // Оптимизация/сжатие (уменьшение качества)
  let finalQuality = quality;
  if (options.optimizeLevel) {
    // optimizeLevel от 1 до 100, где 1 = максимальное сжатие
    finalQuality = Math.max(10, Math.min(100, Math.round(quality * (options.optimizeLevel / 100))));
  }

  // Настройки для разных форматов
  const formatOptions = {};

  if (toFormat === 'png') {
    const compressionLevel = Math.round((100 - finalQuality) / 10);
    formatOptions.png = {
      compressionLevel: Math.max(0, Math.min(9, compressionLevel)),
      quality: finalQuality
    };
    return sharpInstance.png(formatOptions.png).toBuffer();
  } else if (toFormat === 'jpg' || toFormat === 'jpeg') {
    formatOptions.jpeg = {
      quality: finalQuality,
      mozjpeg: true
    };
    return sharpInstance.jpeg(formatOptions.jpeg).toBuffer();
  } else if (toFormat === 'webp') {
    formatOptions.webp = {
      quality: finalQuality
    };
    return sharpInstance.webp(formatOptions.webp).toBuffer();
  }

  throw new Error(`Неподдерживаемый целевой формат: ${toFormat}`);
}

// API для конвертации
app.post('/convert', upload.array('imageFiles', 50), handleMulterError, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }

    const files = req.files;
    const quality = parseInt(req.query.quality) || 90;
    const fromFormat = req.query.from || 'webp';
    const toFormat = req.query.to || 'png';

    // Дополнительные опции обработки
    const processingOptions = {
      resizeWidth: req.query.resizeWidth || null,
      resizeHeight: req.query.resizeHeight || null,
      maintainAspectRatio: req.query.maintainAspectRatio === 'true',
      rotate: req.query.rotate || null,
      optimizeLevel: req.query.optimizeLevel ? parseInt(req.query.optimizeLevel) : null
    };

    // Проверка форматов
    if (!supportedFormats[fromFormat] || !supportedFormats[toFormat]) {
      return res.status(400).json({ error: 'Неподдерживаемый формат' });
    }

    if (fromFormat === toFormat && !processingOptions.resizeWidth && !processingOptions.resizeHeight && !processingOptions.rotate && !processingOptions.optimizeLevel) {
      return res.status(400).json({ error: 'Выберите хотя бы одну операцию обработки' });
    }

    // Если один файл - возвращаем напрямую
    if (files.length === 1) {
      const convertedBuffer = await convertImage(files[0].buffer, fromFormat, toFormat, quality, processingOptions);
      const mimeType = supportedFormats[toFormat];
      const extension = toFormat === 'jpg' ? 'jpg' : toFormat;
      const fileName = path.parse(files[0].originalname).name + '.' + extension;

      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`
      });

      return res.send(convertedBuffer);
    }

    // Если несколько файлов - создаем ZIP архив
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="converted_images.zip"'
    });

    archive.pipe(res);

    // Конвертируем все файлы и добавляем в архив
    const conversionPromises = files.map(async (file) => {
      try {
        const convertedBuffer = await convertImage(file.buffer, fromFormat, toFormat, quality, processingOptions);
        const extension = toFormat === 'jpg' ? 'jpg' : toFormat;
        const fileName = path.parse(file.originalname).name + '.' + extension;
        archive.append(convertedBuffer, { name: fileName });
      } catch (error) {
        console.error(`Ошибка конвертации файла ${file.originalname}:`, error);
        // Пропускаем проблемный файл, но продолжаем обработку остальных
      }
    });

    await Promise.all(conversionPromises);
    await archive.finalize();

  } catch (error) {
    console.error('Ошибка конвертации:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка при конвертации файлов: ' + error.message });
    }
  }
});

// API для сжатия изображений
app.post('/compress', uploadCompress.array('imageFiles', 50), handleMulterError, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Файлы не загружены' });
    }

    const files = req.files;
    const compressLevel = parseInt(req.query.level) || 80; // 1-100, где 1 = максимальное сжатие (низкое качество), 100 = минимальное сжатие (высокое качество)
    const preserveFormat = req.query.preserveFormat === 'true';

    // compressLevel напрямую используется как качество (1-100)
    // compressLevel 1 = качество 1 (максимальное сжатие)
    // compressLevel 100 = качество 100 (минимальное сжатие)
    const quality = Math.max(1, Math.min(100, compressLevel));

    // Если один файл - возвращаем напрямую
    if (files.length === 1) {
      const file = files[0];
      const detectedFormat = detectFormat(file.mimetype);

      if (!detectedFormat) {
        return res.status(400).json({ error: 'Неподдерживаемый формат изображения' });
      }

      const targetFormat = preserveFormat ? detectedFormat : 'webp';
      const compressedBuffer = await convertImage(file.buffer, detectedFormat, targetFormat, quality, {});

      const mimeType = supportedFormats[targetFormat];
      const extension = targetFormat === 'jpg' ? 'jpg' : targetFormat;
      const originalName = path.parse(file.originalname).name;
      const fileName = `${originalName}_compressed.${extension}`;

      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`
      });

      return res.send(compressedBuffer);
    }

    // Если несколько файлов - создаем ZIP архив
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="compressed_images.zip"'
    });

    archive.pipe(res);

    // Сжимаем все файлы и добавляем в архив
    const compressionPromises = files.map(async (file) => {
      try {
        const detectedFormat = detectFormat(file.mimetype);

        if (!detectedFormat) {
          console.error(`Неподдерживаемый формат: ${file.originalname}`);
          return;
        }

        const targetFormat = preserveFormat ? detectedFormat : 'webp';
        const compressedBuffer = await convertImage(file.buffer, detectedFormat, targetFormat, quality, {});

        const extension = targetFormat === 'jpg' ? 'jpg' : targetFormat;
        const originalName = path.parse(file.originalname).name;
        const fileName = `${originalName}_compressed.${extension}`;

        archive.append(compressedBuffer, { name: fileName });
      } catch (error) {
        console.error(`Ошибка сжатия файла ${file.originalname}:`, error);
        // Пропускаем проблемный файл, но продолжаем обработку остальных
      }
    });

    await Promise.all(compressionPromises);
    await archive.finalize();

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Ошибка при сжатии файлов: ' + error.message });
    }
  }
});

// API для сжатия видео
app.post('/compress-video', uploadVideo.single('videoFile'), handleMulterError, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Видео файл не загружен' });
  }

  const inputFile = req.file.path;
  const outputFileName = `compressed_${req.file.filename}`;
  const outputFile = path.join(__dirname, 'uploads', outputFileName);

  const quality = req.query.quality || 'medium'; // low, medium, high
  const resolution = req.query.resolution || 'original'; // original, 720p, 480p

  let crf = 23; // Default medium
  let preset = 'medium';

  if (quality === 'low') {
    crf = 28;
    preset = 'faster';
  } else if (quality === 'high') {
    crf = 18;
    preset = 'slow';
  }

  let ffmpegCommand = ffmpeg(inputFile)
    .outputOptions([
      `-c:v libx264`,
      `-crf ${crf}`,
      `-preset ${preset}`,
      `-c:a aac`,
      `-b:a 128k`
    ]);

  if (resolution === '720p') {
    ffmpegCommand = ffmpegCommand.size('?x720');
  } else if (resolution === '480p') {
    ffmpegCommand = ffmpegCommand.size('?x480');
  }

  ffmpegCommand
    .on('end', () => {
      res.download(outputFile, (err) => {
        if (err) {
          console.error('Ошибка отправки файла:', err);
        }
        // Удаляем файлы после отправки
        fs.unlink(inputFile, () => { });
        fs.unlink(outputFile, (err) => {
          if (err) console.error('Ошибка удаления output файла:', err);
        });
      });
    })
    .on('error', (err) => {
      logToFile(`ОШИБКА сжатия видео: ${err.message}`);
      fs.unlink(inputFile, () => { });
      if (fs.existsSync(outputFile)) fs.unlink(outputFile, () => { });
      res.status(500).json({ error: 'Ошибка сжатия видео: ' + err.message });
    })
    .save(outputFile);
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
