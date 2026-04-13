const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 450;

let gameState = 'OVERWORLD';
let battleTurn = 'MENU'; // MENU, PLAYER_ACTION, ENEMY_ATTACK, DIALOGUE
let currentAttack = 0;
let projectiles = [];
let attackTimer = 0;
let itemUsedThisTurn = false;
let isGameOver = false;
let platforms = [];
let flag = null;
let flagCaught = false;
let platformPhaseActive = false;
let penaltyActive = false;
let isMenuLocked = false;
let lastInputTime = Date.now();
let isEnemyAsleep = false;
let debugMode = false;
let debugMessage = "";
let debugTimer = 0;

const assets = {
    playerColor: '#39ff14',
    soulColor: '#ff0000',
    enemyColor: '#8a2be2',
    eyeColor: '#fff'
};

const player = {
    x: 300,
    y: 200,
    width: 30,
    height: 45,
    hp: 20,
    maxHp: 20,
    speed: 4,
    soulX: 0,
    soulY: 0,
    vY: 0,
    onGround: false,
    soulMode: 'RED', // RED or BLUE
    damageCooldown: 0
};

const enemy = {
    x: 270,
    y: 50,
    width: 100,
    height: 100,
    hp: 100,
    name: 'Gölge Göz',
    isTired: false,
    isDead: false,
    opacity: 1
};

const keys = {};
const inventory = ["Elma", "Ekmek", "Su"];

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    lastInputTime = Date.now(); // Tuşa basıldığında uyku sayacı sıfırlanır

    // Debug Modu Kombinasyonu: Ctrl + 6
    if (e.ctrlKey && e.code === 'Digit6') {
        debugMode = !debugMode;
        debugMessage = `debug mode ${debugMode ? "on" : "off"}`;
        debugTimer = 105; // 1.75 saniye (60fps * 1.75)
    }

    // Debug Kısayolu: Ctrl + 9 (Final Saldırı ve Uykuya Geçiş)
    if (e.ctrlKey && e.code === 'Digit9') {
        currentAttack = 14; // Bir sonraki saldırı 15 olacak
        if (gameState !== 'BATTLE') startBattle();
        else startEnemyTurn();
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

function shakeButton(id) {
    const btn = document.getElementById(id);
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 500);
}

// Menü butonlarını bağla
document.getElementById('btn-fight').onclick = () => {
    if (isMenuLocked) {
        if (isEnemyAsleep) {
            enemy.isDead = true;
            showDialogue("* -99999", () => {
                showDialogue("Gölge Göz: 'Demek sonumuz böyleymiş...'", () => {
                    alert("KAZANDIN!");
                    location.reload();
                });
            });
            return;
        }
        shakeButton('btn-fight'); return;
    }
    handleMenuAction('Saldırmaya çalıştın ama Gölge Göz çok hızlı!');
};
document.getElementById('btn-act').onclick = () => {
    if (isMenuLocked) { shakeButton('btn-act'); return; }
    handleMenuAction('Gölge Göz\'ün bakışlarını inceledin. Ürpertici.');
};
document.getElementById('btn-item').onclick = () => {
    if (isMenuLocked) { shakeButton('btn-item'); return; }
    showItemMenu();
};
document.getElementById('btn-mercy').onclick = () => {
    if (isMenuLocked) { shakeButton('btn-mercy'); return; }
    if (enemy.isTired) {
        isGameOver = true;
        battleTurn = 'DIALOGUE';
        showDialogue("Gölge Göz: 'Gafil avlandın.'", () => {
            // Kıçını kurtaramayacağın son saldırı
            projectiles = [];
            for(let i=0; i<50; i++) spawnProjectile(Math.random()*canvas.width, Math.random()*canvas.height, 0, 0);
            const deathInterval = setInterval(() => {
                player.hp -= 2;
                updateUI();
                if (player.hp <= 0) clearInterval(deathInterval);
            }, 50);
        });
    } else {
        handleMenuAction('Bağışlamak için henüz erken görünüyor.');
    }
};

