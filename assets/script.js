// --- CONFIGURATION ---
const CONFIG = {
    canvas: {
        particleCount: 75,
        particleCountMobile: 30,
        brushSize: 200,
        smoothing: 0.12,
        idleTimeout: 400
    },
    images: {
        clark: 'images/clark-kent.avif',
        superman: 'images/kal-el.avif',
        logo: 'images/superman-logo.avif'
    },
    colors: {
        sky: 0x2b6fb5,
        cloud: 0xdcebf7,
        shadow: 0x183655,
        sun: 0xffe600,
        glare: 0xff3838,
        archiveNode: 0xffffff,
        archiveLine: 0xdcebf7
    },
    archive: {
        count: 40,
        countMobile: 20,
        connectionDist: 150,
        speed: 0.35,
        diamondChance: 0.6
    }
};

// --- DOM CACHE ---
const DOM = {
    loader: {
        el: document.getElementById('appLoader'),
        bar: document.getElementById('progressBar')
    },
    canvas: {
        main: document.getElementById('mainCanvas'),
        wrapper: document.getElementById('canvasContainer'),
        logo: document.getElementById('heroLogo'),
        scrollTrack: document.querySelector('.hero-scroll-wrapper')
    },
    transition: {
        section: document.querySelector('.transition-section'),
        logo: document.getElementById('parallaxLogo')
    },
    timeline: {
        section: document.querySelector('.timeline-section'),
        sticky: document.getElementById('vantaCanvas'),
        track: document.getElementById('horizontalTrack'),
        images: document.querySelectorAll('.parallax-img')
    },
    rivalry: {
        section: document.querySelector('.rivalry-section'),
        imgKal: document.querySelector('.rivalry-img--left'),
        imgLex: document.querySelector('.rivalry-img--right'),
        rows: document.querySelectorAll('.rivalry-text-row'),
        scribbles: document.querySelectorAll('.rivalry-scribble')
    },
    archive: {
        bg: document.getElementById('phantomZone'),
        cards: document.querySelectorAll('.archive-entry'),
        header: document.querySelector('.archive-header')
    },
    newspaper: {
        section: document.querySelector('.newspaper-section'),
        sheet: document.querySelector('.daily-planet-sheet')
    }
};

// --- STATE MANAGEMENT ---
const state = {
    width: 0,
    height: 0,
    canvasRect: { left: 0, top: 0 },
    mouse: { x: -5000, y: -5000, tx: -5000, ty: -5000, active: false },
    scrollProgress: 0,
    brushSize: 0,
    assets: {},
    particles: [],
    idleTimer: null,
    lenis: null,
    vanta: null,
    archiveRequestFrame: null
};

// --- OFFSCREEN CANVASES ---
const ctxs = {
    main: DOM.canvas.main.getContext('2d', { alpha: false }),
    clark: document.createElement('canvas').getContext('2d', { alpha: false }),
    super: document.createElement('canvas').getContext('2d', { alpha: false }),
    mask: document.createElement('canvas').getContext('2d'),
    brush: document.createElement('canvas').getContext('2d')
};

// --- INITIALIZATION FLOW ---

function init() {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    startPreloading().then(() => {
        setupApp();
        setupObservers();
        animate();
    });
}

// Helper to load external scripts
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject; // Reject promise on error
        document.head.appendChild(script);
    });
}

// Helper to load Google Fonts
function loadGoogleFonts() {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Anton:wght@700&family=Sedgwick+Ave+Display:wght@400&family=Oswald:wght@700&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=UnifrakturMaguntia&display=swap';
        link.onload = resolve;
        link.onerror = reject; // Reject promise on error
        document.head.appendChild(link);
    });
}

function loadVantaDependencies() {
    // 1. Load Three.js first
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js')
        .then(() => {
            // Check if Three.js is actually in the window
            if (!window.THREE) {
                throw new Error("Three.js loaded but window.THREE is missing");
            }
            // 2. Load Vanta ONLY after Three.js is ready
            return loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.clouds.min.js');
        });
}


