// Элементы интерфейса
const form = document.getElementById('convertForm');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const filesList = document.getElementById('filesList');
const filesContainer = document.getElementById('filesContainer');
const filesCount = document.getElementById('filesCount');
const clearAllFilesBtn = document.getElementById('clearAllFiles');
const convertBtn = document.getElementById('convertBtn');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const chooseFolderCheckbox = document.getElementById('chooseFolder');
const saveHint = document.getElementById('saveHint');

// Элементы меню
const tabButtons = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarClose = document.getElementById('sidebarClose');
const historyList = document.getElementById('historyList');
const historyTotal = document.getElementById('historyTotal');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const pngQualitySelect = document.getElementById('pngQuality');
const autoClearHistoryCheckbox = document.getElementById('autoClearHistory');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const fromFormatSelect = document.getElementById('fromFormat');
const toFormatSelect = document.getElementById('toFormat');

let selectedFiles = [];
let selectedDirectoryHandle = null;

// Маппинг форматов
const formatMimeTypes = {
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
};

const formatExtensions = {
    webp: '.webp',
    png: '.png',
    jpg: '.jpg',
    jpeg: '.jpeg'
};

// История конвертаций
const HISTORY_KEY = 'converter_history';
const SETTINGS_KEY = 'converter_settings';

// Инициализация
loadSettings();
loadHistory();
setupTabs();
updateFileInputAccept();
updateTitle();

// Обработчики для новых опций обработки
const enableResizeCheckbox = document.getElementById('enableResize');
const resizeControls = document.getElementById('resizeControls');
const enableRotateCheckbox = document.getElementById('enableRotate');
const rotateControls = document.getElementById('rotateControls');
const enableOptimizeCheckbox = document.getElementById('enableOptimize');
const optimizeControls = document.getElementById('optimizeControls');

if (enableResizeCheckbox) {
    enableResizeCheckbox.addEventListener('change', () => {
        resizeControls.style.display = enableResizeCheckbox.checked ? 'block' : 'none';
    });
}

if (enableRotateCheckbox) {
    enableRotateCheckbox.addEventListener('change', () => {
        rotateControls.style.display = enableRotateCheckbox.checked ? 'block' : 'none';
    });
}

if (enableOptimizeCheckbox) {
    enableOptimizeCheckbox.addEventListener('change', () => {
        optimizeControls.style.display = enableOptimizeCheckbox.checked ? 'block' : 'none';
    });
}

// Проверка поддержки File System Access API
if (!('showDirectoryPicker' in window)) {
    chooseFolderCheckbox.disabled = true;
    chooseFolderCheckbox.checked = false;
    saveHint.style.display = 'block';
}

// Обновление accept атрибута при изменении формата
function updateFileInputAccept() {
    const fromFormat = fromFormatSelect.value;
    const mimeType = formatMimeTypes[fromFormat];
    fileInput.setAttribute('accept', mimeType);
}

function updateTitle() {
    // Заголовок теперь просто ImageFlow
    document.querySelector('h1').textContent = 'ImageFlow';
}

fromFormatSelect.addEventListener('change', () => {
    updateFileInputAccept();
    updateTitle();
    // Очищаем выбранные файлы при смене формата
    fileInput.value = '';
    selectedFiles = [];
    updateFilesList();
    
    // Обновляем целевой формат, если он совпадает с исходным
    if (fromFormatSelect.value === toFormatSelect.value) {
        toFormatSelect.value = toFormatSelect.value === 'png' ? 'jpg' : 'png';
    }
});

toFormatSelect.addEventListener('change', () => {
    updateTitle();
    if (fromFormatSelect.value === toFormatSelect.value) {
        showError('Исходный и целевой форматы не могут быть одинаковыми');
        // Возвращаем предыдущее значение
        setTimeout(() => {
            toFormatSelect.value = toFormatSelect.value === 'png' ? 'jpg' : 'png';
            updateTitle();
        }, 100);
    }
});