function showItemMenu() {
    if (battleTurn !== 'MENU') return;
    const content = document.getElementById('text-content');
    content.innerHTML = inventory.map(item => `<span class="item-option">* ${item}</span>`).join(" ");
    
    const options = content.querySelectorAll('.item-option');
    options.forEach(opt => {
        opt.onclick = (e) => {
            const itemName = e.target.innerText.replace("* ", "");
            useItem(itemName);
        };
    });
}

function useItem(name) {
    const healAmount = 7;
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHeal = Math.round(player.hp - oldHp);

    // Eşyayı envanterden sil
    const index = inventory.indexOf(name);
    if (index > -1) {
        inventory.splice(index, 1);
    }
    
    itemUsedThisTurn = true;
    updateUI();
    handleMenuAction(`${name} yedin! ${actualHeal} HP kazandın.`);
}

function handleMenuAction(text) {
    if (battleTurn !== 'MENU') return;
    battleTurn = 'PLAYER_ACTION';
    document.getElementById('battle-menu').classList.add('hidden');
    showDialogue(text, () => {
        startEnemyTurn();
    });
}

function showDialogue(text, callback) {
    const content = document.getElementById('text-content');
    content.innerHTML = "";
    let i = 0;
    const timer = setInterval(() => {
        if (i < text.length) {
            content.innerHTML += text.charAt(i);
            i++;
        } else {
            clearInterval(timer);
            setTimeout(() => {
                if (callback) callback();
            }, 1000);
        }
    }, 30);
}

function update() {
    if (gameState === 'OVERWORLD') {
        if (keys['ArrowUp'] || keys['KeyW']) player.y -= player.speed;
        if (keys['ArrowDown'] || keys['KeyS']) player.y += player.speed;
        if (keys['ArrowLeft'] || keys['KeyA']) player.x -= player.speed;
        if (keys['ArrowRight'] || keys['KeyD']) player.x += player.speed;

        player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
        player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

        let dx = (player.x + player.width/2) - (enemy.x + 50);
        let dy = (player.y + player.height/2) - (enemy.y + 50);
        if (Math.sqrt(dx*dx + dy*dy) < 60) {
            startBattle();
        }
    } else if (gameState === 'BATTLE' && (battleTurn === 'ENEMY_ATTACK' || isGameOver || isMenuLocked)) {
        updateBattleSoul();
        updateProjectiles();
        
        // Uyku kontrolü (Hidden timer)
        if (isMenuLocked && !isEnemyAsleep && Date.now() - lastInputTime > 25000) {
            isEnemyAsleep = true;
            showDialogue("* Gölge Göz derin bir uykuya daldı...");
            // Uyuduğunda diğer butonları gizle
            document.getElementById('btn-act').classList.add('hidden');
            document.getElementById('btn-item').classList.add('hidden');
            document.getElementById('btn-mercy').classList.add('hidden');
        }
        if (enemy.isDead && enemy.opacity > 0) enemy.opacity -= 0.01;
    }
}

function startBattle() {
    gameState = 'BATTLE';
    battleTurn = 'MENU';
    player.soulX = canvas.width / 2;
    player.soulY = 250;
    document.getElementById('battle-menu').classList.remove('hidden');
    document.getElementById('status-bar').classList.remove('hidden');
    showDialogue("Gölge Göz ile karşılaştın!");
}

function startEnemyTurn() {
    battleTurn = 'ENEMY_ATTACK';
    projectiles = [];
    attackTimer = 0;
    flagCaught = false;
    platformPhaseActive = false;
    penaltyActive = false;
    player.soulMode = 'RED';
    
    // Eşya kullanıldıysa kolay saldırı (0), yoksa sıradaki saldırı
    const attackToExecute = itemUsedThisTurn ? 0 : (currentAttack % 15) + 1;
    const duration = itemUsedThisTurn ? 5000 : getAttackDuration(attackToExecute);

    if (!itemUsedThisTurn) currentAttack++;
    itemUsedThisTurn = false;

    if (currentAttack >= 7) {
        enemy.isTired = true;
    }

    initAttack(attackToExecute);
    
    setTimeout(() => {
        // Platform aşaması kontrolü
        if (platformPhaseActive && !flagCaught) {
            triggerPenalty();
            return; // Cezalandırma bitene kadar menüye dönme
        }
        finishTurn();
    }, duration);
}