function startPreloading() {
    document.body.style.overflow = 'hidden';

    const fontPromise = loadGoogleFonts();
    const lenisPromise = loadScript('https://unpkg.com/@studio-freight/lenis@1.0.33/dist/lenis.min.js');

    // Initialize marquee after fonts are loaded
    fontPromise.then(() => initMarqueeSystem());

    // Load main image assets (clark, superman, logo)
    const imageKeys = Object.keys(CONFIG.images);
    const assetPromises = imageKeys.map(key => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = CONFIG.images[key];
            img.onload = () => { state.assets[key] = img; resolve(); };
            img.onerror = () => { console.warn(`Failed to load asset: ${CONFIG.images[key]}`); resolve(); }; // Resolve on error, don't block
        });
    });

    // Decode all other DOM images for robust preloading
    const domImages = Array.from(document.querySelectorAll('img'));
    const decodePromises = domImages.map(img => {
        return img.decode().catch(error => {
            console.warn(`Failed to decode image: ${img.src || 'unknown'}`, error);
            // Fallback for decode failure: use onload/onerror, resolve after a timeout if those don't fire quickly
            return new Promise(resolve => {
                const timer = setTimeout(() => {
                    console.warn(`Image decode/load fallback timed out for: ${img.src || 'unknown'}`);
                    resolve();
                }, 2000); // Max 2 seconds for fallback load
                img.onload = () => { clearTimeout(timer); resolve(); };
                img.onerror = () => { clearTimeout(timer); console.warn(`Image load failed for: ${img.src || 'unknown'}`); resolve(); };
                // If the image is already complete (e.g., cached), onload/onerror might not fire immediately
                if (img.complete) { clearTimeout(timer); resolve(); }
            });
        });
    });

    // Vanta initialization promise: depends on vantaDepsPromise
    const vantaInitPromise = loadVantaDependencies()
        .then(() => {
            // Add a small buffer to ensure scripts are parsed
            return new Promise(resolve => setTimeout(resolve, 100));
        })
        .then(() => {
            return new Promise(resolve => {
                // Check if the library and the element exist
                if (window.VANTA && DOM.timeline.sticky) {
                    try {
                        state.vanta = VANTA.CLOUDS({
                            el: DOM.timeline.sticky,
                            mouseControls: true,
                            touchControls: true,
                            gyroControls: false,
                            minHeight: 200.00,
                            minWidth: 200.00,
                            skyColor: CONFIG.colors.sky,
                            cloudColor: CONFIG.colors.cloud,
                            cloudShadowColor: CONFIG.colors.shadow,
                            sunColor: CONFIG.colors.sun,
                            sunGlareColor: CONFIG.colors.glare,
                            sunlightColor: 0xffffff,
                            speed: 0.3
                        });
                        console.log("Vanta initialized successfully.");
                    } catch (e) {
                        console.error("Vanta threw an error during init:", e);
                    }
                } else {
                    console.warn("VANTA object or target element missing.");
                }
                resolve(); // Always resolve so loader doesn't hang
            });
        })
        .catch(error => {
            console.error("Vanta dependency loading failed:", error);
            return Promise.resolve(); // Continue application even if background fails
        });

    const allPromises = [
        fontPromise,
        lenisPromise,
        ...assetPromises,
        ...decodePromises,
        vantaInitPromise,
        document.fonts.ready
    ];

    let loaded = 0;
    const total = allPromises.length;

    allPromises.forEach(p => p.then(() => {
        loaded++;
        if (DOM.loader.bar) {
            const pct = Math.round((loaded / total) * 100);
            DOM.loader.bar.style.width = `${pct}%`;
        }
    }).catch(e => {
        loaded++; // Increment anyway so bar finishes
        if (DOM.loader.bar) DOM.loader.bar.style.width = `${Math.round((loaded / total) * 100)}%`;
    }));

    const minTimePromise = new Promise(r => setTimeout(r, 1500));

    return Promise.all([Promise.all(allPromises), minTimePromise]).then(() => {
        if (DOM.loader.bar) DOM.loader.bar.style.width = '100%';
        document.body.classList.add('loaded');
        document.body.style.overflow = '';
        handleResize();
    });
}