// Обработка выбора файлов
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const fromFormat = fromFormatSelect.value;
        const files = Array.from(e.target.files);
        
        // Фильтруем файлы по формату
        const validFiles = files.filter(file => {
            const expectedMime = formatMimeTypes[fromFormat];
            return file.type === expectedMime || 
                   file.name.toLowerCase().endsWith(formatExtensions[fromFormat]);
        });
        
        if (validFiles.length === 0) {
            showError(`Пожалуйста, выберите файлы формата ${fromFormat.toUpperCase()}`);
            return;
        }
        
        if (validFiles.length < files.length) {
            showError(`Некоторые файлы не соответствуют формату ${fromFormat.toUpperCase()}`);
        }
        
        handleFilesSelect(validFiles);
    }
});

// Drag and Drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const fromFormat = fromFormatSelect.value;
    const expectedMime = formatMimeTypes[fromFormat];
    const expectedExt = formatExtensions[fromFormat];
    
    const files = Array.from(e.dataTransfer.files).filter(file => {
        return file.type === expectedMime || 
               file.name.toLowerCase().endsWith(expectedExt);
    });
    
    if (files.length === 0) {
        showError(`Пожалуйста, выберите файлы формата ${fromFormat.toUpperCase()}`);
        return;
    }
    
    // Добавляем новые файлы к существующим
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    files.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    selectedFiles = Array.from(fileInput.files);
    
    updateFilesList();
});

// Обработка выбранных файлов
function handleFilesSelect(files) {
    selectedFiles = files;
    updateFilesList();
}

// Обновление списка файлов
function updateFilesList() {
    filesContainer.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        filesList.style.display = 'none';
        convertBtn.disabled = true;
        return;
    }
    
    filesList.style.display = 'block';
    filesCount.textContent = selectedFiles.length;
    convertBtn.disabled = false;
    hideMessages();
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-preview-wrapper">
                <img class="file-preview" src="" alt="Preview" style="display: none;">
            </div>
            <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button type="button" class="remove-file-btn" data-index="${index}" aria-label="Удалить">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        
        // Создаем превью изображения
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = fileItem.querySelector('.file-preview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
        filesContainer.appendChild(fileItem);
    });
    
    // Обработчики удаления файлов
    document.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            removeFile(index);
        });
    });
}

// Удаление файла
function removeFile(index) {
    selectedFiles.splice(index, 1);
    
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
    
    updateFilesList();
}

// Функция очистки всех файлов
function clearAllFiles() {
    fileInput.value = '';
    selectedFiles = [];
    updateFilesList();
}

// Очистка всех файлов
clearAllFilesBtn.addEventListener('click', () => {
    clearAllFiles();
});