function getAttackDuration(id) {
    if (id === 15) return 12500; // 2.5s bekleme + 10s aksiyon
    return 15000; // Tüm saldırılar 15 saniye sürer
}

function triggerPenalty() {
    penaltyActive = true;
    showDialogue("* Bayrağı kaçırdın! Kaçmaya çalış!", () => {
        setTimeout(() => {
            penaltyActive = false;
            finishTurn();
        }, 4000); // Ceza süresi
    });
}

function finishTurn() {
    if (isGameOver) return;
    if (currentAttack >= 15) {
        isMenuLocked = true;
    }
    battleTurn = 'MENU';
    projectiles = [];
    if (!isMenuLocked) {
        document.getElementById('battle-menu').classList.remove('hidden');
        document.getElementById('btn-act').classList.remove('hidden');
        document.getElementById('btn-item').classList.remove('hidden');
        document.getElementById('btn-mercy').classList.remove('hidden');
    }
    let msg = enemy.isTired ? "* Gölge Göz'ün göz kapakları ağırlaşıyor..." : "* Gölge Göz sana dik dik bakıyor...";
    if (isMenuLocked) msg = "* ...";
    showDialogue(msg);
}

function initAttack(id) {
    const box = { x: canvas.width/2 - 100, y: 150, size: 200 };
    player.soulX = canvas.width / 2;
    player.soulY = 250;

    if (id === 0) {
        for(let i=0; i<3; i++) spawnProjectile(box.x + 20 + i*60, 0, 0, 3);
    } else if (id === 15) {
        // Güvenli başlangıç noktası (Kutunun sol üst köşesi)
        player.soulX = box.x + 20;
        player.soulY = box.y + 20;
        // 2.5 saniye bekleme süresi
        setTimeout(() => {
            if (battleTurn === 'ENEMY_ATTACK') {
                projectiles.push({ type: 'rotating_plus', angle: 0, timer: 0 });
            }
        }, 2500);
    } else if (id === 7) {
        // Yorulma saldırısı: Çok yavaş ve az mermi
        const interval = setInterval(() => {
            if (battleTurn !== 'ENEMY_ATTACK') { clearInterval(interval); return; }
            spawnProjectile(Math.random() * canvas.width, 0, 0, 1.5);
        }, 1000);
    } else {
        const interval = setInterval(() => {
            if (battleTurn !== 'ENEMY_ATTACK') { clearInterval(interval); return; }
            
            let speed = enemy.isTired ? 10 : 4;
            let size = enemy.isTired ? 20 : 10;

            if (id % 2 === 0) {
                spawnProjectile(Math.random() * canvas.width, 0, (Math.random()-0.5)*2, speed, size);
            } else {
                spawnProjectile(0, Math.random() * canvas.height, speed, (Math.random()-0.5)*2, size);
            }

            // Arada bir Blaster Göz (Patlamalı) çıkar
            if (Math.random() < 0.15) {
                spawnExplodingEye(player.soulX, player.soulY);
            }
        }, 300);
    }
}

function spawnProjectile(x, y, vx, vy, size = 10) {
    projectiles.push({ x, y, vx, vy, size: size, type: 'eye' });
}

function spawnExplodingEye(x, y) {
    projectiles.push({ x, y, type: 'exploding_eye', timer: 0, exploded: false });
}

function spawnBlasterCircle() {
    for(let i=0; i<12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 150;
        projectiles.push({
            x: canvas.width/2 + Math.cos(angle) * dist,
            y: 250 + Math.sin(angle) * dist,
            type: 'blaster',
            angle: angle + Math.PI,
            timer: 0
        });
    }
}