function setupApp() {
    state.lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        smooth: true
    });

    createBrushTip();
    prepareBackgrounds();
    generatePhantomZone();
    setupLinks();

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', e => handleMouseMove(e.touches[0]));
    document.addEventListener('mouseout', () => {
        state.mouse.active = false;
        clearTimeout(state.idleTimer);
    });

    handleResize();
}

// --- RENDERING & LOGIC ---

function animate(time) {
    state.lenis.raf(time);
    updateScrollDrivenLogic();
    updateCanvasPhysics();
    renderCanvas();
    requestAnimationFrame(animate);
}

function updateScrollDrivenLogic() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    // 1. Hero Wipe
    if (DOM.canvas.scrollTrack) {
        const max = DOM.canvas.scrollTrack.offsetHeight - window.innerHeight;
        state.scrollProgress = Math.max(0, Math.min(1, scrollTop / max));
        updateHeroVisuals(state.scrollProgress);
    }

    // 2. Parallax Logo
    if (DOM.transition.logo) {
        const rect = DOM.transition.section.getBoundingClientRect();
        const offset = (window.innerHeight / 2) - (rect.top + rect.height / 2);
        DOM.transition.logo.style.transform = `translate(-50%, calc(-50% + ${offset * -0.15}px))`;
    }

    // 3. Horizontal Timeline
    if (DOM.timeline.section) {
        updateTimelineScroll();
    }

    // 4. Rivalry Slide
    if (DOM.rivalry.section) {
        updateRivalryScroll();
    }

    // NOTE: Newspaper tilt logic removed to keep it flat/fullscreen
}

function updateHeroVisuals(progress) {
    const scale = 1 - (progress * 0.5);
    const radius = progress * 30;
    const borderW = progress < 0.01 ? 0 : progress * 15;

    DOM.canvas.wrapper.style.transform = `scale(${scale})`;
    DOM.canvas.main.style.borderRadius = `${radius}px`;
    DOM.canvas.main.style.border = `${borderW.toFixed(1)}px solid #ffffff`;
    DOM.canvas.main.style.boxShadow = `0px 20px 50px rgba(0,0,0, ${progress * 0.8})`;

    const shouldReveal = progress > 0.5 || (state.scrollProgress <= 0.8 && state.brushSize > 10 && state.mouse.x < 300 && state.mouse.y < 150);

    if (shouldReveal) DOM.canvas.logo.classList.add('is-revealed');
    else if (!state.mouse.active) DOM.canvas.logo.classList.remove('is-revealed');
}

function updateTimelineScroll() {
    // Safety check
    if (!DOM.timeline.section || !DOM.timeline.track) return;

    const rect = DOM.timeline.section.getBoundingClientRect();
    const vpW = state.width;
    const vpH = state.height;

    // Calculate total scrollable distance (height of section minus 1 viewport)
    const dist = DOM.timeline.section.offsetHeight - vpH;

    // Calculate how far the horizontal track needs to move
    // We subtract vpW because we want the end of the track to hit the right side of screen
    const maxTrans = DOM.timeline.track.scrollWidth - vpW;

    // 0 to 1 progress based on scroll position
    let progress = -rect.top / dist;
    progress = Math.max(0, Math.min(1, progress));

    let x = 0;

    // Logic: If section hasn't hit top, keep it centered or static. 
    // Once sticky kicks in (rect.top <= 0), move it.
    if (rect.top > 0) {
        // Optional: slight entry animation
        x = 0;
    } else {
        x = - (maxTrans * progress);
    }

    DOM.timeline.track.style.transform = `translateX(${x}px)`;

    // Disable parallax scale on mobile for performance
    const scale = window.innerWidth < 768 ? 1.0 : 1.1;
    DOM.timeline.images.forEach(img => img.style.transform = `scale(${scale})`);
}

