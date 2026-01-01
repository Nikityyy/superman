// CONFIGURATION
const CONFIG = {
    particleCount: 150,
    brushSize: 200,
    smoothing: 0.12,
    idleTimeout: 400,
    images: {
        clark: 'images/clark-kent.avif',
        superman: 'images/kal-el.avif',
        logo: 'images/superman-logo.avif'
    }
};

// --- 1. FORCE SCROLL TO TOP ON REFRESH ---
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const logo = document.getElementById('logo');
const canvasWrapper = document.getElementById('canvas-wrapper');
const scrollTrack = document.querySelector('.scroll-height');
const contentSection = document.querySelector('.content-section');
const parallaxLogo = document.getElementById('parallaxLogo');
const progressBar = document.getElementById('progressBar');

const horizSection = document.querySelector('.horiz-container');
const horizTrack = document.getElementById('track');
const parallaxImages = document.querySelectorAll('.parallax-img');

// Duel Elements
const duelSection = document.querySelector('.duel-section');
const duelImgKal = document.querySelector('.img-kal');
const duelImgLex = document.querySelector('.img-lex');
const duelRows = document.querySelectorAll('.duel-big-row');
const duelScribbles = document.querySelectorAll('.duel-scribble');

const clarkBgCanvas = document.createElement('canvas');
const clarkBgCtx = clarkBgCanvas.getContext('2d', { alpha: false });
const superBgCanvas = document.createElement('canvas');
const superBgCtx = superBgCanvas.getContext('2d', { alpha: false });
const maskCanvas = document.createElement('canvas');
const maskCtx = maskCanvas.getContext('2d');
const brushCanvas = document.createElement('canvas');
const brushCtx = brushCanvas.getContext('2d');

let width, height;
let canvasRect = { left: 0, top: 0 };
const assets = {};

const mouse = { x: -5000, y: -5000, tx: -5000, ty: -5000 };
const particles = [];
let isMouseActive = false;
let idleTimer = null;
let currentBrushSize = 0;
let scrollProgress = 0;
let lenis;

// --- 2. IMPROVED PRELOADING LOGIC ---
function startPreloading() {
    // Lock body scroll during loading
    document.body.style.overflow = 'hidden';

    const minDuration = 1000; // Minimum 1 second

    // Collect URLs from CONFIG
    const configUrls = Object.keys(CONFIG.images).map(key => ({
        key: key,
        url: CONFIG.images[key],
        isConfig: true
    }));

    // Collect URLs from DOM <img> tags
    const domImages = Array.from(document.querySelectorAll('img'));
    const domUrls = domImages.map(img => ({
        url: img.src,
        isConfig: false
    }));

    // Merge and deduplicate based on URL string
    const allAssets = [...configUrls, ...domUrls];
    // Create a Set to track unique URLs to avoid loading the same image twice
    const uniqueUrls = new Set();
    const uniqueAssetsToLoad = allAssets.filter(asset => {
        if (!asset.url || uniqueUrls.has(asset.url)) return false;
        uniqueUrls.add(asset.url);
        return true;
    });

    let imagesLoadedCount = 0;
    const totalImages = uniqueAssetsToLoad.length;

    // Create Promises for every image
    const imagePromises = uniqueAssetsToLoad.map(asset => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = asset.url;

            img.onload = () => {
                // If it's a config image, store it in the assets object for Canvas use
                if (asset.isConfig) {
                    assets[asset.key] = img;
                }
                imagesLoadedCount++;
                updateProgress(imagesLoadedCount, totalImages);
                resolve();
            };

            img.onerror = () => {
                console.warn('Failed to load:', asset.url);
                // Resolve anyway so the loader doesn't get stuck
                imagesLoadedCount++;
                updateProgress(imagesLoadedCount, totalImages);
                resolve();
            };
        });
    });

    const fontPromise = document.fonts.ready;
    const timePromise = new Promise(resolve => setTimeout(resolve, minDuration));

    // Wait for Images + Fonts + Time
    Promise.all([
        Promise.all(imagePromises),
        fontPromise,
        timePromise
    ]).then(() => {
        finishLoading();
    });
}

function updateProgress(loaded, total) {
    if (progressBar) {
        const percent = Math.round((loaded / total) * 100);
        progressBar.style.width = `${percent}%`;
    }
}

function finishLoading() {
    // Ensure bar is full visually
    if (progressBar) progressBar.style.width = '100%';

    setTimeout(() => {
        // Force scroll to top again right before init
        window.scrollTo(0, 0);

        // Remove scroll lock
        document.body.style.overflow = '';

        // Hide Loader
        document.body.classList.add('loaded');

        // Start Logic
        init();
    }, 500); // Small buffer to let the progress bar animation finish
}