// Форматирование размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Отправка формы
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (selectedFiles.length === 0) {
        showError('Пожалуйста, выберите файлы');
        return;
    }
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('imageFiles', file);
    });
    
    // Показываем загрузку
    convertBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    hideMessages();
    
    try {
        const quality = getPngQuality();
        const fromFormat = fromFormatSelect.value;
        const toFormat = toFormatSelect.value;
        
        // Собираем параметры обработки
        let queryParams = `quality=${quality}&from=${fromFormat}&to=${toFormat}`;
        
        const enableResizeEl = document.getElementById('enableResize');
        const enableRotateEl = document.getElementById('enableRotate');
        const enableOptimizeEl = document.getElementById('enableOptimize');
        
        if (enableResizeEl && enableResizeEl.checked) {
            const resizeWidth = document.getElementById('resizeWidth').value;
            const resizeHeight = document.getElementById('resizeHeight').value;
            const maintainAspectRatio = document.getElementById('maintainAspectRatio').checked;
            
            if (resizeWidth) queryParams += `&resizeWidth=${resizeWidth}`;
            if (resizeHeight) queryParams += `&resizeHeight=${resizeHeight}`;
            if (maintainAspectRatio) queryParams += `&maintainAspectRatio=true`;
        }
        
        if (enableRotateEl && enableRotateEl.checked) {
            const rotateAngle = document.getElementById('rotateAngle').value;
            if (rotateAngle) queryParams += `&rotate=${rotateAngle}`;
        }
        
        if (enableOptimizeEl && enableOptimizeEl.checked) {
            const optimizeLevel = document.getElementById('optimizeLevel').value;
            if (optimizeLevel) queryParams += `&optimizeLevel=${optimizeLevel}`;
        }
        
        const response = await fetch(`/convert?${queryParams}`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при конвертации');
        }
        
        // Получаем файл (PNG или ZIP)
        const blob = await response.blob();
        
        // Проверяем, нужно ли выбирать папку
        if (chooseFolderCheckbox.checked && 'showDirectoryPicker' in window) {
            try {
                // Выбираем папку для сохранения
                const directoryHandle = await window.showDirectoryPicker();
                await saveToDirectory(directoryHandle, blob, selectedFiles.length === 1);
                
                const message = selectedFiles.length === 1 
                    ? 'Файл успешно сконвертирован и сохранен!'
                    : `${selectedFiles.length} файлов успешно сконвертированы и сохранены!`;
                showSuccess(message);
                
                // Добавляем в историю
                const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                addToHistory(selectedFiles.length, totalSize);
                
                // Очищаем список файлов после успешной конвертации
                clearAllFiles();
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Ошибка при выборе папки:', error);
                    // Fallback на стандартное скачивание
                    downloadFile(blob, selectedFiles.length === 1);
                    showSuccess('Файл сохранен в папку загрузок');
                    
                    // Добавляем в историю
                    const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
                    addToHistory(selectedFiles.length, totalSize);
                    
                    // Очищаем список файлов после успешной конвертации
                    clearAllFiles();
                }
            }
        } else {
            // Стандартное скачивание
            downloadFile(blob, selectedFiles.length === 1);
            
            const message = selectedFiles.length === 1 
                ? 'Файл успешно сконвертирован и загружен!'
                : `${selectedFiles.length} файлов успешно сконвертированы и загружены!`;
            showSuccess(message);
            
            // Добавляем в историю
            const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
            addToHistory(selectedFiles.length, totalSize);
            
            // Очищаем список файлов после успешной конвертации
            clearAllFiles();
        }
        
    } catch (error) {
        showError(error.message || 'Произошла ошибка при конвертации');
    } finally {
        // Скрываем загрузку
        convertBtn.disabled = false;
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
}

function hideMessages() {
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
}

// Сохранение файла стандартным способом
function downloadFile(blob, isSingle) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
        const toFormat = toFormatSelect.value;
        const toExt = formatExtensions[toFormat];
        
        if (isSingle) {
            const originalName = selectedFiles[0].name;
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
            a.download = nameWithoutExt + toExt;
        } else {
            a.download = `converted_images.${toFormat === 'jpg' ? 'zip' : 'zip'}`;
        }
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Сохранение в выбранную папку (File System Access API)
async function saveToDirectory(directoryHandle, blob, isSingle) {
        if (isSingle) {
            // Сохраняем один файл
            const toFormat = toFormatSelect.value;
            const toExt = formatExtensions[toFormat];
            const originalName = selectedFiles[0].name;
            const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
            const fileName = nameWithoutExt + toExt;
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
        // Для нескольких файлов сохраняем ZIP
        // В будущем можно добавить распаковку, но пока сохраняем как ZIP
        const fileHandle = await directoryHandle.getFileHandle('converted_images.zip', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }
}

// Работа с вкладками
function setupTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
            
            // Закрываем меню на мобильных после выбора
            if (window.innerWidth <= 768) {
                setTimeout(() => closeMobileMenu(), 200);
            }
        });
    });
    
    // Обработка кнопки меню для мобильных
    if (menuToggle) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });
    }
    
    // Обработка кнопки закрытия меню
    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => {
            closeMobileMenu();
        });
    }
    
    // Закрытие меню при клике на затемнение
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            closeMobileMenu();
        });
    }
    
    // Закрытие меню при клике вне его на мобильных
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar && menuToggle) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target) && sidebar.classList.contains('open')) {
                closeMobileMenu();
            }
        }
    });
    
    // Обработка изменения размера окна
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Закрываем меню при переходе с мобильного на десктоп
            if (window.innerWidth > 768 && sidebar) {
                closeMobileMenu();
            }
        }, 250);
    });
}