function updateProjectiles() {
    if (player.damageCooldown > 0) player.damageCooldown--;

    projectiles.forEach(p => {
        if (p.type === 'eye') {
            p.x += p.vx;
            p.y += p.vy;
        } else if (p.type === 'blaster') {
            p.timer++;
        } else if (p.type === 'exploding_eye') {
            p.timer++;
            if (p.timer >= 42 && !p.exploded) { // 0.7s (60fps * 0.7 = 42)
                p.exploded = true;
                let dx = p.x - player.soulX;
                let dy = p.y - player.soulY;
                if (Math.sqrt(dx*dx + dy*dy) < 60) takeDamage(3);
            }
            if (p.timer > 60) projectiles = projectiles.filter(item => item !== p);
        } else if (p.type === 'spinning_blaster') {
            p.angle += 0.05;
            p.x = canvas.width/2 + Math.cos(p.angle) * 120;
            p.y = 250 + Math.sin(p.angle) * 120;
            p.timer++;
            
            // Işın atıp kalma mantığı (Sans tarzı)
            if (p.timer === 42) { // Patlama anı
                let dx = p.x - player.soulX;
                let dy = p.y - player.soulY;
                if (Math.sqrt(dx*dx + dy*dy) < 60) takeDamage(3);
            }
        } else if (p.type === 'rotating_plus') {
            const box = { x: canvas.width/2 - 100, y: 150, size: 200 };
            const centerX = box.x + box.size / 2;
            const centerY = box.y + box.size / 2;
            p.angle += 0.02; // Oyuncudan biraz daha yavaş dönüş (oyuncu hızı ~0.03 rad/frame eşdeğeri)
            
            // Çarpışma kontrolü (Rotasyonel koordinat sistemine çevirerek)
            let dx = player.soulX - centerX;
            let dy = player.soulY - centerY;
            const cos = Math.cos(-p.angle);
            const sin = Math.sin(-p.angle);
            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;
            
            const thickness = 12;
            const halfLen = box.size / 2;
            if ((Math.abs(rx) < halfLen && Math.abs(ry) < thickness/2) ||
                (Math.abs(ry) < halfLen && Math.abs(rx) < thickness/2)) {
                if (player.damageCooldown <= 0) {
                    takeDamage(3);
                    player.damageCooldown = 18; // 0.3 saniye (60 FPS üzerinden 18 frame)
                }
            }
        }

        // Çarpışma kontrolü
        if (p.type === 'eye') {
            let dx = p.x - player.soulX;
            let dy = p.y - player.soulY;
            if (Math.sqrt(dx*dx + dy*dy) < (p.size || 10) + 5) takeDamage(0.1);
        }
        
        // Blaster ışın çarpışması
        if (p.type === 'blaster' && p.timer > 60 && p.timer < 90) {
            // Işın hattı kontrolü (basitleştirilmiş)
            let beamAngle = p.angle;
            let toSoulAngle = Math.atan2(player.soulY - p.y, player.soulX - p.x);
            if (Math.abs(beamAngle - toSoulAngle) < 0.1) takeDamage();
        }
    });
}

function takeDamage(amt) {
    if (debugMode) return; // Debug modu aktifse hasar alma
    let baseDamage = amt || (penaltyActive ? 0.5 : 0.1);
    player.hp -= baseDamage;
    if (player.hp < 0) player.hp = 0;
    updateUI();
}

function updateUI() {
    const hpPercent = (player.hp / player.maxHp) * 100;
    document.getElementById('hp-bar').style.width = hpPercent + "%";
    document.getElementById('hp-text').innerText = Math.ceil(player.hp) + " / " + player.maxHp;
    if (player.hp <= 0) {
        alert("RUHUN PARÇALANDI...");
        location.reload();
    }
}