function init() {
    lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        smooth: true,
    });

    // Ensure Lenis starts at top
    lenis.scrollTo(0, { immediate: true });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    createBrushTip();
    resize();
    prepareBackgrounds();

    window.addEventListener('resize', resize);

    VANTA.CLOUDS({
        el: ".horiz-sticky",
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        skyColor: 0x2b6fb5,       // Classic Superman Blue
        cloudColor: 0xdcebf7,     // White/Light Grey Clouds
        cloudShadowColor: 0x183655, // Darker Blue shadows
        sunColor: 0xffe600,       // Yellow Sun accent
        sunGlareColor: 0xff3838,  // Reddish glare
        sunlightColor: 0xffffff,
        speed: 1.0                // Movement speed
    });

    lenis.on('scroll', (e) => {
        handleScroll(e.scroll);
        updateCanvasRect();
        updateParallax(e.scroll);
        updateHorizontalScroll();
        updateDuelScroll();
    });

    document.addEventListener('mouseout', () => {
        isMouseActive = false;
        clearTimeout(idleTimer);
    });

    window.addEventListener('mousemove', (e) => {
        onMouseMove(e.clientX, e.clientY);
    });

    window.addEventListener('touchmove', (e) => {
        onMouseMove(e.touches[0].clientX, e.touches[0].clientY);
    });

    // Initial render call
    handleScroll(0);
    updateHorizontalScroll();
    updateDuelScroll();
    requestAnimationFrame(render);
}

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width; canvas.height = height;
    clarkBgCanvas.width = width; clarkBgCanvas.height = height;
    superBgCanvas.width = width; superBgCanvas.height = height;
    maskCanvas.width = width; maskCanvas.height = height;
    updateCanvasRect();
    if (assets.clark && assets.superman) prepareBackgrounds();
}

function updateCanvasRect() {
    const rect = canvas.getBoundingClientRect();
    canvasRect.left = rect.left;
    canvasRect.top = rect.top;
    canvasRect.width = rect.width;
    canvasRect.height = rect.height;
}

function prepareBackgrounds() {
    if (assets.clark) {
        drawImageProp(clarkBgCtx, assets.clark, 0, 0, width, height);
        clarkBgCtx.globalCompositeOperation = 'saturation';
        clarkBgCtx.fillStyle = 'black';
        clarkBgCtx.fillRect(0, 0, width, height);
        clarkBgCtx.globalCompositeOperation = 'multiply';
        clarkBgCtx.fillStyle = '#444';
        clarkBgCtx.fillRect(0, 0, width, height);
        clarkBgCtx.globalCompositeOperation = 'source-over';
    } else {
        clarkBgCtx.fillStyle = '#222';
        clarkBgCtx.fillRect(0, 0, width, height);
    }
    if (assets.superman) {
        superBgCtx.clearRect(0, 0, width, height);
        drawImageProp(superBgCtx, assets.superman, 0, 0, width, height);
        superBgCtx.fillStyle = 'rgba(0,0,0,0.2)';
        superBgCtx.fillRect(0, 0, width, height);
    } else {
        superBgCtx.fillStyle = '#0055aa';
        superBgCtx.fillRect(0, 0, width, height);
    }
}

function drawImageProp(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5) {
    const iw = img.width, ih = img.height;
    const r = Math.min(w / iw, h / ih);
    let nw = iw * r, nh = ih * r;
    let ar = 1;
    if (nw < w) ar = w / nw;
    if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh;
    nw *= ar; nh *= ar;
    let cw = iw / (nw / w); let ch = ih / (nh / h);
    let cx = (iw - cw) * offsetX; let cy = (ih - ch) * offsetY;
    if (cx < 0) cx = 0; if (cy < 0) cy = 0;
    if (cw > iw) cw = iw; if (ch > ih) ch = ih;
    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

function createBrushTip() {
    const s = CONFIG.brushSize * 2;
    brushCanvas.width = s; brushCanvas.height = s;
    const grad = brushCtx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    brushCtx.fillStyle = grad;
    brushCtx.beginPath();
    brushCtx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    brushCtx.fill();
}

function onMouseMove(clientX, clientY) {
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const mX = (clientX - canvasRect.left) * scaleX;
    const mY = (clientY - canvasRect.top) * scaleY;
    if (!isMouseActive) {
        mouse.x = mX; mouse.y = mY;
        currentBrushSize = 0;
    }
    mouse.tx = mX; mouse.ty = mY;
    isMouseActive = true;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { isMouseActive = false; }, CONFIG.idleTimeout);
}

function handleScroll(scrollTop) {
    const maxScroll = scrollTrack.offsetHeight - window.innerHeight;
    const rawProgress = scrollTop / maxScroll;
    scrollProgress = Math.max(0, Math.min(1, rawProgress));
    updateLayoutEffects(scrollProgress);
}

function updateParallax(scrollTop) {
    if (!parallaxLogo) return;
    const rect = contentSection.getBoundingClientRect();
    const speed = -0.15;
    const centerOffset = (window.innerHeight / 2) - (rect.top + rect.height / 2);
    parallaxLogo.style.transform = `translate(-50%, calc(-50% + ${centerOffset * speed}px))`;
}

