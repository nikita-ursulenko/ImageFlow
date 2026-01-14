const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = 5030;

// Поддерживаемые форматы
const supportedFormats = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg'
};

// Настройка multer для загрузки файлов в память
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

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