function updateRivalryScroll() {
    const rect = DOM.rivalry.section.getBoundingClientRect();
    const center = rect.top + (rect.height / 2);
    const viewCenter = state.height / 2;

    const norm = (center - viewCenter) / state.height;
    const entrance = Math.max(0, Math.min(1, norm));
    const offset = entrance * 100;

    if (DOM.rivalry.imgKal) DOM.rivalry.imgKal.style.transform = `translateX(-${offset}%)`;
    if (DOM.rivalry.imgLex) DOM.rivalry.imgLex.style.transform = `translateX(${offset}%)`;

    const opacity = 1 - entrance;
    const textY = entrance * 150;

    DOM.rivalry.rows.forEach(row => {
        row.style.opacity = opacity;
        row.style.transform = `translateY(${textY}px)`;
    });

    DOM.rivalry.scribbles.forEach(sc => {
        sc.style.opacity = Math.max(0, (opacity - 0.2) * 1.5);
    });
}

function updateCanvasPhysics() {
    const dx = state.mouse.tx - state.mouse.x;
    const dy = state.mouse.ty - state.mouse.y;
    state.mouse.x += dx * CONFIG.canvas.smoothing;
    state.mouse.y += dy * CONFIG.canvas.smoothing;

    const targetSize = state.mouse.active ? CONFIG.canvas.brushSize : 0;
    state.brushSize += (targetSize - state.brushSize) * 0.1;

    const maxParticles = state.width < 768 ? CONFIG.canvas.particleCountMobile : CONFIG.canvas.particleCount;

    if (state.brushSize > 0.5) {
        const moveDist = Math.hypot(dx, dy);
        const steps = Math.ceil(moveDist / (state.brushSize * 0.25));

        if (moveDist > 1) {
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                spawnParticle(
                    state.mouse.x - (dx * (1 - CONFIG.canvas.smoothing)) * (1 - t),
                    state.mouse.y - (dy * (1 - CONFIG.canvas.smoothing)) * (1 - t)
                );
            }
        } else {
            spawnParticle(state.mouse.x, state.mouse.y);
        }
    }

    if (state.particles.length > maxParticles) {
        state.particles.splice(0, state.particles.length - maxParticles);
    }
}

function spawnParticle(x, y) {
    state.particles.push({
        x: x,
        y: y,
        size: state.brushSize,
        life: 1.0
    });
}

function renderCanvas() {
    const { main, mask, brush, clark, super: sup } = ctxs;
    const w = state.width;
    const h = state.height;

    main.drawImage(ctxs.clark.canvas, 0, 0);

    if (state.scrollProgress > 0.01) {
        main.globalAlpha = state.scrollProgress;
        main.drawImage(ctxs.super.canvas, 0, 0);
        main.globalAlpha = 1.0;
    }

    if (state.particles.length > 0) {
        mask.clearRect(0, 0, w, h);

        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life *= 0.96;
            p.size *= 0.98;

            if (p.life < 0.01) {
                state.particles.splice(i, 1);
                continue;
            }

            mask.globalAlpha = p.life;
            mask.drawImage(ctxs.brush.canvas, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
        }
        mask.globalAlpha = 1.0;

        mask.globalCompositeOperation = 'source-in';
        mask.drawImage(ctxs.super.canvas, 0, 0);
        mask.globalCompositeOperation = 'source-over';

        main.drawImage(ctxs.mask.canvas, 0, 0);
    }
}

function hexToRgb(hex) {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `${r}, ${g}, ${b}`;
}

function handleResize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    // Canvas resizing
    [DOM.canvas.main, ctxs.clark.canvas, ctxs.super.canvas, ctxs.mask.canvas].forEach(c => {
        c.width = state.width;
        c.height = state.height;
    });

    const rect = DOM.canvas.main.getBoundingClientRect();
    state.canvasRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
    };

    if (state.assets.clark && state.assets.superman) prepareBackgrounds();
    if (state.vanta) state.vanta.resize(); // Vanta resize only if it successfully initialized

    // --- RESPONSIVE LOGIC ADDITION ---
    // Recalculate horizontal track explicitly
    if (DOM.timeline.track) {
        DOM.timeline.track.style.width = 'max-content'; // Ensure it expands
    }
}