function updateHorizontalScroll() {
    if (!horizSection || !horizTrack) return;

    const rect = horizSection.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const scrollDist = horizSection.offsetHeight - viewportH;
    const maxTranslate = horizTrack.scrollWidth - viewportW;

    let rawProgress = -rect.top / scrollDist;
    const p = Math.max(0, Math.min(1, rawProgress));

    let x = 0;
    if (rect.top > 0) {
        const entranceFactor = 1 - (rect.top / viewportH);
        const safeEntrance = Math.max(0, Math.min(1, entranceFactor));
        x = (viewportW * 0.3) * (1 - safeEntrance);
    } else {
        x = - (maxTranslate * p);
    }

    horizTrack.style.transform = `translateX(${x}px)`;

    if (parallaxImages.length) {
        parallaxImages.forEach(img => {
            // Simple subtle zoom effect
            img.style.transform = `scale(1.1)`;
        });
    }
}

function updateDuelScroll() {
    if (!duelSection) return;

    const rect = duelSection.getBoundingClientRect();
    const viewH = window.innerHeight;
    const sectionCenter = rect.top + (rect.height / 2);
    const viewCenter = viewH / 2;
    const dist = sectionCenter - viewCenter;
    let norm = dist / viewH;
    let entranceProgress = Math.max(0, Math.min(1, norm));

    const slideOffset = entranceProgress * 100;

    if (duelImgKal) duelImgKal.style.transform = `translateX(-${slideOffset}%)`;
    if (duelImgLex) duelImgLex.style.transform = `translateX(${slideOffset}%)`;

    const safeOpacity = 1 - entranceProgress;
    const textY = entranceProgress * 150;

    duelRows.forEach(row => {
        row.style.opacity = safeOpacity;
        row.style.transform = `translateY(${textY}px)`;
    });

    duelScribbles.forEach(sc => {
        sc.style.opacity = Math.max(0, (safeOpacity - 0.2) * 1.5);
    });
}

function updateLayoutEffects(p) {
    const scale = 1 - (p * 0.5);
    const radius = p * 30;
    let borderW = p * 15;
    if (p < 0.01) borderW = 0;
    canvasWrapper.style.transform = `scale(${scale})`;
    canvas.style.borderRadius = `${radius}px`;
    canvas.style.border = `${borderW.toFixed(1)}px solid #ffffff`;
    canvas.style.boxShadow = `0px 20px 50px rgba(0,0,0, ${p * 0.8})`;
    if (p > 0.5) logo.classList.add('is-revealed');
    else if (!isMouseActive) logo.classList.remove('is-revealed');
}

class Particle {
    constructor(x, y, size) {
        this.x = x; this.y = y; this.size = size; this.life = 1.0;
    }
    update() { this.life *= 0.96; this.size *= 0.98; }
}

function updatePhysics() {
    const dx = mouse.tx - mouse.x;
    const dy = mouse.ty - mouse.y;
    mouse.x += dx * CONFIG.smoothing;
    mouse.y += dy * CONFIG.smoothing;
    if (scrollProgress <= 0.8 && currentBrushSize > 10) {
        if (mouse.x < 300 && mouse.y < 150) logo.classList.add('is-revealed');
        else logo.classList.remove('is-revealed');
    }
    const targetSize = isMouseActive ? CONFIG.brushSize : 0;
    currentBrushSize += (targetSize - currentBrushSize) * 0.1;
    if (currentBrushSize > 0.5) {
        const dist = Math.hypot(dx, dy);
        const steps = Math.ceil(dist / (currentBrushSize * 0.25));
        if (dist > 1) {
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                particles.push(new Particle(mouse.x - (dx * (1 - CONFIG.smoothing)) * (1 - t), mouse.y - (dy * (1 - CONFIG.smoothing)) * (1 - t), currentBrushSize));
            }
        } else {
            particles.push(new Particle(mouse.x, mouse.y, currentBrushSize));
        }
    }
    if (particles.length > CONFIG.particleCount) particles.splice(0, particles.length - CONFIG.particleCount);
}

function render() {
    updatePhysics();
    ctx.drawImage(clarkBgCanvas, 0, 0);
    if (scrollProgress > 0.01) {
        ctx.globalAlpha = scrollProgress;
        ctx.drawImage(superBgCanvas, 0, 0);
        ctx.globalAlpha = 1.0;
    }
    if (particles.length > 0) {
        maskCtx.clearRect(0, 0, width, height);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update();
            if (p.life < 0.01) { particles.splice(i, 1); continue; }
            maskCtx.globalAlpha = p.life;
            maskCtx.drawImage(brushCanvas, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
        maskCtx.globalAlpha = 1.0;
        maskCtx.globalCompositeOperation = 'source-in';
        maskCtx.drawImage(superBgCanvas, 0, 0);
        maskCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(maskCanvas, 0, 0);
    }
    requestAnimationFrame(render);
}

startPreloading();
