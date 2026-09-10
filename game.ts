// Tipi per non sbroccare con la griglia
interface YGOCard {
    id: number;
    name: string;
    atk: number;
    def: number;
    image_url: string;
}
 
interface Enemy {
    card: YGOCard;
    stunTurns: number;
}
 
// Stato Globale (un po' brutto tenerle così ma per un file singolo va benissimo)
let playerName: string = "Player";
let hp: number = 10000;
let pe: number = 0;
let score: number = 0;
let turn: number = 1;
let enemiesDestroyed: number = 0;
let numRows: number = 3;
let enemiesPerTurn: number = 1;
const cols: number = 7;
 
let deck: YGOCard[] = []; // Pool di mostri scaricati
let hand: YGOCard[] = [];
let grid: (Enemy | null)[][] = []; // array 2D
let selectedCardIndex: number | null = null;
 
// Riferimenti DOM
const domGrid = document.getElementById('grid-area')!;
const domHand = document.getElementById('hand-area')!;
const domHP = document.getElementById('base-hp')!;
const domPE = document.getElementById('pe')!;
const domScore = document.getElementById('score')!;
const domTurn = document.getElementById('turn')!;
const domIncoming = document.querySelector('#incoming-dmg span')!;
 
// INIT
async function initGame() {
    const params = new URLSearchParams(window.location.search);
    playerName = params.get('player') || 'Anonimo';
    document.querySelector('#player-name span')!.textContent = playerName;
 
    await fetchCardPool();
    initGrid();
    // Pesca iniziale di 7 carte
    for(let i=0; i<7; i++) drawCard();
    renderHand();
    renderGrid();
    updateUI();
    setupListeners();
}
 
// Prendo un tot di mostri normali per assicurarmi che abbiano ATK e DEF
async function fetchCardPool() {
    try {
        const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?type=normal%20monster');
        const data = await res.json();
        // Mappo solo i dati che mi servono
        deck = data.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            atk: c.atk,
            def: c.def,
            image_url: c.card_images[0].image_url_small
        }));
    } catch (e) {
        alert("Errore API YGO. Ricarica la pagina.");
    }
}
 
function getRandomCard(): YGOCard {
    const idx = Math.floor(Math.random() * deck.length);
    return deck[idx];
}
 
function initGrid() {
    grid = [];
    for (let r = 0; r < numRows; r++) {
        const row = new Array(cols).fill(null);
        grid.push(row);
    }
}
 
// LOGICA DI GIOCO
function drawCard() {
    if (hand.length < 10) {
        hand.push(getRandomCard());
    }
}
 
function playCardOnRow(rowIndex: number) {
    if (selectedCardIndex === null) return;
    const defender = hand[selectedCardIndex];
    // Logica combattimento
    // Trovo tutti i nemici sulla riga
    let enemiesOnRow = [];
    for (let c = 0; c < cols; c++) {
        if (grid[rowIndex][c]) enemiesOnRow.push({ col: c, enemy: grid[rowIndex][c]! });
    }
 
    if (enemiesOnRow.length === 0) {
        alert("Nessun nemico su questa riga!");
        return;
    }
 
    // Se l'attacco copre più nemici? Sommo le loro difese per vedere se li sfonda tutti (come da traccia "coprire l'attacco di più nemici")
    let totalDef = enemiesOnRow.reduce((sum, e) => sum + e.enemy.card.def, 0);
 
    if (defender.atk > totalDef && enemiesOnRow.length > 1) {
        // Distrugge tutti ma sparisce
        enemiesOnRow.forEach(e => {
            grid[rowIndex][e.col] = null;
            onEnemyDestroyed(defender.atk, e.enemy.card.def);
        });
    } else {
        // Attacca il primo nemico della fila (il più vicino al castello)
        const firstTarget = enemiesOnRow[0];
        if (defender.atk > firstTarget.enemy.card.def) {
            grid[rowIndex][firstTarget.col] = null;
            onEnemyDestroyed(defender.atk, firstTarget.enemy.card.def);
            // Il difensore non si consuma se non esplicitato? Nella traccia non dice che sparisce se vince singolo. 
            // Assumo rimanga "virtuale" e lo rimuovo dalla mano comunque.
        } else {
            // Non ha abbastanza attacco -> Stun di 2 turni per lui e chi gli sta dietro
            enemiesOnRow.forEach(e => e.enemy.stunTurns = 2);
        }
    }
 
    hand.splice(selectedCardIndex, 1);
    selectedCardIndex = null;
    renderHand();
    renderGrid();
    updateUI();
}
 
function onEnemyDestroyed(PA: number, PD: number) {
    pe += 1;
    enemiesDestroyed += 1;
    // Formula traccia: 1 - ((PA-PD) / PA) * PA * STAGE (uso turn come STAGE)
    // Nota: la formula matematica ridotta sarebbe PD * Stage. Uso quella letterale.
    const precision = 1 - ((PA - PD) / PA);
    let pts = Math.floor(precision * PA * turn);
    if(pts < 0) pts = 1; // evitiamo punteggi negativi se fa calcoli strani
    score += pts;
 
    // Check level up nemici
    if (enemiesDestroyed % 10 === 0) enemiesPerTurn++;
}
 