function toggleMobileMenu() {
    if (sidebar && menuToggle && sidebarOverlay) {
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }
}

function openMobileMenu() {
    if (sidebar && menuToggle && sidebarOverlay) {
        sidebar.classList.add('open');
        menuToggle.classList.add('active');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMobileMenu() {
    if (sidebar && menuToggle && sidebarOverlay) {
        sidebar.classList.remove('open');
        menuToggle.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function switchTab(tabName) {
    // Убираем активный класс со всех кнопок и вкладок
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // Активируем выбранную вкладку
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-tab`);
    
    if (activeBtn && activeContent) {
        activeBtn.classList.add('active');
        activeContent.classList.add('active');
        activeContent.style.display = 'block';
    }
    
    // Обновляем историю при открытии вкладки
    if (tabName === 'history') {
        loadHistory();
    }
}

// Работа с историей
function addToHistory(filesCount, totalSize) {
    const history = getHistory();
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        filesCount: filesCount,
        totalSize: totalSize,
        files: selectedFiles.map(f => ({
            name: f.name,
            size: f.size
        }))
    };
    
    history.unshift(entry);
    
    // Ограничиваем историю 100 записями
    if (history.length > 100) {
        history.splice(100);
    }
    
    // Автоматическая очистка старых записей
    if (autoClearHistoryCheckbox.checked) {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const filteredHistory = history.filter(entry => {
            return new Date(entry.date).getTime() > thirtyDaysAgo;
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(filteredHistory));
    } else {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
}

function getHistory() {
    try {
        const history = localStorage.getItem(HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch (e) {
        return [];
    }
}

function loadHistory() {
    const history = getHistory();
    historyTotal.textContent = history.length;
    
    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-history">История пуста</p>';
        return;
    }
    
    historyList.innerHTML = history.map(entry => {
        const date = new Date(entry.date);
        const dateStr = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const totalSize = entry.files.reduce((sum, f) => sum + (f.size || 0), 0);
        const sizeStr = formatFileSize(totalSize);
        
        return `
            <div class="history-item">
                <div class="history-item-info">
                    <div class="history-item-name">
                        ${entry.filesCount === 1 ? entry.files[0]?.name || 'Файл' : `${entry.filesCount} файлов`}
                    </div>
                    <div class="history-item-meta">
                        <span>${dateStr}</span>
                        <span class="history-item-count">${entry.filesCount} ${entry.filesCount === 1 ? 'файл' : 'файлов'}</span>
                        <span>${sizeStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function clearHistory() {
    if (confirm('Вы уверены, что хотите очистить всю историю?')) {
        localStorage.removeItem(HISTORY_KEY);
        loadHistory();
    }
}

// Работа с настройками
function loadSettings() {
    try {
        const settings = localStorage.getItem(SETTINGS_KEY);
        if (settings) {
            const parsed = JSON.parse(settings);
            if (parsed.pngQuality) {
                pngQualitySelect.value = parsed.pngQuality;
            }
            if (parsed.autoClearHistory !== undefined) {
                autoClearHistoryCheckbox.checked = parsed.autoClearHistory;
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

function saveSettings() {
    const settings = {
        pngQuality: parseInt(pngQualitySelect.value),
        autoClearHistory: autoClearHistoryCheckbox.checked
    };
    
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        showSuccess('Настройки сохранены!');
        setTimeout(() => {
            if (successMessage) {
                successMessage.style.display = 'none';
            }
        }, 2000);
    } catch (e) {
        showError('Ошибка сохранения настроек');
    }
}

function getPngQuality() {
    try {
        const settings = localStorage.getItem(SETTINGS_KEY);
        if (settings) {
            const parsed = JSON.parse(settings);
            return parsed.pngQuality || 90;
        }
    } catch (e) {
        return 90;
    }
    return 90;
}

// Обработчики событий
clearHistoryBtn.addEventListener('click', clearHistory);
saveSettingsBtn.addEventListener('click', saveSettings);