function handleMouseMove(e) {
    const scaleX = state.width / state.canvasRect.width;
    const scaleY = state.height / state.canvasRect.height;

    const x = (e.clientX - state.canvasRect.left) * scaleX;
    const y = (e.clientY - state.canvasRect.top) * scaleY;

    if (!state.mouse.active) {
        state.mouse.x = x;
        state.mouse.y = y;
        state.brushSize = 0;
    }

    state.mouse.tx = x;
    state.mouse.ty = y;
    state.mouse.active = true;

    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => { state.mouse.active = false; }, CONFIG.canvas.idleTimeout);
}

function prepareBackgrounds() {
    const w = state.width;
    const h = state.height;
    const { clark, super: sup } = ctxs;

    if (state.assets.clark) {
        drawImageProp(clark, state.assets.clark, 0, 0, w, h);
        clark.globalCompositeOperation = 'saturation';
        clark.fillStyle = 'black';
        clark.fillRect(0, 0, w, h);
        clark.globalCompositeOperation = 'multiply';
        clark.fillStyle = '#444';
        clark.fillRect(0, 0, w, h);
        clark.globalCompositeOperation = 'source-over';
    } else {
        clark.fillStyle = '#222';
        clark.fillRect(0, 0, w, h);
    }

    if (state.assets.superman) {
        sup.clearRect(0, 0, w, h);
        drawImageProp(sup, state.assets.superman, 0, 0, w, h);
        sup.fillStyle = 'rgba(0,0,0,0.2)';
        sup.fillRect(0, 0, w, h);
    }
}

function createBrushTip() {
    const s = CONFIG.canvas.brushSize * 2;
    ctxs.brush.canvas.width = s;
    ctxs.brush.canvas.height = s;

    const grad = ctxs.brush.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctxs.brush.fillStyle = grad;
    ctxs.brush.beginPath();
    ctxs.brush.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    ctxs.brush.fill();
}

function drawImageProp(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5) {
    if (!img) return;
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


function initMarqueeSystem() {
    const container = document.getElementById('marqueeSystem');
    const settings = {
        lineCount: 8,
        textPrimary: "MAN OF STEEL SUPERMAN MAN OF STEEL SUPERMAN",
        textSecondary: "KAL-EL KRYPTON HOPE KAL-EL KRYPTON HOPE"
    };

    container.innerHTML = '';

    for (let i = 0; i < settings.lineCount; i++) {
        const isEven = i % 2 === 0;
        const direction = isEven ? 'right' : 'left';
        const textContent = isEven ? settings.textPrimary : settings.textSecondary;

        const line = document.createElement('div');
        line.classList.add('marquee-line', `marquee-line--${direction}`);

        const createTrack = () => {
            const track = document.createElement('div');
            track.classList.add('marquee-track');

            const span1 = document.createElement('span');
            span1.classList.add('marquee-text');
            span1.innerText = textContent;

            const span2 = document.createElement('span');
            span2.classList.add('marquee-text');
            span2.innerText = textContent;

            track.appendChild(span1);
            track.appendChild(span2);
            return track;
        };

        line.appendChild(createTrack());
        line.appendChild(createTrack());

        container.appendChild(line);
    }
}

function setupObservers() {
    const opts = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('active');
                }, i * 100);
                observer.unobserve(entry.target);
            }
        });
    }, opts);

    DOM.archive.cards.forEach(card => {
        card.classList.add('reveal-up');
        observer.observe(card);
    });

    if (DOM.archive.header) {
        Array.from(DOM.archive.header.children).forEach(child => {
            child.classList.add('reveal-up');
            observer.observe(child);
        });
    }

    const gangHeader = document.querySelector('.gang-header');
    if (gangHeader) {
        Array.from(gangHeader.children).forEach((child, i) => {
            child.classList.add('reveal-up');
            child.style.transitionDelay = `${i * 100}ms`;
            observer.observe(child);
        });
    }

    const gangDeck = document.querySelector('.gang-deck');
    if (gangDeck) {
        gangDeck.classList.add('reveal-up');
        observer.observe(gangDeck);
    }
}