function processTurn() {
    // 1. Spostamento nemici e danni
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            if (cell) {
                if (cell.stunTurns > 0) {
                    cell.stunTurns--;
                    continue; // fermo
                }
 
                // Se è all'ultima colonna prima del castello (col 0)
                if (c === 0) {
                    hp -= cell.card.atk;
                    grid[r][c] = null;
                    if (hp <= 0) gameOver();
                } else {
                    // Si sposta avanti se libero
                    if (!grid[r][c - 1]) {
                        grid[r][c - 1] = cell;
                        grid[r][c] = null;
                    }
                }
            }
        }
    }
 
    // 2. Generazione nuovi nemici (a colonna cols-1)
    for(let i=0; i<enemiesPerTurn; i++){
        // Trova righe libere in ultima colonna
        let freeRows = [];
        for(let r=0; r<numRows; r++) {
            if(!grid[r][cols-1]) freeRows.push(r);
        }
        if(freeRows.length > 0) {
            const randomRow = freeRows[Math.floor(Math.random() * freeRows.length)];
            grid[randomRow][cols-1] = { card: getRandomCard(), stunTurns: 0 };
        }
    }
 
    // 3. Incrementi di turno
    turn++;
    if (turn % 3 === 0) drawCard();
    if (turn % 10 === 0) {
        numRows++;
        grid.push(new Array(cols).fill(null));
    }
 
    renderGrid();
    renderHand();
    updateUI();
}
 
function gameOver() {
    alert(`GAME OVER! Hai totalizzato ${score} punti.`);
    // Salva nel localstorage per la leaderboard
    let lb = JSON.parse(localStorage.getItem('ygo_leaderboard') || '[]');
    lb.push({ name: playerName, score: score });
    lb.sort((a: any, b: any) => parseInt(b.score) - parseInt(a.score));
    lb = lb.slice(0, 10);
    localStorage.setItem('ygo_leaderboard', JSON.stringify(lb));
    window.location.href = `leaderboard.html?score=${score}`;
}
 
// RENDERING
function renderGrid() {
    domGrid.innerHTML = '';
    for (let r = 0; r < numRows; r++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        rowDiv.onclick = () => playCardOnRow(r);
        for (let c = 0; c < cols; c++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell';
            const enemy = grid[r][c];
            if (enemy) {
                const img = document.createElement('img');
                img.src = enemy.card.image_url;
                img.className = `card-mini ${enemy.stunTurns > 0 ? 'stunned' : ''}`;
                img.title = `ATK: ${enemy.card.atk} DEF: ${enemy.card.def}`;
                cellDiv.appendChild(img);
            }
            rowDiv.appendChild(cellDiv);
        }
        domGrid.appendChild(rowDiv);
    }
}
 
function renderHand() {
    // Tengo i bottoni, svuoto le carte
    const bottoni = document.querySelector('.controls')!;
    domHand.innerHTML = '';
    hand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src = card.image_url;
        img.className = 'card-in-hand ' + (selectedCardIndex === index ? 'card-selected' : '');
        img.title = `ATK: ${card.atk} DEF: ${card.def}`;
        img.onclick = () => {
            selectedCardIndex = selectedCardIndex === index ? null : index;
            renderHand();
        };
        domHand.appendChild(img);
    });
    domHand.appendChild(bottoni);
}
 
function updateUI() {
    domHP.innerText = hp.toString();
    domPE.innerText = pe.toString();
    domScore.innerText = score.toString();
    domTurn.innerText = turn.toString();
 
    // Calcolo potenza in arrivo (nemici a colonna 0 non stunnati)
    let incomingDmg = 0;
    for (let r = 0; r < numRows; r++) {
        const cell = grid[r][0];
        if (cell && cell.stunTurns === 0) {
            incomingDmg += cell.card.atk;
        }
    }
    const domIncoming = document.querySelector('#incoming-dmg span') as HTMLElement;
    domIncoming.innerText = incomingDmg.toString();
}
 
// BOTTONI
function setupListeners() {
    document.getElementById('btn-end-turn')!.onclick = () => {
        processTurn();
    };
 
    document.getElementById('btn-buy-card')!.onclick = () => {
        if (pe >= 5 && hand.length < 10) {
            pe -= 5;
            drawCard();
            renderHand();
            updateUI();
        } else {
            alert("Non hai abbastanza PE o hai la mano piena (Max 10)!");
        }
    };
 
    document.getElementById('btn-swap-card')!.onclick = () => {
        if (selectedCardIndex === null) {
            alert("Seleziona una carta prima!");
            return;
        }
        if (pe >= 1) {
            pe -= 1;
            hand[selectedCardIndex] = getRandomCard();
            selectedCardIndex = null;
            renderHand();
            updateUI();
        } else {
            alert("Non hai abbastanza PE!");
        }
    };
}
 
// Via
initGame();