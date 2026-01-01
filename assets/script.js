// --- CONFIGURATION ---
const CONFIG = {
    canvas: {
        particleCount: 150,
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
        count: 60,
        countMobile: 30,
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
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    startPreloading().then(() => {
        setupApp();
        setupObservers();
        animate();
    });
}

function startPreloading() {
    document.body.style.overflow = 'hidden';

    const imageKeys = Object.keys(CONFIG.images);
    const assetPromises = imageKeys.map(key => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = CONFIG.images[key];
            img.onload = () => { state.assets[key] = img; resolve(); };
            img.onerror = resolve;
        });
    });

    const domImages = Array.from(document.querySelectorAll('img'));
    const decodePromises = domImages.map(img => {
        return img.decode().catch(() => new Promise(r => { img.onload = r; img.onerror = r; }));
    });

    const vantaPromise = new Promise(resolve => {
        initVanta();
        setTimeout(resolve, 500);
    });

    const allPromises = [...assetPromises, ...decodePromises, vantaPromise, document.fonts.ready];

    let loaded = 0;
    const total = allPromises.length;

    allPromises.forEach(p => p.then(() => {
        loaded++;
        if (DOM.loader.bar) {
            const pct = Math.round((loaded / total) * 100);
            DOM.loader.bar.style.width = `${pct}%`;
        }
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
    const rect = DOM.timeline.section.getBoundingClientRect();
    const vpW = state.width;
    const vpH = state.height;

    const dist = DOM.timeline.section.offsetHeight - vpH;
    const maxTrans = DOM.timeline.track.scrollWidth - vpW;

    let progress = -rect.top / dist;
    progress = Math.max(0, Math.min(1, progress));

    let x = 0;
    if (rect.top > 0) {
        x = (vpW * 0.3) * (1 - Math.max(0, Math.min(1, 1 - (rect.top / vpH))));
    } else {
        x = - (maxTrans * progress);
    }

    DOM.timeline.track.style.transform = `translateX(${x}px)`;
    DOM.timeline.images.forEach(img => img.style.transform = `scale(1.1)`);
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

    if (state.particles.length > CONFIG.canvas.particleCount) {
        state.particles.splice(0, state.particles.length - CONFIG.canvas.particleCount);
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
    if (state.vanta) state.vanta.resize();
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

function initVanta() {
    try {
        if (!DOM.timeline.sticky) return;
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
            speed: 1.0
        });
    } catch (e) {
        console.warn("Vanta failed to init", e);
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

    function animate() {
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

        const rect = container.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
            state.archiveRequestFrame = requestAnimationFrame(animate);
        } else {
            setTimeout(() => {
                state.archiveRequestFrame = requestAnimationFrame(animate);
            }, 500);
        }
    }

    window.addEventListener('resize', resize);
    resize();
    animate();
}

init();