function updateBattleSoul() {
    const box = { x: canvas.width/2 - 100, y: 150, size: 200 };
    const moveSpeed = 3;

    if (player.soulMode === 'RED') {
        if (keys['ArrowUp'] || keys['KeyW']) player.soulY -= moveSpeed;
        if (keys['ArrowDown'] || keys['KeyS']) player.soulY += moveSpeed;
    } else if (player.soulMode === 'BLUE') {
        // Yerçekimi
        player.vY += 0.2;
        player.soulY += player.vY;
        player.onGround = false;

        // Platform ve Kutu Altı Çarpışma
        if (player.soulY > box.y + box.size - 10) {
            player.soulY = box.y + box.size - 10;
            player.vY = 0;
            player.onGround = true;
        }

        platforms.forEach(plat => {
            if (player.soulX > plat.x && player.soulX < plat.x + plat.w &&
                player.soulY > plat.y - 10 && player.soulY < plat.y + 10 && player.vY > 0) {
                player.soulY = plat.y - 10;
                player.vY = 0;
                player.onGround = true;
            }
        });

        if ((keys['ArrowUp'] || keys['KeyW']) && player.onGround) {
            player.vY = -5;
            player.onGround = false;
        }
    }

    if (keys['ArrowLeft'] || keys['KeyA']) player.soulX -= moveSpeed;
    if (keys['ArrowRight'] || keys['KeyD']) player.soulX += moveSpeed;

    player.soulX = Math.max(box.x + 10, Math.min(box.x + box.size - 10, player.soulX));
    if (player.soulMode === 'RED' || isMenuLocked) player.soulY = Math.max(box.y + 10, Math.min(box.y + box.size - 10, player.soulY));
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0,0, canvas.width, canvas.height);
    if (gameState === 'OVERWORLD') {
        drawOverworld();
    } else if (gameState === 'BATTLE') {
        drawBattle();
    }

    // Debug Mesajı Çizimi
    if (debugTimer > 0) {
        ctx.fillStyle = "white";
        ctx.font = "14px 'Press Start 2P'";
        ctx.fillText(debugMessage, 20, 40);
        debugTimer--;
    }
}