function generatePhantomZone() {
    const container = DOM.archive.bg;
    if (!container) return;

    container.innerHTML = '';
    if (state.archiveRequestFrame) cancelAnimationFrame(state.archiveRequestFrame);

    const canvas = document.createElement('canvas');
    canvas.className = 'archive-canvas';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let w, h;
    let particles = [];

    const colNode = hexToRgb(CONFIG.colors.archiveNode);
    const colLine = hexToRgb(CONFIG.colors.archiveLine);

    const resize = () => {
        w = container.offsetWidth;
        h = container.offsetHeight;
        canvas.width = w;
        canvas.height = h;
        initParticles();
    };

    class DataNode {
        constructor() {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.vx = (Math.random() - 0.5) * CONFIG.archive.speed;
            this.vy = (Math.random() - 0.5) * CONFIG.archive.speed;
            this.size = Math.random() * 2 + 1;
            this.isDiamond = Math.random() < CONFIG.archive.diamondChance;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > w) this.vx *= -1;
            if (this.y < 0 || this.y > h) this.vy *= -1;
        }

        draw() {
            ctx.fillStyle = `rgba(${colNode}, ${this.size * 0.15})`;
            ctx.beginPath();
            if (this.isDiamond) {
                ctx.moveTo(this.x, this.y - this.size);
                ctx.lineTo(this.x + this.size, this.y);
                ctx.lineTo(this.x, this.y + this.size);
                ctx.lineTo(this.x - this.size, this.y);
            } else {
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    }

    function initParticles() {
        particles = [];
        const count = window.innerWidth < 768
            ? CONFIG.archive.countMobile
            : CONFIG.archive.count;

        for (let i = 0; i < count; i++) {
            particles.push(new DataNode());
        }
    }

    let frameCounter = 0;
    const throttleRate = 2;

    function animate() {
        state.archiveRequestFrame = requestAnimationFrame(animate); // Always request next frame

        const rect = container.getBoundingClientRect();
        const isVisible = (rect.bottom > 0 && rect.top < window.innerHeight);

        if (isVisible && frameCounter % throttleRate === 0) {
            ctx.clearRect(0, 0, w, h);

            particles.forEach(p => {
                p.update();
                p.draw();
            });

            const maxDist = CONFIG.archive.connectionDist;

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.hypot(dx, dy);

                    if (dist < maxDist) {
                        const opacity = 1 - (dist / maxDist);
                        ctx.strokeStyle = `rgba(${colLine}, ${opacity * 0.15})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        } else if (!isVisible) {
            frameCounter = -1; // Set to -1 because it will be incremented to 0
        }
        frameCounter++;
    }

    window.addEventListener('resize', resize);
    resize();
    animate();
}

function setupLinks() {
    const elements = document.querySelectorAll('.footer-links a, .portfolio-link__name');

    elements.forEach(element => {
        const text = element.textContent.trim();
        const hoverText = element.dataset.hover || text;
        element.innerHTML = '';
        if (element.classList.contains('portfolio-link__name')) {
            // Keep data-hover for portfolio, remove for footer links
        } else {
            element.removeAttribute('data-hover');
        }

        // Split text into characters
        const chars = text.split('');
        const hoverChars = hoverText.split('');

        chars.forEach((char, index) => {
            // Create container for the character pair
            const container = document.createElement('span');
            container.className = 'char-box';
            container.style.setProperty('--i', index); // Index for stagger delay

            // Handle spaces explicitly
            const displayChar = char === ' ' ? '&nbsp;' : char;
            const hoverChar = hoverChars[index] === ' ' ? '&nbsp;' : (hoverChars[index] || displayChar);

            // Top letter (Initial)
            const topSpan = document.createElement('span');
            topSpan.className = 'char-top';
            topSpan.innerHTML = displayChar;

            // Bottom letter (Hover state)
            const bottomSpan = document.createElement('span');
            bottomSpan.className = 'char-bottom';
            bottomSpan.innerHTML = hoverChar;

            container.appendChild(topSpan);
            container.appendChild(bottomSpan);
            element.appendChild(container);
        });
    });
}

init();