function drawOverworld() {
    // Oyuncu: Neon Yeşil Gezgin (Daha detaylı model)
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    ctx.save();
    // Vücut
    ctx.fillStyle = assets.playerColor;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(px, py + ph * 0.4, pw, ph * 0.5, 5);
    else ctx.fillRect(px, py + ph * 0.4, pw, ph * 0.5);
    ctx.fill();
    
    // Kafa
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph * 0.25, pw / 2, 0, Math.PI * 2);
    ctx.fill();

    // Atkı (Parlak Mavi)
    ctx.fillStyle = "#00ccff";
    ctx.fillRect(px, py + ph * 0.35, pw, 5);
    
    // Gözler
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(px + pw * 0.3, py + ph * 0.2, 2, 0, Math.PI * 2);
    ctx.arc(px + pw * 0.7, py + ph * 0.2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Düşman: Mor Gölge Göz (Overworld versiyonu)
    const ex = enemy.x + 50;
    const ey = enemy.y + 50;
    
    ctx.save();
    const time = Date.now() / 400;
    ctx.fillStyle = "rgba(138, 43, 226, 0.3)";
    ctx.beginPath();
    ctx.arc(ex, ey, 50 + Math.sin(time) * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = assets.enemyColor;
    ctx.beginPath();
    ctx.arc(ex, ey, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(ex, ey, 25, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(ex, ey, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = "center";
    ctx.fillText(enemy.name, ex, ey - 55);
    ctx.restore();
}

function drawBattle() {
    const box = { x: canvas.width/2 - 100, y: 150, size: 200 };

    // Savaş kutusuna hafif bir parlama ekleyelim
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
    ctx.strokeStyle = debugMode ? "#0f0" : "white";
    ctx.lineWidth = 4;
    ctx.strokeRect(box.x, box.y, box.size, box.size);
    ctx.shadowBlur = 0;

    if (battleTurn === 'MENU') return;

    // Düşman çizimi (Tired durumunda sallanır)
    const wobble = enemy.isTired ? Math.sin(Date.now()/500)*5 : 0;
    drawEnemyModel(enemy.x + 50 + wobble, enemy.y + 50);

    // Platformları çiz
    if (platformPhaseActive) {
        ctx.fillStyle = "#00f";
        platforms.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));
        if (flag && !flagCaught) {
            ctx.fillStyle = "yellow";
            ctx.fillRect(flag.x, flag.y, flag.w, flag.h);
            ctx.fillStyle = "black";
            ctx.font = "10px Arial";
            ctx.fillText("FINISH", flag.x, flag.y + 20);
        }
    }

    drawSoul(player.soulX, player.soulY);
    
    projectiles.forEach(p => {
        if (p.type === 'eye') {
            drawEye(p.x, p.y, p.size);
        } else if (p.type === 'rotating_plus') {
            const centerX = box.x + box.size / 2;
            const centerY = box.y + box.size / 2;
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(p.angle);
            
            // Dış Enerji Halesi (Outer Glow)
            ctx.shadowBlur = 20;
            ctx.shadowColor = "#ff0000";
            ctx.fillStyle = "rgba(255, 0, 0, 0.6)";
            ctx.fillRect(-box.size/2, -8, box.size, 16);
            ctx.fillRect(-8, -box.size/2, 16, box.size);
            
            // İç Enerji Çekirdeği (Core)
            ctx.shadowBlur = 5;
            ctx.shadowColor = "white";
            ctx.fillStyle = "white";
            ctx.fillRect(-box.size/2, -2, box.size, 4);
            ctx.fillRect(-2, -box.size/2, 4, box.size);
            ctx.restore();
        } else if (p.type === 'exploding_eye' || p.type === 'spinning_blaster') {
            ctx.save();
            // Patlamadan hemen önce kırmızı yanıp söner
            ctx.fillStyle = (p.timer % 10 < 5 && p.timer < 42) ? "red" : assets.enemyColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 25, 0, Math.PI*2);
            ctx.fill();
            
            if (p.type === 'exploding_eye' && p.timer >= 42) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
                ctx.beginPath();
                ctx.arc(p.x, p.y, 60, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }
        else if (p.type === 'blaster') {
            ctx.fillStyle = p.timer > 60 ? 'white' : 'red';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size || 10, 0, Math.PI*2);
            ctx.fill();
            
            if (p.timer > 60 && p.timer < 90) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = (p.size || 10) * 2;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + Math.cos(p.angle)*1000, p.y + Math.sin(p.angle)*1000);
                ctx.stroke();
            }
        }
    });
}

function drawEnemyModel(x, y) {
    ctx.fillStyle = assets.enemyColor;
    ctx.beginPath();
    ctx.arc(x, y, 45, 0, Math.PI * 2);
    ctx.fill();
    // Büyük göz bebeği
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(x, y, 30, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
}

function drawEye(x, y, size) {
    // Göz akı (Gradyan ile daha derin)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
    grad.addColorStop(0, "white");
    grad.addColorStop(1, "#ccc");
    
    ctx.fillStyle = grad;
    ctx.shadowBlur = 5;
    ctx.shadowColor = "white";
    ctx.beginPath();
    ctx.moveTo(x - size * 1.5, y);
    ctx.quadraticCurveTo(x, y - size, x + size * 1.5, y);
    ctx.quadraticCurveTo(x, y + size, x - size * 1.5, y);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Göz bebeği (Ruhu takip eder)
    const angle = Math.atan2(player.soulY - y, player.soulX - x);
    const pupilX = x + Math.cos(angle) * (size * 0.4);
    const pupilY = y + Math.sin(angle) * (size * 0.4);

    ctx.fillStyle = assets.enemyColor;
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawSoul(x, y) {
    // Mavi modda ruh rengini değiştir
    ctx.fillStyle = player.soulMode === 'BLUE' ? '#00f' : assets.soulColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - 8, x - 12, y - 8, x - 12, y);
    ctx.bezierCurveTo(x - 12, y + 12, x, y + 16, x, y + 20);
    ctx.bezierCurveTo(x, y + 16, x + 12, y + 12, x + 12, y);
    ctx.bezierCurveTo(x + 12, y - 8, x, y - 8, x, y);
    ctx.fill();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();